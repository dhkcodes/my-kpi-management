import { apiFetch } from "../auth/apiFetch";

export type MeetingActionItem = Readonly<{ text: string; owner?: string | null; dueDate?: string | null; completed?: boolean }>;
export type MeetingSharePermission = "VIEW" | "EDIT";
export type MeetingNoteShare = Readonly<{ userKey: string; displayName?: string; permission: MeetingSharePermission }>;
export type MeetingNote = Readonly<{
  id: number;
  versionNo: number;
  title: string;
  meetingDate: string;
  calendarEventId?: number | null;
  accountId?: number | null;
  notes: string;
  transcript: string;
  summary: string;
  actionItems: readonly MeetingActionItem[];
  shares: readonly MeetingNoteShare[];
  canEdit: boolean;
  ownerUserKey: string;
  audioAccess: boolean;
}>;
export type MeetingNoteInput = Readonly<{
  title: string;
  meetingDate: string;
  calendarEventId?: number | null;
  accountId?: number | null;
  notes: string;
  transcript: string;
  summary: string;
  actionItems: readonly MeetingActionItem[];
  shares: readonly MeetingNoteShare[];
}>;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type NoteDto = {
  id: number; calendarEventId?: number | null; accountId?: number | null; title: string; meetingAt: string;
  notes?: string | null; transcript?: string | null; summary?: string | null; actionItems?: string | null;
  versionNo: number; ownerUserKey?: string; effectiveAccess?: MeetingSharePermission; notesAccess?: boolean; audioAccess?: boolean;
};
type ShareDto = { userKey: string; access: MeetingSharePermission; notesAccess: boolean; audioAccess: boolean };

const request = async <T>(path: string, init?: RequestInit, fetchImpl: FetchLike = apiFetch): Promise<T> => {
  const response = await fetchImpl(`/api/v1${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) throw new Error((await response.text()).trim() || `Request failed (${response.status}).`);
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
};
const unwrap = <T>(value: T[] | { items: T[] }): T[] => Array.isArray(value) ? value : value.items;
const parseActionItems = (value?: string | null): MeetingActionItem[] => {
  if (!value?.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((item): item is MeetingActionItem =>
      typeof item === "object" && item !== null && typeof (item as { text?: unknown }).text === "string");
  } catch { /* Older rows can contain one action item per line. */ }
  return value.split("\n").map((text) => text.trim()).filter(Boolean).map((text) => ({ text }));
};
const mapShare = (share: ShareDto): MeetingNoteShare => ({ userKey: share.userKey, permission: share.access });
const mapNote = (note: NoteDto, shares: readonly MeetingNoteShare[] = []): MeetingNote => ({
  id: note.id,
  versionNo: note.versionNo,
  title: note.title,
  meetingDate: note.meetingAt.slice(0, 10),
  calendarEventId: note.calendarEventId ?? null,
  accountId: note.accountId ?? null,
  notes: note.notes ?? "",
  transcript: note.transcript ?? "",
  summary: note.summary ?? "",
  actionItems: parseActionItems(note.actionItems),
  shares,
  canEdit: note.effectiveAccess === "EDIT" && note.notesAccess !== false,
  ownerUserKey: note.ownerUserKey ?? "",
  audioAccess: note.audioAccess === true
});
export const canAccessLocalRecording = (note: Pick<MeetingNote, "ownerUserKey" | "audioAccess">, currentUserKey: string): boolean =>
  Boolean(currentUserKey) && (note.ownerUserKey === currentUserKey || note.audioAccess === true);
const offsetFor = (date: string): string => {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  try {
    const instant = new Date(`${date}T00:00:00Z`);
    const name = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" })
      .formatToParts(instant).find((part) => part.type === "timeZoneName")?.value;
    if (name === "GMT" || name === "UTC") return "+00:00";
    const match = name?.match(/GMT([+-])(\d{2}):(\d{2})/);
    if (match) return `${match[1]}${match[2]}:${match[3]}`;
  } catch { /* Fall through to the host offset. */ }
  const offset = -new Date(`${date}T00:00:00`).getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const absolute = Math.abs(offset);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
};
const noteBody = (input: MeetingNoteInput, versionNo?: number) => ({
  calendarEventId: input.calendarEventId ?? null,
  accountId: input.accountId ?? null,
  title: input.title,
  meetingAt: `${input.meetingDate}T00:00:00${offsetFor(input.meetingDate)}`,
  notes: input.notes,
  transcript: input.transcript,
  summary: input.summary,
  actionItems: JSON.stringify(input.actionItems),
  // Only metadata can be persisted by the API. Raw audio stays in IndexedDB.
  recordingName: null,
  recordingMimeType: null,
  recordingDurationSeconds: null,
  recordingStatus: "NONE" as const,
  ...(versionNo === undefined ? {} : { versionNo })
});
const normalizedShares = (shares: readonly MeetingNoteShare[]): MeetingNoteShare[] => {
  const byUser = new Map<string, MeetingNoteShare>();
  for (const share of shares) {
    const userKey = share.userKey.trim();
    if (userKey) byUser.set(userKey, { ...share, userKey });
  }
  return [...byUser.values()];
};
const putShare = (id: number, share: MeetingNoteShare, fetchImpl: FetchLike) =>
  request<ShareDto>(`/meeting-notes/${id}/shares/${encodeURIComponent(share.userKey)}`, {
    method: "PUT",
    body: JSON.stringify({ userKey: share.userKey, access: share.permission, notesAccess: true, audioAccess: false })
  }, fetchImpl);
const deleteShare = async (id: number, userKey: string, fetchImpl: FetchLike): Promise<void> => {
  const response = await fetchImpl(`/api/v1/meeting-notes/${id}/shares/${encodeURIComponent(userKey)}`, {
    method: "DELETE", headers: { "Content-Type": "application/json" }
  });
  if (!response.ok && response.status !== 404) throw new Error((await response.text()).trim() || `Request failed (${response.status}).`);
};
const syncShares = async (id: number, previous: readonly MeetingNoteShare[], desired: readonly MeetingNoteShare[], fetchImpl: FetchLike) => {
  const next = normalizedShares(desired);
  const nextUsers = new Set(next.map((share) => share.userKey));
  await Promise.all([
    ...previous.filter((share) => !nextUsers.has(share.userKey)).map((share) =>
      deleteShare(id, share.userKey, fetchImpl)),
    ...next.map((share) => putShare(id, share, fetchImpl))
  ]);
  return next;
};

export async function listMeetingNotes(fiscalYear: string, fetchImpl: FetchLike = apiFetch): Promise<MeetingNote[]> {
  const dtos = unwrap(await request<NoteDto[] | { items: NoteDto[] }>(`/meeting-notes?fy=${encodeURIComponent(fiscalYear)}`, undefined, fetchImpl));
  return Promise.all(dtos.map(async (dto) => {
    try {
      const shares = unwrap(await request<ShareDto[] | { items: ShareDto[] }>(`/meeting-notes/${dto.id}/shares`, undefined, fetchImpl));
      return mapNote(dto, shares.filter((share) => share.notesAccess).map(mapShare));
    } catch {
      // ACL details are owner-only. A recipient can still use the redacted note DTO.
      return mapNote(dto);
    }
  }));
}
export async function createMeetingNote(input: MeetingNoteInput, fetchImpl: FetchLike = apiFetch): Promise<MeetingNote> {
  return syncMeetingNoteShares(await createMeetingNoteEntity(input, fetchImpl), input.shares, fetchImpl);
}
export async function updateMeetingNote(note: MeetingNote, input: MeetingNoteInput, fetchImpl: FetchLike = apiFetch): Promise<MeetingNote> {
  return syncMeetingNoteShares(await updateMeetingNoteEntity(note, input, fetchImpl), input.shares, fetchImpl, note.shares);
}
export async function createMeetingNoteEntity(input: MeetingNoteInput, fetchImpl: FetchLike = apiFetch): Promise<MeetingNote> {
  return mapNote(await request<NoteDto>("/meeting-notes", { method: "POST", body: JSON.stringify(noteBody(input)) }, fetchImpl));
}
export async function updateMeetingNoteEntity(note: MeetingNote, input: MeetingNoteInput, fetchImpl: FetchLike = apiFetch): Promise<MeetingNote> {
  return mapNote(await request<NoteDto>(`/meeting-notes/${note.id}`, { method: "PUT", body: JSON.stringify(noteBody(input, note.versionNo)) }, fetchImpl), note.shares);
}
export async function syncMeetingNoteShares(note: MeetingNote, desired: readonly MeetingNoteShare[], fetchImpl: FetchLike = apiFetch,
  previous: readonly MeetingNoteShare[] = note.shares): Promise<MeetingNote> {
  return { ...note, shares: await syncShares(note.id, previous, desired, fetchImpl) };
}
