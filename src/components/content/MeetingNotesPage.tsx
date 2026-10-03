import { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import "ojs/ojbutton";
import { canAccessLocalRecording, createMeetingNoteEntity, listMeetingNotes, syncMeetingNoteShares, updateMeetingNoteEntity, type MeetingNote, type MeetingNoteInput, type MeetingNoteShare } from "../../data/meetingNotesApi";
import { getBrowserRecordingCapability, loadLocalRecording, saveLocalRecording } from "../../data/localRecordingStore";
import type { FiscalYear } from "../../data/kpiMockData";

const blank = (): MeetingNoteInput => ({ title: "", meetingDate: new Date().toISOString().slice(0, 10), calendarEventId: null, accountId: null, notes: "", transcript: "", summary: "", actionItems: [], shares: [] });
const toDraft = (note: MeetingNote): MeetingNoteInput => ({ title: note.title, meetingDate: note.meetingDate, calendarEventId: note.calendarEventId, accountId: note.accountId, notes: note.notes, transcript: note.transcript, summary: note.summary, actionItems: [...note.actionItems], shares: [...note.shares] });
const actionItemsText = (input: MeetingNoteInput) => input.actionItems.map((item) => item.text).join("\n");

type RecordingState = "idle" | "requesting" | "recording" | "stopped" | "permission-error" | "interrupted" | "save-error";

export function MeetingNotesPage({ fiscalYear, canWrite, recordingNamespace, breadcrumb }: Readonly<{
  fiscalYear: FiscalYear; canWrite: boolean; recordingNamespace: string; breadcrumb?: ComponentChildren;
}>) {
  const [notes, setNotes] = useState<MeetingNote[]>([]);
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [draft, setDraft] = useState<MeetingNoteInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingMessage, setRecordingMessage] = useState("");
  const [pendingAudio, setPendingAudio] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [shareSync, setShareSync] = useState<{ note: MeetingNote; shares: readonly MeetingNoteShare[] } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const capability = useMemo(() => getBrowserRecordingCapability(), []);
  const selected = notes.find((note) => note.id === selectedKey) ?? null;

  useEffect(() => {
    let live = true;
    setLoading(true);
    void listMeetingNotes(fiscalYear).then((items) => {
      if (!live) return;
      setNotes(items); setSelectedKey(items[0]?.id ?? null); setError("");
    }).catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : "Unable to load meeting notes."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [fiscalYear]);

  useEffect(() => {
    let currentUrl = "";
    setAudioUrl("");
    setPendingAudio(null);
    setRecordingState("idle"); setRecordingMessage(""); setConsent(false);
    if (selectedKey && selected && canAccessLocalRecording(selected, recordingNamespace)) void loadLocalRecording(recordingNamespace, String(selectedKey)).then((blob) => {
      if (blob) { currentUrl = URL.createObjectURL(blob); setAudioUrl(currentUrl); }
    }).catch(() => setRecordingMessage("This recording could not be loaded from local browser storage."));
    return () => { if (currentUrl) URL.revokeObjectURL(currentUrl); };
  }, [selectedKey, selected?.ownerUserKey, selected?.audioAccess, recordingNamespace]);

  useEffect(() => () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const selectNote = (note: MeetingNote) => { if (!saving && recordingState !== "recording") { setSelectedKey(note.id); setDraft(null); setError(""); } };
  const edit = (note?: MeetingNote) => {
    if (!canWrite || shareSync || (note && !note.canEdit)) return;
    setSelectedKey(note?.id ?? null); setDraft(note ? toDraft(note) : blank()); setError("");
  };
  const cancelEdit = () => { if (!saving && recordingState !== "recording") { setDraft(null); if (!selectedKey && notes[0]) setSelectedKey(notes[0].id); } };
  const save = async () => {
    if (!draft || !canWrite || saving) return;
    if (!draft.title.trim() || !draft.meetingDate) { setError("Title and meeting date are required."); return; }
    try {
      setSaving(true);
      const input = { ...draft, title: draft.title.trim() };
      const saved = selected ? await updateMeetingNoteEntity(selected, input) : await createMeetingNoteEntity(input);
      setNotes((current) => selected ? current.map((note) => note.id === saved.id ? saved : note) : [saved, ...current]);
      setSelectedKey(saved.id); setDraft(null); setPendingAudio(null); setError("");
      let audioSaveError = "";
      if (pendingAudio) {
        try {
          if (!canAccessLocalRecording(saved, recordingNamespace)) throw new Error("The saved note does not grant this account audio access, so the local recording was not retained.");
          await saveLocalRecording(recordingNamespace, String(saved.id), pendingAudio);
        } catch (cause) {
          audioSaveError = cause instanceof Error ? cause.message : "The recording could not be saved locally.";
          setRecordingState("save-error"); setRecordingMessage(audioSaveError);
        }
      }
      try {
        const synchronized = await syncMeetingNoteShares(saved, input.shares);
        setNotes((current) => current.map((note) => note.id === synchronized.id ? synchronized : note));
        setShareSync(null); setError(audioSaveError);
      } catch {
        setShareSync({ note: saved, shares: input.shares });
        setError(`Note saved. Share settings were not fully synchronized. Retry sharing without saving the note again.${audioSaveError ? ` ${audioSaveError}` : ""}`);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save meeting notes."); }
    finally { setSaving(false); }
  };

  const retryShareSync = async () => {
    if (!shareSync || saving) return;
    try {
      setSaving(true);
      const synchronized = await syncMeetingNoteShares(shareSync.note, shareSync.shares);
      setNotes((current) => current.map((note) => note.id === synchronized.id ? synchronized : note));
      setShareSync(null); setError("");
    } catch { setError("Note remains saved, but share settings were not fully synchronized. Retry sharing when the service is available."); }
    finally { setSaving(false); }
  };

  const stopTracks = () => { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; };
  const startRecording = async () => {
    if (!capability.supported || !consent || recordingState === "recording") return;
    setRecordingState("requesting"); setRecordingMessage("Requesting microphone access…"); chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      stream.getAudioTracks().forEach((track) => { track.onended = () => {
        if (recorderRef.current?.state === "recording") recorderRef.current.stop();
        setRecordingState("interrupted"); setRecordingMessage("Recording was interrupted because the microphone became unavailable.");
      }; });
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onerror = () => { setRecordingState("interrupted"); setRecordingMessage("Recording was interrupted by the browser."); stopTracks(); };
      recorder.onstop = () => {
        const audio = chunksRef.current.length ? new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }) : null;
        if (audio) { setPendingAudio(audio); const url = URL.createObjectURL(audio); setAudioUrl((old) => { if (old) URL.revokeObjectURL(old); return url; }); }
        setRecordingState((current) => current === "interrupted" ? current : "stopped");
        setRecordingMessage((current) => current || (audio ? "Recording stopped. Save the note to keep it in this browser." : "No audio was captured."));
        stopTracks();
      };
      recorder.start(1000); setRecordingState("recording"); setRecordingMessage("Recording locally… Keep this page open.");
    } catch (cause) {
      const denied = cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "SecurityError");
      setRecordingState(denied ? "permission-error" : "interrupted");
      setRecordingMessage(denied ? "Microphone permission was denied. Allow microphone access in browser settings or use manual notes." : "The microphone could not be started. Use manual notes instead.");
      stopTracks();
    }
  };
  const stopRecording = () => { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); };
  const addShare = () => setDraft((current) => current ? { ...current, shares: [...current.shares, { userKey: "", permission: "VIEW" }] } : current);
  const changeShare = (index: number, patch: Partial<MeetingNoteShare>) => setDraft((current) => current ? { ...current,
    shares: current.shares.map((share, shareIndex) => shareIndex === index ? { ...share, ...patch } : share) } : current);

  return <section class="weekly-activities-page meeting-notes-page">
    <header class="weekly-activities-page__header"><div>{breadcrumb}<span class="kpi-eyebrow">My Activities</span><h2>Meeting Notes</h2><p>Notes are filtered by meeting date in the selected Oracle fiscal year (June 1–May 31).</p></div>
      <oj-button chroming="callToAction" disabled={!canWrite || Boolean(shareSync) || recordingState === "recording"} onojAction={() => edit()}>Create note</oj-button></header>
    {!canWrite && <div class="weekly-activity-filters"><span class="kap-field__hint">Read-only access. Write permission is required.</span></div>}
    {shareSync && <div class="kap-message-banner" role="alert"><strong>Note saved.</strong> Share settings were not fully synchronized. <button type="button" disabled={saving} onClick={() => void retryShareSync()}>{saving ? "Retrying…" : "Retry sharing"}</button></div>}
    {error && <div class="kap-error" role="alert">{error}</div>}
    {loading ? <div class="kap-empty-state" role="status">Loading meeting notes…</div> : <div class="meeting-notes-layout">
      <aside class="meeting-notes-list" aria-label="Meeting notes">{notes.map((note) => <button type="button" class={note.id === selectedKey ? "is-selected" : ""} onClick={() => selectNote(note)} key={note.id}><strong>{note.title}</strong><time dateTime={note.meetingDate}>{note.meetingDate}</time><span>{note.accountId ? `Account ${note.accountId}` : "No account"}</span></button>)}{notes.length === 0 && <div class="kap-empty-state"><strong>No meeting notes for {fiscalYear}.</strong><p>Create a note or choose another fiscal year.</p></div>}</aside>
      <main class="meeting-notes-detail">{draft ? <div class="meeting-note-editor">
        <div class="meeting-note-editor__heading"><h3>{selectedKey ? "Edit meeting note" : "New meeting note"}</h3><span>Manual entry</span></div>
        <div class="meeting-note-editor__two"><label class="kap-field"><span>Title</span><input value={draft.title} onInput={(e) => setDraft({ ...draft, title: e.currentTarget.value })} /></label><label class="kap-field"><span>Meeting date</span><input type="date" value={draft.meetingDate} onInput={(e) => setDraft({ ...draft, meetingDate: e.currentTarget.value })} /></label></div>
        <div class="meeting-note-editor__two"><label class="kap-field"><span>Calendar event ID (optional)</span><input type="number" min="1" value={draft.calendarEventId ?? ""} onInput={(e) => setDraft({ ...draft, calendarEventId: e.currentTarget.value ? Number(e.currentTarget.value) : null })} /></label><label class="kap-field"><span>Account ID (optional)</span><input type="number" min="1" value={draft.accountId ?? ""} onInput={(e) => setDraft({ ...draft, accountId: e.currentTarget.value ? Number(e.currentTarget.value) : null })} /></label></div>
        <label class="kap-field"><span>Notes</span><textarea rows={7} value={draft.notes} onInput={(e) => setDraft({ ...draft, notes: e.currentTarget.value })}></textarea></label>
        <div class="meeting-note-ai-notice"><strong>Manual entry / external AI is not configured.</strong><p>No transcription or summary is generated. Enter transcript, summary, and action items manually.</p><button type="button" disabled title="External AI transcription is not configured">Generate transcript and summary</button></div>
        <label class="kap-field"><span>Transcript (manual)</span><textarea rows={5} value={draft.transcript} onInput={(e) => setDraft({ ...draft, transcript: e.currentTarget.value })}></textarea></label>
        <label class="kap-field"><span>Summary (manual)</span><textarea rows={4} value={draft.summary} onInput={(e) => setDraft({ ...draft, summary: e.currentTarget.value })}></textarea></label>
        <label class="kap-field"><span>Action items (one per line)</span><textarea rows={4} value={actionItemsText(draft)} onInput={(e) => setDraft({ ...draft, actionItems: e.currentTarget.value.split("\n").filter(Boolean).map((text) => ({ text })) })}></textarea></label>
        <section class="calendar-sharing"><div><strong>Minutes sharing</strong><button type="button" onClick={addShare}>Add person</button></div><p class="kap-field__hint">Recipients can access note text only. Raw audio always remains local to this browser.</p>{draft.shares.map((share, index) => <div class="calendar-sharing__row" key={index}><input aria-label={`Shared user ${index + 1}`} placeholder="User key" value={share.userKey} onInput={(e) => changeShare(index, { userKey: e.currentTarget.value })} /><select aria-label={`Permission for shared user ${index + 1}`} value={share.permission} onChange={(e) => changeShare(index, { permission: e.currentTarget.value as "VIEW" | "EDIT" })}><option value="VIEW">VIEW</option><option value="EDIT">EDIT</option></select><button type="button" aria-label={`Remove shared user ${index + 1}`} onClick={() => setDraft({ ...draft, shares: draft.shares.filter((_, shareIndex) => shareIndex !== index) })}>Remove</button></div>)}</section>
        <section class="local-recorder" aria-labelledby="local-recorder-title"><h4 id="local-recorder-title">Quick local recording</h4><div class="local-recorder__warning"><strong>Raw audio stays on this device and browser only.</strong> It is never uploaded with the note because shared audio storage is not approved. Other users, including users who can read this note, cannot play this recording.</div>
          <label class="kap-check"><input type="checkbox" checked={consent} disabled={!capability.supported || recordingState === "recording"} onChange={(e) => setConsent(e.currentTarget.checked)} /> I have everyone’s consent to record.</label>
          {!capability.supported && <div class="kap-message-banner" role="status">{capability.reason}</div>}
          <div class="local-recorder__actions"><button type="button" disabled={!capability.supported || !consent || recordingState === "recording"} onClick={() => void startRecording()}>Start recording</button><button type="button" disabled={recordingState !== "recording"} onClick={stopRecording}>Stop</button></div>
          {recordingMessage && <div class={recordingState.includes("error") || recordingState === "interrupted" ? "kap-error" : "kap-success"} role="status">{recordingMessage}</div>}
          {audioUrl && <audio controls src={audioUrl}>Audio playback is not supported by this browser.</audio>}
        </section>
        <div class="meeting-note-editor__actions"><oj-button disabled={saving || recordingState === "recording"} onojAction={cancelEdit}>Cancel</oj-button><oj-button chroming="callToAction" disabled={saving || recordingState === "recording" || !canWrite} onojAction={() => void save()}>{saving ? "Saving…" : "Save note"}</oj-button></div>
      </div> : selected ? <article class="meeting-note-view"><header><div><span class="kpi-eyebrow">{selected.meetingDate}</span><h3>{selected.title}</h3><p>{selected.accountId ? `Account ${selected.accountId}` : "No account linked"}</p></div><oj-button disabled={!canWrite || Boolean(shareSync) || !selected.canEdit} onojAction={() => edit(selected)}>Edit</oj-button></header>
        <section><h4>Notes</h4><p class="meeting-note-pre">{selected.notes || "No notes entered."}</p></section><section><h4>Transcript</h4><p class="meeting-note-pre">{selected.transcript || "Manual transcript not entered. External AI is not configured."}</p></section><section><h4>Summary</h4><p class="meeting-note-pre">{selected.summary || "Manual summary not entered. External AI is not configured."}</p></section><section><h4>Action items</h4>{selected.actionItems.length ? <ul>{selected.actionItems.map((item, index) => <li key={index}>{item.text}</li>)}</ul> : <p>No action items entered.</p>}</section>
        <div class="local-recorder__warning"><strong>Local audio:</strong> Audio is device-local and is not shared with this note.{audioUrl ? <audio controls src={audioUrl}></audio> : " No recording is available in this browser."}</div>
      </article> : <div class="kap-empty-state"><strong>Select or create a meeting note.</strong></div>}</main>
    </div>}
  </section>;
}
