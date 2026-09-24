import { ComponentChildren, h } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import "ojs/ojbutton";
import "ojs/ojprogress-circle";
import {
  AccountHierarchyAccount,
  AccountWorkload,
  AccountsWorkloadsApiError,
  AccountsWorkloadsFieldError,
  AccountsWorkloadsHierarchy,
  AccountsWorkloadsHierarchySaveRequest,
  ForecastCandidate,
  WorkloadPlanWrite,
  filterForecastCandidates,
  fetchAccountsWorkloadsHierarchy,
  fetchForecastCandidates,
  forecastCandidateKey,
  saveAccountsWorkloadsHierarchy
} from "../../data/accountsWorkloadsApi";

type Props = Readonly<{
  canWrite: boolean;
  breadcrumb?: ComponentChildren;
  onDraftStateChange?: (active: boolean) => void;
  initialSearch?: string;
}>;

type EditableField = "account" | "workload" | "planNumber" | "latestUpdate" | "notes";
type EditingCell = Readonly<{ rowKey: string; field: EditableField }>;
type DraftSnapshot = Readonly<{
  hierarchy: AccountsWorkloadsHierarchy;
  dirtyAccounts: Set<number>;
  dirtyWorkloads: Set<number>;
  planWrites: WorkloadPlanWrite[];
}>;
type FlatRow = Readonly<{
  rowKey: string;
  account: AccountHierarchyAccount;
  workload: AccountWorkload;
}>;

const EMPTY_HIERARCHY: AccountsWorkloadsHierarchy = { fiscalYear: null, accounts: [] };
const CANDIDATE_WORKLOAD_NAME = "미정의 — 수정 필요";
const refFor = (id: number, entity: "account" | "workload") => id > 0 ? String(id) : `${entity}-${Math.abs(id)}`;
const normalizedAccountIdentity = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleUpperCase();
const friendlyError = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";
const emptyWorkload = (id: number, name = ""): AccountWorkload => ({
  id, versionNo: 0, name, lastUpdated: null, notes: null, archived: false, plans: [], deals: []
});

export function AccountsWorkloadsPage({ canWrite, breadcrumb, onDraftStateChange, initialSearch = "" }: Props) {
  const nextTempId = useRef(-1);
  const editInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [hierarchy, setHierarchy] = useState<AccountsWorkloadsHierarchy>(EMPTY_HIERARCHY);
  const [savedHierarchy, setSavedHierarchy] = useState<AccountsWorkloadsHierarchy>(EMPTY_HIERARCHY);
  const [dirtyAccounts, setDirtyAccounts] = useState<Set<number>>(new Set());
  const [dirtyWorkloads, setDirtyWorkloads] = useState<Set<number>>(new Set());
  const [planWrites, setPlanWrites] = useState<WorkloadPlanWrite[]>([]);
  const [manualAdding, setManualAdding] = useState<Set<number>>(new Set());
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editSnapshot, setEditSnapshot] = useState<DraftSnapshot | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveErrors, setSaveErrors] = useState<AccountsWorkloadsFieldError[]>([]);
  const [notice, setNotice] = useState("");
  const [forecastOpen, setForecastOpen] = useState(false);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState("");
  const [forecastCandidates, setForecastCandidates] = useState<ForecastCandidate[]>([]);
  const [selectedCandidateKeys, setSelectedCandidateKeys] = useState<Set<string>>(new Set());

  const draftActive = dirtyAccounts.size > 0 || dirtyWorkloads.size > 0 || planWrites.length > 0;
  useEffect(() => { onDraftStateChange?.(draftActive); }, [draftActive, onDraftStateChange]);
  useEffect(() => {
    if (editingCell) window.setTimeout(() => { editInputRef.current?.focus(); editInputRef.current?.select(); }, 0);
  }, [editingCell]);

  const reload = async () => {
    setLoading(true); setError(""); setSaveErrors([]); setNotice(""); setEditingCell(null); setEditSnapshot(null);
    try {
      const result = await fetchAccountsWorkloadsHierarchy({ search, includeArchived, includeDeletedDeals: false });
      setHierarchy(result); setSavedHierarchy(result);
      setDirtyAccounts(new Set()); setDirtyWorkloads(new Set()); setPlanWrites([]); setManualAdding(new Set());
    } catch (requestError) { setError(friendlyError(requestError)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void reload(); }, [search, includeArchived]);

  const rows = useMemo<FlatRow[]>(() => hierarchy.accounts.flatMap((account) =>
    account.workloads.map((workload) => ({ rowKey: `${account.id}:${workload.id}`, account, workload }))), [hierarchy]);
  const missingForecastCandidates = useMemo(
    () => filterForecastCandidates(forecastCandidates, hierarchy.accounts),
    [forecastCandidates, hierarchy.accounts]
  );

  const updateAccount = (id: number, name: string) => {
    setHierarchy((current) => ({ ...current, accounts: current.accounts.map((account) => account.id === id ? { ...account, name } : account) }));
    setDirtyAccounts((current) => new Set(current).add(id));
  };
  const updateWorkload = (id: number, field: "name" | "lastUpdated" | "notes", value: string | null) => {
    setHierarchy((current) => ({ ...current, accounts: current.accounts.map((account) => ({
      ...account, workloads: account.workloads.map((workload) => workload.id === id ? { ...workload, [field]: value } : workload)
    })) }));
    setDirtyWorkloads((current) => new Set(current).add(id));
  };
  const updatePlanNumber = (workload: AccountWorkload, value: string) => {
    const sourcePlanNumber = value.trim();
    const primary = workload.plans[0];
    const workloadRef = refFor(workload.id, "workload");
    if (!primary && !sourcePlanNumber) return;
    if (!primary) {
      const planId = nextTempId.current--;
      setHierarchy((current) => ({ ...current, accounts: current.accounts.map((account) => ({
        ...account, workloads: account.workloads.map((item) => item.id === workload.id
          ? { ...item, plans: [{ id: planId, workloadId: workload.id, sourcePlanId: null, sourcePlanNumber, versionNo: 0 }, ...item.plans] }
          : item)
      })) }));
      setPlanWrites((current) => [...current, { id: null, workloadRef, versionNo: null, sourcePlanId: null, sourcePlanNumber, action: "UPSERT" }]);
      return;
    }
    setHierarchy((current) => ({ ...current, accounts: current.accounts.map((account) => ({
      ...account, workloads: account.workloads.map((item) => item.id === workload.id
        ? { ...item, plans: item.plans.map((plan) => plan.id === primary.id ? { ...plan, sourcePlanNumber: sourcePlanNumber || null } : plan) }
        : item)
    })) }));
    const matchesPrimary = (write: WorkloadPlanWrite) => primary.id > 0
      ? write.id === primary.id
      : write.id === null && write.workloadRef === workloadRef;
    setPlanWrites((current) => [
      ...current.filter((write) => !matchesPrimary(write)),
      { id: primary.id > 0 ? primary.id : null, workloadRef: primary.id > 0 ? null : workloadRef,
        versionNo: primary.id > 0 ? primary.versionNo : null, sourcePlanId: primary.sourcePlanId,
        sourcePlanNumber: sourcePlanNumber || null,
        action: !sourcePlanNumber && primary.sourcePlanId === null ? "DELETE" : "UPSERT" }
    ]);
  };

  const beginEdit = (rowKey: string, field: EditableField) => {
    if (!canWrite || saving || manualAdding.has(Number(rowKey.split(":")[1]))) return;
    setEditSnapshot({ hierarchy, dirtyAccounts: new Set(dirtyAccounts), dirtyWorkloads: new Set(dirtyWorkloads), planWrites: [...planWrites] });
    setEditingCell({ rowKey, field });
  };
  const commitEdit = () => { setEditingCell(null); setEditSnapshot(null); };
  const cancelEdit = () => {
    if (editSnapshot) {
      setHierarchy(editSnapshot.hierarchy); setDirtyAccounts(editSnapshot.dirtyAccounts);
      setDirtyWorkloads(editSnapshot.dirtyWorkloads); setPlanWrites(editSnapshot.planWrites);
    }
    setEditingCell(null); setEditSnapshot(null);
  };
  const handleEditKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); cancelEdit(); }
    else if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); commitEdit(); }
  };

  const planNumber = (workload: AccountWorkload) => workload.plans[0]?.sourcePlanNumber
    ?? (workload.plans[0]?.sourcePlanId === null || workload.plans[0]?.sourcePlanId === undefined ? "" : String(workload.plans[0].sourcePlanId));
  const fieldValue = (row: FlatRow, field: EditableField) => {
    if (field === "account") return row.account.name;
    if (field === "workload") return row.workload.name;
    if (field === "planNumber") return planNumber(row.workload);
    if (field === "latestUpdate") return row.workload.lastUpdated ?? "";
    return row.workload.notes ?? "";
  };
  const changeField = (row: FlatRow, field: EditableField, value: string) => {
    if (field === "account") updateAccount(row.account.id, value);
    else if (field === "workload") updateWorkload(row.workload.id, "name", value);
    else if (field === "planNumber") updatePlanNumber(row.workload, value);
    else if (field === "latestUpdate") updateWorkload(row.workload.id, "lastUpdated", value.trim() ? value : null);
    else updateWorkload(row.workload.id, "notes", value.trim() ? value : null);
  };
  const isDirtyField = (row: FlatRow, field: EditableField) => field === "account"
    ? dirtyAccounts.has(row.account.id)
    : field === "planNumber" ? planWrites.some((write) => write.workloadRef === refFor(row.workload.id, "workload") || write.id === row.workload.plans[0]?.id)
      : dirtyWorkloads.has(row.workload.id);
  const renderEditableCell = (row: FlatRow, field: EditableField) => {
    const active = editingCell?.rowKey === row.rowKey && editingCell.field === field;
    const adding = manualAdding.has(row.workload.id);
    const value = fieldValue(row, field);
    const className = [active ? "is-editing-cell" : "", isDirtyField(row, field) ? "is-unsaved-cell" : ""].filter(Boolean).join(" ");
    const input = (field === "latestUpdate" || field === "notes")
      ? <textarea ref={active ? (element) => { editInputRef.current = element; } : undefined} class="accounts-workloads-edit-field accounts-workloads-edit-field--textarea" value={value}
          aria-label={field === "latestUpdate" ? "Latest Update" : "Notes"}
          onInput={(event) => changeField(row, field, (event.currentTarget as HTMLTextAreaElement).value)}
          onBlur={active ? commitEdit : undefined} onKeyDown={active ? handleEditKeyDown : undefined} />
      : <input ref={active ? (element) => { editInputRef.current = element; } : undefined} class="accounts-workloads-edit-field" value={value}
          aria-label={field}
          onInput={(event) => changeField(row, field, (event.currentTarget as HTMLInputElement).value)}
          onBlur={active ? commitEdit : undefined} onKeyDown={active ? handleEditKeyDown : undefined} />;
    return (
      <td class={className || undefined} onDblClick={() => beginEdit(row.rowKey, field)} title={!active && !adding ? "Double-click to edit" : undefined}>
        {active || adding ? input : (value || "—")}
      </td>
    );
  };

  const addAccountWorkload = () => {
    const accountId = nextTempId.current--;
    const workloadId = nextTempId.current--;
    setHierarchy((current) => ({ ...current, accounts: [{
      id: accountId, versionNo: 0, name: "", archived: false, workloads: [emptyWorkload(workloadId)]
    }, ...current.accounts] }));
    setDirtyAccounts((current) => new Set(current).add(accountId));
    setDirtyWorkloads((current) => new Set(current).add(workloadId));
    setManualAdding((current) => new Set(current).add(workloadId));
  };
  const cancelDraft = () => {
    setHierarchy(savedHierarchy); setDirtyAccounts(new Set()); setDirtyWorkloads(new Set()); setPlanWrites([]);
    setManualAdding(new Set()); setEditingCell(null); setEditSnapshot(null); setError(""); setSaveErrors([]); setNotice("");
  };
  const validateDraft = () => {
    for (const account of hierarchy.accounts) {
      if (dirtyAccounts.has(account.id) && !account.name.trim()) return "Every account requires a name.";
      for (const workload of account.workloads) if (dirtyWorkloads.has(workload.id) && !workload.name.trim()) return "Every workload requires a name.";
    }
    return "";
  };
  const save = async () => {
    const validation = validateDraft();
    if (validation) { setError(validation); setSaveErrors([]); return; }
    const request: AccountsWorkloadsHierarchySaveRequest = { accounts: [], workloads: [], deals: [], workloadPlans: [...planWrites] };
    hierarchy.accounts.forEach((account) => {
      if (dirtyAccounts.has(account.id)) request.accounts.push({
        id: account.id > 0 ? account.id : null, clientId: account.id > 0 ? null : refFor(account.id, "account"),
        versionNo: account.id > 0 ? account.versionNo : null, name: account.name, action: "UPSERT"
      });
      account.workloads.forEach((workload) => {
        if (dirtyWorkloads.has(workload.id)) request.workloads.push({
          id: workload.id > 0 ? workload.id : null,
          clientId: workload.id > 0 ? null : refFor(workload.id, "workload"),
          accountRef: refFor(account.id, "account"), versionNo: workload.id > 0 ? workload.versionNo : null,
          name: workload.name, lastUpdated: workload.lastUpdated, notes: workload.notes, action: "UPSERT"
        });
      });
    });
    setSaving(true); setError(""); setSaveErrors([]); setNotice("");
    try {
      const saved = await saveAccountsWorkloadsHierarchy(request);
      setHierarchy(saved); setSavedHierarchy(saved); setDirtyAccounts(new Set()); setDirtyWorkloads(new Set());
      setPlanWrites([]); setManualAdding(new Set()); setEditingCell(null); setEditSnapshot(null); setNotice("Changes saved.");
    } catch (saveError) {
      setError(friendlyError(saveError));
      setSaveErrors(saveError instanceof AccountsWorkloadsApiError ? saveError.errors : []);
    } finally { setSaving(false); }
  };

  const openForecast = async () => {
    setForecastOpen(true); setForecastLoading(true); setForecastError(""); setSelectedCandidateKeys(new Set());
    try { setForecastCandidates(await fetchForecastCandidates()); }
    catch (requestError) { setForecastError(friendlyError(requestError)); }
    finally { setForecastLoading(false); }
  };
  const toggleCandidate = (key: string) => setSelectedCandidateKeys((current) => {
    const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next;
  });
  const addSelectedCandidates = () => {
    const selected = missingForecastCandidates.filter((candidate) => selectedCandidateKeys.has(forecastCandidateKey(candidate)));
    const groups = new Map<string, { accountId: number; accountName: string; isNew: boolean; workloads: AccountWorkload[] }>();
    const workloadIds: number[] = [];
    const writes: WorkloadPlanWrite[] = [];
    selected.forEach((candidate) => {
      const accountName = candidate.accountName.trim();
      const accountKey = normalizedAccountIdentity(accountName);
      let group = groups.get(accountKey);
      if (!group) {
        const existing = hierarchy.accounts.find((account) => normalizedAccountIdentity(account.name) === accountKey);
        group = { accountId: existing?.id ?? nextTempId.current--, accountName, isNew: !existing, workloads: [] };
        groups.set(accountKey, group);
      }
      const workloadId = nextTempId.current--;
      const hasSourcePlan = candidate.planId !== null || candidate.planNumber !== null;
      const tempPlanId = hasSourcePlan ? nextTempId.current-- : null;
      group.workloads.push({ ...emptyWorkload(workloadId, CANDIDATE_WORKLOAD_NAME), plans: tempPlanId === null ? [] : [{
        id: tempPlanId, workloadId, sourcePlanId: candidate.planId, sourcePlanNumber: candidate.planNumber, versionNo: 0
      }] });
      workloadIds.push(workloadId);
      if (hasSourcePlan) writes.push({ id: null, workloadRef: refFor(workloadId, "workload"), versionNo: null,
        sourcePlanId: candidate.planId, sourcePlanNumber: candidate.planNumber, action: "UPSERT" });
    });
    setHierarchy((current) => {
      const byId = new Map([...groups.values()].map((group) => [group.accountId, group]));
      const updated = current.accounts.map((account) => {
        const group = byId.get(account.id); return group ? { ...account, workloads: [...group.workloads, ...account.workloads] } : account;
      });
      const created = [...groups.values()].filter((group) => group.isNew).map((group) => ({
        id: group.accountId, versionNo: 0, name: group.accountName, archived: false, workloads: group.workloads
      }));
      return { ...current, accounts: [...created, ...updated] };
    });
    setDirtyAccounts((current) => { const next = new Set(current); [...groups.values()].filter((group) => group.isNew).forEach((group) => next.add(group.accountId)); return next; });
    setDirtyWorkloads((current) => { const next = new Set(current); workloadIds.forEach((id) => next.add(id)); return next; });
    setPlanWrites((current) => [...current, ...writes]);
    setForecastOpen(false); setNotice(`${selected.length} candidate${selected.length === 1 ? "" : "s"} added as draft.`);
  };

  return (
    <section class="content-page accounts-workloads-page" aria-label="Accounts and workloads">
      {breadcrumb}
      <div class="accounts-workloads-header">
        <div><p class="eyebrow">KPI Workspace</p><h2>Accounts &amp; Workloads</h2><p>Double-click a cell to edit. Changes stay in Draft until Save.</p></div>
      </div>
      <div class="accounts-workloads-toolbar" aria-label="Accounts and workloads actions">
        <div class="accounts-workloads-search"><label for="accountsWorkloadsSearchInput">Search</label><div class="accounts-workloads-search__control">
          <input id="accountsWorkloadsSearchInput" value={search} disabled={draftActive || loading}
            placeholder="Account / Workload / Plan Number" onInput={(event) => setSearch((event.currentTarget as HTMLInputElement).value)} />
        </div></div>
        <label class="accounts-workloads-switch"><span>Include archived</span><input type="checkbox" checked={includeArchived} disabled={draftActive || loading}
          onChange={(event) => setIncludeArchived((event.currentTarget as HTMLInputElement).checked)} /></label>
        <div class="accounts-workloads-actions accounts-workloads-actions--compact">
          <oj-button chroming="outlined" disabled={!canWrite || saving} onojAction={() => void openForecast()}>Compare Consumption Records</oj-button>
          <oj-button chroming="callToAction" disabled={!canWrite || saving} onojAction={addAccountWorkload}>{"Add Account & Workload"}</oj-button>
          {draftActive && <button type="button" class="accounts-workloads-button accounts-workloads-button--primary" disabled={!canWrite || saving} onClick={() => void save()}>Save</button>}
          {draftActive && <button type="button" class="accounts-workloads-button" disabled={saving} onClick={cancelDraft}>Cancel</button>}
          <oj-button chroming="outlined" disabled={draftActive || loading || saving} onojAction={() => void reload()}>Refresh</oj-button>
        </div>
      </div>
      {error && <div class="accounts-workloads-save-error" role="alert">{error}</div>}
      {saveErrors.length > 0 && <div class="accounts-workloads-save-error" role="alert">{saveErrors.map((item) => `${item.field}: ${item.message}`).join(" · ")}</div>}
      {notice && <div class="accounts-workloads-table-meta" role="status">{notice}</div>}
      <div class="accounts-workloads-table-meta" role="status">{loading ? "Loading…" : `${rows.length} workloads`}{saving ? " · Saving…" : ""}</div>
      <div class="accounts-workloads-grid-shell">
        <div class="accounts-workloads-grid-wrap">
          <table class="accounts-workloads-grid accounts-workloads-grid--aw-only">
            <thead><tr><th>Account</th><th>Workload</th><th>Plan Number</th><th>Latest Update</th><th>Notes</th></tr></thead>
            <tbody>
              {rows.map((row) => <tr key={row.rowKey} class={manualAdding.has(row.workload.id) ? "is-adding-row" : undefined}>
                {renderEditableCell(row, "account")}{renderEditableCell(row, "workload")}{renderEditableCell(row, "planNumber")}
                {renderEditableCell(row, "latestUpdate")}{renderEditableCell(row, "notes")}
              </tr>)}
              {!loading && rows.length === 0 && <tr class="is-empty-row"><td colSpan={5}>No accounts or workloads match the current filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {forecastOpen && <div class="accounts-workloads-dialog-backdrop" role="dialog" aria-modal="true" aria-label="Consumption Records candidates">
        <div class="accounts-forecast-dialog">
          <h3>Consumption Records candidates</h3>
          <p>Plan ID is matched first. Without a Plan ID, Account uses normalized exact matching.</p>
          {forecastLoading && <p role="status">Loading candidates…</p>}
          {forecastError && <p role="alert">{forecastError}</p>}
          {!forecastLoading && missingForecastCandidates.length === 0 && <p>No unlinked candidates.</p>}
          <div class="accounts-forecast-list">{missingForecastCandidates.map((candidate) => {
            const key = forecastCandidateKey(candidate);
            return <label key={key}><input type="checkbox" checked={selectedCandidateKeys.has(key)} onChange={() => toggleCandidate(key)} />
              <span><strong>{candidate.accountName}</strong><small>{candidate.planNumber ?? "No Plan Number"}</small></span></label>;
          })}</div>
          <div class="accounts-workloads-actions"><button type="button" class="accounts-workloads-button accounts-workloads-button--primary"
            disabled={selectedCandidateKeys.size === 0} onClick={addSelectedCandidates}>Add selected as Draft</button>
            <button type="button" class="accounts-workloads-button" onClick={() => setForecastOpen(false)}>Close</button></div>
        </div>
      </div>}
    </section>
  );
}
