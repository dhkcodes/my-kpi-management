import { ComponentChildren, h } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import "ojs/ojbutton";
import "ojs/ojprogress-circle";
import {
  AccountHierarchyAccount,
  AccountWorkload,
  AccountWorkloadDeal,
  AccountsWorkloadsApiError,
  AccountsWorkloadsFieldError,
  AccountsWorkloadsHierarchy,
  AccountsWorkloadsHierarchySaveRequest,
  DealWrite,
  ForecastCandidate,
  WorkloadPlanWrite,
  fetchAccountsWorkloadsHierarchy,
  fetchForecastCandidates,
  saveAccountsWorkloadsHierarchy
} from "../../data/accountsWorkloadsApi";

type Props = Readonly<{
  canWrite: boolean;
  breadcrumb?: ComponentChildren;
  onDraftStateChange?: (active: boolean) => void;
  initialSearch?: string;
}>;

type QueuedOperation =
  | Readonly<{ entity: "account"; id: number; versionNo: number; name: string; action: "ARCHIVE" | "RESTORE" }>
  | Readonly<{ entity: "workload"; id: number; versionNo: number; name: string; action: "ARCHIVE" | "RESTORE" }>
  | Readonly<{ entity: "deal"; id: number; versionNo: number; action: "DELETE" | "RESTORE" }>;

const EMPTY_HIERARCHY: AccountsWorkloadsHierarchy = { fiscalYear: null, accounts: [] };
const refFor = (id: number, entity: "account" | "workload") => id > 0 ? String(id) : `${entity}-${Math.abs(id)}`;
const nullable = (value: string) => value.trim() || null;
const numeric = (value: string): number | null => value.trim() === "" ? null : Number(value);
const friendlyError = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";
const normalized = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleUpperCase();

const emptyDeal = (id: number, workloadId: number): AccountWorkloadDeal => ({
  id, workloadId, versionNo: 0, name: "", opportunityNo: null, revenueType: "NEW", status: "OPEN",
  targetFiscalYear: null, targetQuarter: null, actualCloseDate: null, contractStartDate: null,
  contractEndDate: null, arrUsd: null, arrKrw: null, acrUsd: null, acrKrw: null,
  winProbability: null, latestUpdate: null, notes: null, deleted: false, deletedAt: null,
  sourceCommitmentId: null
});

const dealWrite = (deal: AccountWorkloadDeal, workloadId: number): DealWrite => ({
  id: deal.id > 0 ? deal.id : null,
  clientId: deal.id > 0 ? null : `deal-${Math.abs(deal.id)}`,
  workloadRef: refFor(workloadId, "workload"),
  versionNo: deal.id > 0 ? deal.versionNo : null,
  name: deal.name,
  opportunityNo: deal.opportunityNo,
  revenueType: deal.revenueType,
  status: deal.status,
  targetFiscalYear: deal.targetFiscalYear,
  targetQuarter: deal.targetQuarter,
  actualCloseDate: deal.actualCloseDate,
  contractStartDate: deal.contractStartDate,
  contractEndDate: deal.contractEndDate,
  arrUsd: deal.arrUsd,
  arrKrw: deal.arrKrw,
  acrUsd: deal.acrUsd,
  acrKrw: deal.acrKrw,
  winProbability: deal.winProbability,
  latestUpdate: deal.latestUpdate,
  notes: deal.notes,
  action: "UPSERT"
});

export function AccountsWorkloadsPage({ canWrite, breadcrumb, onDraftStateChange, initialSearch = "" }: Props) {
  const nextTempId = useRef(-1);
  const [hierarchy, setHierarchy] = useState<AccountsWorkloadsHierarchy>(EMPTY_HIERARCHY);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [includeDeletedDeals, setIncludeDeletedDeals] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveErrors, setSaveErrors] = useState<AccountsWorkloadsFieldError[]>([]);
  const [notice, setNotice] = useState("");
  const [dirtyAccounts, setDirtyAccounts] = useState<Set<number>>(new Set());
  const [dirtyWorkloads, setDirtyWorkloads] = useState<Set<number>>(new Set());
  const [dirtyDeals, setDirtyDeals] = useState<Set<number>>(new Set());
  const [queued, setQueued] = useState<QueuedOperation[]>([]);
  const [planWrites, setPlanWrites] = useState<WorkloadPlanWrite[]>([]);
  const [forecastOpen, setForecastOpen] = useState(false);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastCandidates, setForecastCandidates] = useState<ForecastCandidate[]>([]);
  const [forecastError, setForecastError] = useState("");
  const [candidateWorkload, setCandidateWorkload] = useState<Record<string, string>>({});

  const dirty = dirtyAccounts.size + dirtyWorkloads.size + dirtyDeals.size + queued.length + planWrites.length > 0;
  useEffect(() => onDraftStateChange?.(dirty), [dirty, onDraftStateChange]);

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchAccountsWorkloadsHierarchy({ search, includeArchived, includeDeletedDeals });
      setHierarchy(result);
      setDirtyAccounts(new Set()); setDirtyWorkloads(new Set()); setDirtyDeals(new Set());
      setQueued([]); setPlanWrites([]);
    } catch (requestError) {
      setError(friendlyError(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, [search, includeArchived, includeDeletedDeals]);

  const workloadOptions = useMemo(() => hierarchy.accounts.flatMap((account) => account.workloads.map((workload) => ({
    id: workload.id, label: `${account.name} / ${workload.name}`
  }))), [hierarchy]);

  const updateAccount = (id: number, name: string) => {
    setHierarchy((current) => ({ ...current, accounts: current.accounts.map((account) => account.id === id ? { ...account, name } : account) }));
    setDirtyAccounts((current) => new Set(current).add(id));
  };
  const updateWorkload = (id: number, name: string) => {
    setHierarchy((current) => ({ ...current, accounts: current.accounts.map((account) => ({
      ...account, workloads: account.workloads.map((workload) => workload.id === id ? { ...workload, name } : workload)
    })) }));
    setDirtyWorkloads((current) => new Set(current).add(id));
  };
  const updateDeal = (id: number, field: keyof AccountWorkloadDeal, value: unknown) => {
    setHierarchy((current) => ({ ...current, accounts: current.accounts.map((account) => ({
      ...account, workloads: account.workloads.map((workload) => ({
        ...workload, deals: workload.deals.map((deal) => deal.id === id ? { ...deal, [field]: value } : deal)
      }))
    })) }));
    setDirtyDeals((current) => new Set(current).add(id));
  };

  const addAccount = (name = "") => {
    const id = nextTempId.current--;
    setHierarchy((current) => ({ ...current, accounts: [...current.accounts, { id, versionNo: 0, name, archived: false, workloads: [] }] }));
    setDirtyAccounts((current) => new Set(current).add(id));
  };
  const addWorkload = (accountId: number) => {
    const id = nextTempId.current--;
    setHierarchy((current) => ({ ...current, accounts: current.accounts.map((account) => account.id === accountId
      ? { ...account, workloads: [...account.workloads, { id, versionNo: 0, name: "", archived: false, plans: [], deals: [] }] }
      : account) }));
    setDirtyWorkloads((current) => new Set(current).add(id));
  };
  const addDeal = (workloadId: number) => {
    const id = nextTempId.current--;
    setHierarchy((current) => ({ ...current, accounts: current.accounts.map((account) => ({ ...account,
      workloads: account.workloads.map((workload) => workload.id === workloadId
        ? { ...workload, deals: [...workload.deals, emptyDeal(id, workloadId)] }
        : workload)
    })) }));
    setDirtyDeals((current) => new Set(current).add(id));
  };

  const archiveAccount = (account: AccountHierarchyAccount) => {
    if (account.id < 0) {
      setHierarchy((current) => ({ ...current, accounts: current.accounts.filter((item) => item.id !== account.id) }));
      setDirtyAccounts((current) => { const next = new Set(current); next.delete(account.id); return next; });
      return;
    }
    setDirtyAccounts((current) => { const next = new Set(current); next.delete(account.id); return next; });
    setQueued((current) => [...current, { entity: "account", id: account.id, versionNo: account.versionNo, name: account.name, action: account.archived ? "RESTORE" : "ARCHIVE" }]);
    setHierarchy((current) => ({ ...current, accounts: current.accounts.filter((item) => item.id !== account.id) }));
  };
  const archiveWorkload = (workload: AccountWorkload) => {
    if (workload.id < 0) {
      setHierarchy((current) => ({ ...current, accounts: current.accounts.map((account) => ({ ...account, workloads: account.workloads.filter((item) => item.id !== workload.id) })) }));
      setDirtyWorkloads((current) => { const next = new Set(current); next.delete(workload.id); return next; });
      return;
    }
    setDirtyWorkloads((current) => { const next = new Set(current); next.delete(workload.id); return next; });
    setQueued((current) => [...current, { entity: "workload", id: workload.id, versionNo: workload.versionNo, name: workload.name, action: workload.archived ? "RESTORE" : "ARCHIVE" }]);
    setHierarchy((current) => ({ ...current, accounts: current.accounts.map((account) => ({ ...account, workloads: account.workloads.filter((item) => item.id !== workload.id) })) }));
  };
  const deleteDeal = (deal: AccountWorkloadDeal) => {
    if (deal.id > 0) setQueued((current) => [...current, { entity: "deal", id: deal.id, versionNo: deal.versionNo, action: deal.deleted ? "RESTORE" : "DELETE" }]);
    setHierarchy((current) => ({ ...current, accounts: current.accounts.map((account) => ({ ...account, workloads: account.workloads.map((workload) => ({ ...workload, deals: workload.deals.filter((item) => item.id !== deal.id) })) })) }));
    setDirtyDeals((current) => { const next = new Set(current); next.delete(deal.id); return next; });
  };

  const removePlan = (workloadId: number, planId: number) => {
    const plan = hierarchy.accounts.flatMap((account) => account.workloads)
      .find((workload) => workload.id === workloadId)?.plans.find((item) => item.id === planId);
    if (!plan) return;
    setPlanWrites((current) => [...current, {
      id: plan.id, workloadRef: null, versionNo: plan.versionNo,
      sourcePlanId: plan.sourcePlanId, sourcePlanNumber: plan.sourcePlanNumber, action: "DELETE"
    }]);
  };
  const removeQueuedPlan = (writeIndex: number) =>
    setPlanWrites((current) => current.filter((_, index) => index !== writeIndex));

  const validateDraft = () => {
    for (const account of hierarchy.accounts) {
      if (dirtyAccounts.has(account.id) && !account.name.trim()) return "Every account requires a name.";
      for (const workload of account.workloads) {
        if (dirtyWorkloads.has(workload.id) && !workload.name.trim()) return "Every workload requires a name.";
        for (const deal of workload.deals) {
          if (!dirtyDeals.has(deal.id)) continue;
          if (!deal.name.trim()) return "Every deal requires a name.";
          if ((deal.targetFiscalYear === null) !== (deal.targetQuarter === null)) return "A deal target requires both fiscal year and quarter.";
          if (deal.targetFiscalYear && !/^FY\d{2}$/.test(deal.targetFiscalYear)) return "Target fiscal year must use FYnn format.";
          if (deal.winProbability !== null && (deal.winProbability < 0 || deal.winProbability > 100)) return "Win probability must be from 0 to 100.";
        }
      }
    }
    return "";
  };

  const save = async () => {
    const validation = validateDraft();
    if (validation) { setError(validation); setSaveErrors([]); return; }
    const request: AccountsWorkloadsHierarchySaveRequest = { accounts: [], workloads: [], deals: [], workloadPlans: [...planWrites] };
    hierarchy.accounts.forEach((account) => {
      if (dirtyAccounts.has(account.id)) request.accounts.push({ id: account.id > 0 ? account.id : null, clientId: account.id > 0 ? null : refFor(account.id, "account"), versionNo: account.id > 0 ? account.versionNo : null, name: account.name, action: "UPSERT" });
      account.workloads.forEach((workload) => {
        if (dirtyWorkloads.has(workload.id)) request.workloads.push({ id: workload.id > 0 ? workload.id : null, clientId: workload.id > 0 ? null : refFor(workload.id, "workload"), accountRef: refFor(account.id, "account"), versionNo: workload.id > 0 ? workload.versionNo : null, name: workload.name, action: "UPSERT" });
        workload.deals.forEach((deal) => { if (dirtyDeals.has(deal.id)) request.deals.push(dealWrite(deal, workload.id)); });
      });
    });
    queued.forEach((operation) => {
      if (operation.entity === "account") request.accounts.push({ id: operation.id, clientId: null, versionNo: operation.versionNo, name: operation.name, action: operation.action });
      else if (operation.entity === "workload") request.workloads.push({ id: operation.id, clientId: null, accountRef: null, versionNo: operation.versionNo, name: operation.name, action: operation.action });
      else request.deals.push({ id: operation.id, clientId: null, workloadRef: null, versionNo: operation.versionNo, name: null, opportunityNo: null, revenueType: null, status: null, targetFiscalYear: null, targetQuarter: null, actualCloseDate: null, contractStartDate: null, contractEndDate: null, arrUsd: null, arrKrw: null, acrUsd: null, acrKrw: null, winProbability: null, latestUpdate: null, notes: null, action: operation.action });
    });
    setSaving(true); setError(""); setSaveErrors([]); setNotice("");
    try {
      const saved = await saveAccountsWorkloadsHierarchy(request);
      setHierarchy(saved); setDirtyAccounts(new Set()); setDirtyWorkloads(new Set()); setDirtyDeals(new Set()); setQueued([]); setPlanWrites([]); setSaveErrors([]);
      setNotice("Changes saved.");
    } catch (saveError) {
      // Keep the complete draft and queued operations so validation/conflict errors are retryable.
      setError(friendlyError(saveError));
      setSaveErrors(saveError instanceof AccountsWorkloadsApiError ? saveError.errors : []);
    } finally { setSaving(false); }
  };

  const openForecast = async () => {
    setForecastOpen(true); setForecastLoading(true); setForecastError("");
    try { setForecastCandidates(await fetchForecastCandidates()); }
    catch (requestError) { setForecastError(friendlyError(requestError)); }
    finally { setForecastLoading(false); }
  };
  const addCandidate = (candidate: ForecastCandidate, index: number) => {
    if (candidate.planId === null) {
      if (!hierarchy.accounts.some((account) => normalized(account.name) === normalized(candidate.normalizedAccount))) addAccount(candidate.accountName);
      setNotice(`Added ${candidate.accountName} as a draft account.`); return;
    }
    const workloadId = Number(candidateWorkload[String(index)] || workloadOptions[0]?.id);
    if (!workloadId) return;
    if (candidate.linkedWorkloadIds.includes(workloadId) || planWrites.some((write) => write.workloadRef === String(workloadId) && write.sourcePlanId === candidate.planId)) {
      setForecastError("That Forecast plan is already linked to the selected workload."); return;
    }
    setPlanWrites((current) => [...current, { id: null, workloadRef: refFor(workloadId, "workload"), versionNo: null, sourcePlanId: candidate.planId, sourcePlanNumber: candidate.planNumber, action: "UPSERT" }]);
    setNotice(`Queued ${candidate.planNumber ?? candidate.accountName} for linking.`);
  };

  return <section class="accounts-workloads-page accounts-hierarchy-page" aria-labelledby="accountsWorkloadsTitle">
    <header class="accounts-workloads-header">
      <div>{breadcrumb}<h1 id="accountsWorkloadsTitle">Accounts &amp; Workloads</h1><p>Manage accounts, workloads, and their deals independently of fiscal year.</p></div>
      <div class="accounts-workloads-actions">
        <oj-button disabled={!canWrite || saving} onojAction={() => addAccount()}>Add Account</oj-button>
        <oj-button disabled={!canWrite || saving} onojAction={() => void openForecast()}>Forecast에서 추가</oj-button>
        <oj-button chroming="callToAction" disabled={!canWrite || !dirty || saving} onojAction={() => void save()}>{saving ? "Saving…" : "Save changes"}</oj-button>
      </div>
    </header>
    {!canWrite && <div class="accounts-workloads-banner" role="status">Read-only access. Write permission is required to change Accounts, Workloads, Plans, or Deals.</div>}
    <form class="accounts-workloads-toolbar" onSubmit={(event) => { event.preventDefault(); if (dirty) { setError("Save or discard draft changes before searching."); return; } setSearch(searchInput.trim()); }}>
      <label class="accounts-workloads-search">Search hierarchy<div class="accounts-workloads-search__control"><input value={searchInput} onInput={(event) => setSearchInput((event.currentTarget as HTMLInputElement).value)} placeholder="Account, workload, or deal"/><button type="submit" aria-label="Search">⌕</button></div></label>
      <label class="accounts-workloads-switch"><input type="checkbox" checked={includeArchived} disabled={dirty} onChange={(event) => setIncludeArchived(event.currentTarget.checked)}/> Include archived</label>
      <label class="accounts-workloads-switch"><input type="checkbox" checked={includeDeletedDeals} disabled={dirty} onChange={(event) => setIncludeDeletedDeals(event.currentTarget.checked)}/> Include deleted deals</label>
      <oj-button disabled={loading || saving || dirty} onojAction={() => void reload()}>Refresh</oj-button>
    </form>
    {error && <div class="accounts-workloads-banner accounts-workloads-banner--error" role="alert">
      <strong>{error}</strong>
      {saveErrors.length > 0 && <ul>{saveErrors.map((item) => <li key={`${item.entity}-${item.operationIndex}-${item.field}`}>{item.entity} {item.clientId ?? `#${item.operationIndex + 1}`} · {item.field}: {item.message}</li>)}</ul>}
    </div>}
    {notice && <div class="accounts-workloads-banner" role="status">{notice}</div>}
    {loading ? <div class="accounts-workloads-loading" role="status"><oj-progress-circle value={-1} size="md"></oj-progress-circle> Loading hierarchy…</div> :
      <div class="accounts-hierarchy" aria-label="Account hierarchy">
        {hierarchy.accounts.length === 0 && <div class="kap-empty-state"><h2>No accounts found</h2><p>Adjust the search or add your first account.</p></div>}
        {hierarchy.accounts.map((account) => <article class="accounts-hierarchy__account" key={account.id}>
          <div class="accounts-hierarchy__heading">
            <input aria-label="Account name" disabled={!canWrite} value={account.name} onInput={(event) => updateAccount(account.id, event.currentTarget.value)}/>
            <span>{account.workloads.length} workload{account.workloads.length === 1 ? "" : "s"}</span>
            {canWrite && <><button type="button" onClick={() => addWorkload(account.id)}>Add Workload</button><button type="button" class="is-danger" onClick={() => archiveAccount(account)}>{account.archived ? "Restore" : "Archive"}</button></>}
          </div>
          <div class="accounts-hierarchy__workloads">
            {account.workloads.map((workload) => <section class="accounts-hierarchy__workload" key={workload.id}>
              <div class="accounts-hierarchy__workload-heading"><input aria-label="Workload name" disabled={!canWrite} value={workload.name} onInput={(event) => updateWorkload(workload.id, event.currentTarget.value)}/>
                <span>{workload.plans.filter((plan) => !planWrites.some((write) => write.id === plan.id && write.action === "DELETE")).length + planWrites.filter((write) => write.action === "UPSERT" && write.workloadRef === refFor(workload.id, "workload")).length} Forecast link(s)</span>
                {canWrite && <><button type="button" onClick={() => addDeal(workload.id)}>Add Deal</button><button type="button" class="is-danger" onClick={() => archiveWorkload(workload)}>{workload.archived ? "Restore" : "Archive"}</button></>}
              </div>
              <div class="accounts-hierarchy__plans" aria-label={`Forecast plans linked to ${workload.name}`}>
                <span class="accounts-hierarchy__level-label">Plans</span>
                {workload.plans.filter((plan) => !planWrites.some((write) => write.id === plan.id && write.action === "DELETE")).map((plan) => <span class="accounts-hierarchy__plan" key={plan.id}>
                  {plan.sourcePlanNumber ?? `Forecast plan ${plan.sourcePlanId ?? plan.id}`}
                  {canWrite && <button type="button" aria-label={`Unlink ${plan.sourcePlanNumber ?? "Forecast plan"}`} onClick={() => removePlan(workload.id, plan.id)}>×</button>}
                </span>)}
                {planWrites.map((write, writeIndex) => write.action === "UPSERT" && write.workloadRef === refFor(workload.id, "workload") ? <span class="accounts-hierarchy__plan is-draft" key={`draft-plan-${writeIndex}`}>
                  {write.sourcePlanNumber ?? `Forecast plan ${write.sourcePlanId}`} <small>Draft</small>
                  {canWrite && <button type="button" aria-label={`Remove draft ${write.sourcePlanNumber ?? "Forecast plan"}`} onClick={() => removeQueuedPlan(writeIndex)}>×</button>}
                </span> : null)}
                {workload.plans.length === 0 && !planWrites.some((write) => write.action === "UPSERT" && write.workloadRef === refFor(workload.id, "workload")) && <span class="accounts-hierarchy__empty">No plans linked.</span>}
              </div>
              <div class="accounts-hierarchy__deals">
                <span class="accounts-hierarchy__level-label">Deals</span>
                {workload.deals.length === 0 && <p class="accounts-hierarchy__empty">No deals yet.</p>}
                {workload.deals.map((deal) => <div class="accounts-hierarchy__deal" key={deal.id}>
                  <label>Deal Name<input disabled={!canWrite} value={deal.name} onInput={(event) => updateDeal(deal.id, "name", event.currentTarget.value)}/></label>
                  <label>Opportunity<input disabled={!canWrite} value={deal.opportunityNo ?? ""} onInput={(event) => updateDeal(deal.id, "opportunityNo", nullable(event.currentTarget.value))}/></label>
                  <label>Revenue Type<select disabled={!canWrite} value={deal.revenueType} onChange={(event) => updateDeal(deal.id, "revenueType", event.currentTarget.value)}><option value="NEW">New</option><option value="EXPANSION">Expansion</option><option value="RENEWAL">Renewal</option></select></label>
                  <label>Status<select disabled={!canWrite} value={deal.status} onChange={(event) => updateDeal(deal.id, "status", event.currentTarget.value)}><option value="OPEN">Open</option><option value="WON">Won</option><option value="LOST">Lost</option></select></label>
                  <label>Target FY<input disabled={!canWrite} placeholder="FY28" value={deal.targetFiscalYear ?? ""} onInput={(event) => updateDeal(deal.id, "targetFiscalYear", nullable(event.currentTarget.value.toUpperCase()))}/></label>
                  <label>Quarter<select disabled={!canWrite} value={deal.targetQuarter ?? ""} onChange={(event) => updateDeal(deal.id, "targetQuarter", numeric(event.currentTarget.value))}><option value="">—</option><option value="1">Q1</option><option value="2">Q2</option><option value="3">Q3</option><option value="4">Q4</option></select></label>
                  <label>Win %<input type="number" min="0" max="100" disabled={!canWrite} value={deal.winProbability ?? ""} onInput={(event) => updateDeal(deal.id, "winProbability", numeric(event.currentTarget.value))}/></label>
                  <label>Close Date<input type="date" disabled={!canWrite} value={deal.actualCloseDate ?? ""} onInput={(event) => updateDeal(deal.id, "actualCloseDate", nullable(event.currentTarget.value))}/></label>
                  <label>Start Date<input type="date" disabled={!canWrite} value={deal.contractStartDate ?? ""} onInput={(event) => updateDeal(deal.id, "contractStartDate", nullable(event.currentTarget.value))}/></label>
                  <label>End Date<input type="date" disabled={!canWrite} value={deal.contractEndDate ?? ""} onInput={(event) => updateDeal(deal.id, "contractEndDate", nullable(event.currentTarget.value))}/></label>
                  <label>ARR ($)<input type="number" disabled={!canWrite} value={deal.arrUsd ?? ""} onInput={(event) => updateDeal(deal.id, "arrUsd", numeric(event.currentTarget.value))}/></label>
                  <label>ARR (₩)<input type="number" disabled={!canWrite} value={deal.arrKrw ?? ""} onInput={(event) => updateDeal(deal.id, "arrKrw", numeric(event.currentTarget.value))}/></label>
                  <label>ACR ($)<input type="number" disabled={!canWrite} value={deal.acrUsd ?? ""} onInput={(event) => updateDeal(deal.id, "acrUsd", numeric(event.currentTarget.value))}/></label>
                  <label>ACR (₩)<input type="number" disabled={!canWrite} value={deal.acrKrw ?? ""} onInput={(event) => updateDeal(deal.id, "acrKrw", numeric(event.currentTarget.value))}/></label>
                  <label class="accounts-hierarchy__wide">Latest Update<input disabled={!canWrite} value={deal.latestUpdate ?? ""} onInput={(event) => updateDeal(deal.id, "latestUpdate", nullable(event.currentTarget.value))}/></label>
                  <label class="accounts-hierarchy__wide">Notes<input disabled={!canWrite} value={deal.notes ?? ""} onInput={(event) => updateDeal(deal.id, "notes", nullable(event.currentTarget.value))}/></label>
                  {canWrite && <button type="button" class="is-danger" onClick={() => deleteDeal(deal)}>{deal.deleted ? "Restore" : "Delete"}</button>}
                </div>)}
              </div>
            </section>)}
          </div>
        </article>)}
      </div>}
    {forecastOpen && <div class="accounts-workloads-dialog-backdrop" role="presentation"><section class="accounts-workloads-dialog accounts-forecast-dialog" role="dialog" aria-modal="true" aria-labelledby="forecastCandidatesTitle">
      <header><div><h2 id="forecastCandidatesTitle">Forecast candidates</h2><p>All candidates are shown, including plans already linked elsewhere.</p></div><button type="button" aria-label="Close" onClick={() => setForecastOpen(false)}>×</button></header>
      {forecastError && <div class="accounts-workloads-banner accounts-workloads-banner--error" role="alert">{forecastError}</div>}
      {forecastLoading ? <div role="status">Loading Forecast candidates…</div> : <div class="accounts-forecast-list">
        {forecastCandidates.map((candidate, index) => <div class="accounts-forecast-candidate" key={`${candidate.normalizedAccount}-${candidate.planId ?? "account"}`}>
          <div><strong>{candidate.accountName}</strong><span>{candidate.planNumber ?? "Account only"}</span>{candidate.linked && <small>Linked to {candidate.linkedWorkloadIds.length} workload(s)</small>}</div>
          {candidate.planId !== null && <select aria-label={`Destination for ${candidate.planNumber ?? candidate.accountName}`} value={candidateWorkload[String(index)] ?? ""} onChange={(event) => setCandidateWorkload((current) => ({ ...current, [String(index)]: event.currentTarget.value }))}><option value="">Select workload</option>{workloadOptions.map((option) => <option value={String(option.id)}>{option.label}</option>)}</select>}
          <button type="button" disabled={!canWrite || (candidate.planId !== null && workloadOptions.length === 0)} onClick={() => addCandidate(candidate, index)}>{candidate.planId === null ? "Add Account" : "Link"}</button>
        </div>)}
      </div>}
      <footer><button type="button" onClick={() => setForecastOpen(false)}>Done</button></footer>
    </section></div>}
  </section>;
}
