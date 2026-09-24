import { ComponentChildren, Fragment, h } from "preact";
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

type QueuedOperation =
  | Readonly<{ entity: "account"; id: number; versionNo: number; name: string; action: "ARCHIVE" | "RESTORE" }>
  | Readonly<{ entity: "workload"; id: number; versionNo: number; name: string; lastUpdated: string | null; notes: string | null; action: "ARCHIVE" | "RESTORE" }>
  | Readonly<{ entity: "deal"; id: number; versionNo: number; action: "DELETE" | "RESTORE" }>;

const EMPTY_HIERARCHY: AccountsWorkloadsHierarchy = { fiscalYear: null, accounts: [] };
const refFor = (id: number, entity: "account" | "workload") => id > 0 ? String(id) : `${entity}-${Math.abs(id)}`;
const nullable = (value: string) => value.trim() || null;
const numeric = (value: string): number | null => value.trim() === "" ? null : Number(value);
const normalizedAccountIdentity = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleUpperCase();
const friendlyError = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";
const stopPropagation = (event: Event) => event.stopPropagation();
const CANDIDATE_WORKLOAD_NAME = "미정의 — 수정 필요";
const isInteractiveTarget = (target: EventTarget | null) =>
  target instanceof Element && Boolean(target.closest("input, select, textarea, button, a, oj-button"));
const targetPeriod = (deal: AccountWorkloadDeal) =>
  deal.targetFiscalYear && deal.targetQuarter ? `${deal.targetFiscalYear} Q${deal.targetQuarter}` : "";
const targetOptions = (deal: AccountWorkloadDeal) => {
  const options: string[] = [];
  for (let year = 24; year <= 35; year += 1) for (let quarter = 1; quarter <= 4; quarter += 1) options.push(`FY${year} Q${quarter}`);
  const current = targetPeriod(deal);
  return current && !options.includes(current) ? [current, ...options] : options;
};

const emptyDeal = (id: number, workloadId: number): AccountWorkloadDeal => ({
  id, workloadId, versionNo: 0, name: "", opportunityNo: null, revenueType: "NEW", status: "OPEN",
  targetFiscalYear: null, targetQuarter: null, actualCloseDate: null, contractStartDate: null,
  contractEndDate: null, arrUsd: null, arrKrw: null, acrUsd: null, acrKrw: null,
  winProbability: null, latestUpdate: null, notes: null, deleted: false, deletedAt: null,
  sourceCommitmentId: null
});

const emptyWorkload = (id: number, name = ""): AccountWorkload => ({
  id, versionNo: 0, name, lastUpdated: null, notes: null, archived: false, plans: [], deals: []
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
  // Notes stays hidden and must round-trip unchanged; Latest Update is edited in the child table.
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
  const [expandedWorkloads, setExpandedWorkloads] = useState<Set<number>>(new Set());
  const [forecastOpen, setForecastOpen] = useState(false);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastCandidates, setForecastCandidates] = useState<ForecastCandidate[]>([]);
  const [forecastError, setForecastError] = useState("");
  const [selectedCandidateKeys, setSelectedCandidateKeys] = useState<Set<string>>(new Set());

  const dirty = dirtyAccounts.size + dirtyWorkloads.size + dirtyDeals.size + queued.length + planWrites.length > 0;
  useEffect(() => onDraftStateChange?.(dirty), [dirty, onDraftStateChange]);

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchAccountsWorkloadsHierarchy({ search, includeArchived, includeDeletedDeals });
      setHierarchy(result);
      setDirtyAccounts(new Set()); setDirtyWorkloads(new Set()); setDirtyDeals(new Set());
      setQueued([]); setPlanWrites([]); setExpandedWorkloads(new Set());
    } catch (requestError) {
      setError(friendlyError(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, [search, includeArchived, includeDeletedDeals]);

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
  const updateDeal = (id: number, field: keyof AccountWorkloadDeal, value: unknown) => {
    setHierarchy((current) => ({ ...current, accounts: current.accounts.map((account) => ({
      ...account, workloads: account.workloads.map((workload) => ({
        ...workload, deals: workload.deals.map((deal) => deal.id === id ? { ...deal, [field]: value } : deal)
      }))
    })) }));
    setDirtyDeals((current) => new Set(current).add(id));
  };
  const updateDealTarget = (dealId: number, value: string) => {
    const match = /^(FY\d{2}) Q([1-4])$/.exec(value);
    updateDeal(dealId, "targetFiscalYear", match?.[1] ?? null);
    updateDeal(dealId, "targetQuarter", match ? Number(match[2]) : null);
  };

  const addAccountWorkload = (accountName = "", workloadName = "") => {
    const accountId = nextTempId.current--;
    const workloadId = nextTempId.current--;
    const workload = emptyWorkload(workloadId, workloadName);
    setHierarchy((current) => ({ ...current, accounts: [{
      id: accountId, versionNo: 0, name: accountName, archived: false, workloads: [workload]
    }, ...current.accounts] }));
    setDirtyAccounts((current) => new Set(current).add(accountId));
    setDirtyWorkloads((current) => new Set(current).add(workloadId));
    setExpandedWorkloads((current) => new Set(current).add(workloadId));
    return workloadId;
  };
  const addWorkload = (accountId: number) => {
    const id = nextTempId.current--;
    setHierarchy((current) => ({ ...current, accounts: current.accounts.map((account) => account.id === accountId
      ? { ...account, workloads: [emptyWorkload(id), ...account.workloads] }
      : account) }));
    setDirtyWorkloads((current) => new Set(current).add(id));
    setExpandedWorkloads((current) => new Set(current).add(id));
  };
  const addDeal = (workloadId: number) => {
    const id = nextTempId.current--;
    setHierarchy((current) => ({ ...current, accounts: current.accounts.map((account) => ({ ...account,
      workloads: account.workloads.map((workload) => workload.id === workloadId
        ? { ...workload, deals: [emptyDeal(id, workloadId), ...workload.deals] }
        : workload)
    })) }));
    setDirtyDeals((current) => new Set(current).add(id));
    setExpandedWorkloads((current) => new Set(current).add(workloadId));
  };

  const archiveAccount = (account: AccountHierarchyAccount) => {
    if (account.id < 0) {
      const workloadIds = new Set(account.workloads.map((workload) => workload.id));
      const dealIds = new Set(account.workloads.flatMap((workload) => workload.deals.map((deal) => deal.id)));
      setDirtyAccounts((current) => { const next = new Set(current); next.delete(account.id); return next; });
      setDirtyWorkloads((current) => new Set([...current].filter((id) => !workloadIds.has(id))));
      setDirtyDeals((current) => new Set([...current].filter((id) => !dealIds.has(id))));
    } else {
      setDirtyAccounts((current) => { const next = new Set(current); next.delete(account.id); return next; });
      setQueued((current) => [...current, { entity: "account", id: account.id, versionNo: account.versionNo, name: account.name, action: account.archived ? "RESTORE" : "ARCHIVE" }]);
    }
    setHierarchy((current) => ({ ...current, accounts: current.accounts.filter((item) => item.id !== account.id) }));
  };
  const archiveWorkload = (workload: AccountWorkload) => {
    if (workload.id < 0) {
      const dealIds = new Set(workload.deals.map((deal) => deal.id));
      setDirtyWorkloads((current) => { const next = new Set(current); next.delete(workload.id); return next; });
      setDirtyDeals((current) => new Set([...current].filter((id) => !dealIds.has(id))));
    } else {
      setDirtyWorkloads((current) => { const next = new Set(current); next.delete(workload.id); return next; });
      setQueued((current) => [...current, { entity: "workload", id: workload.id, versionNo: workload.versionNo, name: workload.name,
        lastUpdated: workload.lastUpdated, notes: workload.notes, action: workload.archived ? "RESTORE" : "ARCHIVE" }]);
    }
    setHierarchy((current) => ({ ...current, accounts: current.accounts.map((account) => ({
      ...account, workloads: account.workloads.filter((item) => item.id !== workload.id)
    })) }));
  };
  const deleteDeal = (deal: AccountWorkloadDeal) => {
    if (deal.id > 0) setQueued((current) => [...current, { entity: "deal", id: deal.id, versionNo: deal.versionNo, action: deal.deleted ? "RESTORE" : "DELETE" }]);
    setHierarchy((current) => ({ ...current, accounts: current.accounts.map((account) => ({ ...account, workloads: account.workloads.map((workload) => ({
      ...workload, deals: workload.deals.filter((item) => item.id !== deal.id)
    })) })) }));
    setDirtyDeals((current) => { const next = new Set(current); next.delete(deal.id); return next; });
  };
  const removePlan = (workloadId: number, planId: number) => {
    const plan = hierarchy.accounts.flatMap((account) => account.workloads)
      .find((workload) => workload.id === workloadId)?.plans.find((item) => item.id === planId);
    if (!plan) return;
    setPlanWrites((current) => [...current, { id: plan.id, workloadRef: null, versionNo: plan.versionNo,
      sourcePlanId: plan.sourcePlanId, sourcePlanNumber: plan.sourcePlanNumber, action: "DELETE" }]);
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
          ? { ...item, plans: [...item.plans, { id: planId, workloadId: workload.id, sourcePlanId: null, sourcePlanNumber, versionNo: 0 }] }
          : item)
      })) }));
      setPlanWrites((current) => [...current, { id: null, workloadRef, versionNo: null,
        sourcePlanId: null, sourcePlanNumber, action: "UPSERT" }]);
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
  const toggleWorkloadExpanded = (workloadId: number) => setExpandedWorkloads((current) => {
    const next = new Set(current);
    if (next.has(workloadId)) next.delete(workloadId); else next.add(workloadId);
    return next;
  });

  const validateDraft = () => {
    for (const account of hierarchy.accounts) {
      if (dirtyAccounts.has(account.id) && !account.name.trim()) return "Every account requires a name.";
      for (const workload of account.workloads) {
        if (dirtyWorkloads.has(workload.id) && !workload.name.trim()) return "Every workload requires a name.";
        for (const deal of workload.deals) {
          if (!dirtyDeals.has(deal.id)) continue;
          if (!deal.name.trim()) return "Every opportunity requires a name.";
          if ((deal.targetFiscalYear === null) !== (deal.targetQuarter === null)) return "An opportunity target requires both fiscal year and quarter.";
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
        if (dirtyWorkloads.has(workload.id)) request.workloads.push({ id: workload.id > 0 ? workload.id : null, clientId: workload.id > 0 ? null : refFor(workload.id, "workload"), accountRef: refFor(account.id, "account"), versionNo: workload.id > 0 ? workload.versionNo : null, name: workload.name, lastUpdated: workload.lastUpdated, notes: workload.notes, action: "UPSERT" });
        workload.deals.forEach((deal) => { if (dirtyDeals.has(deal.id)) request.deals.push(dealWrite(deal, workload.id)); });
      });
    });
    queued.forEach((operation) => {
      if (operation.entity === "account") request.accounts.push({ id: operation.id, clientId: null, versionNo: operation.versionNo, name: operation.name, action: operation.action });
      else if (operation.entity === "workload") request.workloads.push({ id: operation.id, clientId: null, accountRef: null, versionNo: operation.versionNo, name: operation.name, lastUpdated: operation.lastUpdated, notes: operation.notes, action: operation.action });
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
    setForecastOpen(true); setForecastLoading(true); setForecastError(""); setSelectedCandidateKeys(new Set());
    try { setForecastCandidates(await fetchForecastCandidates()); }
    catch (requestError) { setForecastError(friendlyError(requestError)); }
    finally { setForecastLoading(false); }
  };
  const toggleCandidate = (key: string) => setSelectedCandidateKeys((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
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
      const planId = hasSourcePlan ? nextTempId.current-- : null;
      group.workloads.push({
        ...emptyWorkload(workloadId, CANDIDATE_WORKLOAD_NAME),
        plans: planId === null ? [] : [{
          id: planId, workloadId, sourcePlanId: candidate.planId,
          sourcePlanNumber: candidate.planNumber, versionNo: 0
        }]
      });
      workloadIds.push(workloadId);
      if (hasSourcePlan) writes.push({
        id: null, workloadRef: refFor(workloadId, "workload"), versionNo: null,
        sourcePlanId: candidate.planId, sourcePlanNumber: candidate.planNumber, action: "UPSERT"
      });
    });
    setHierarchy((current) => {
      let accounts = [...current.accounts];
      groups.forEach((group) => {
        if (group.isNew) {
          accounts = [{ id: group.accountId, versionNo: 0, name: group.accountName, archived: false, workloads: group.workloads }, ...accounts];
        } else {
          accounts = accounts.map((account) => account.id === group.accountId
            ? { ...account, workloads: [...group.workloads, ...account.workloads] }
            : account);
        }
      });
      return { ...current, accounts };
    });
    setDirtyAccounts((current) => {
      const next = new Set(current);
      groups.forEach((group) => { if (group.isNew) next.add(group.accountId); });
      return next;
    });
    setDirtyWorkloads((current) => new Set([...current, ...workloadIds]));
    setPlanWrites((current) => [...current, ...writes]);
    setExpandedWorkloads((current) => new Set([...current, ...workloadIds]));
    setSelectedCandidateKeys(new Set());
    setForecastError("");
    setForecastOpen(false);
    setNotice(`Added ${selected.length} Consumption Records candidate${selected.length === 1 ? "" : "s"} as drafts.`);
  };

  const renderOpportunityRows = (workload: AccountWorkload) => workload.deals.map((deal) => <tr key={deal.id} class={dirtyDeals.has(deal.id) ? "is-draft" : undefined}>
    <td><div class="accounts-workloads-oppty-name"><input aria-label="Oppty Name" disabled={!canWrite} value={deal.name} onClick={stopPropagation} onInput={(event) => updateDeal(deal.id, "name", event.currentTarget.value)}/>{dirtyDeals.has(deal.id) && <span class="accounts-workloads-draft-badge">Draft</span>}{canWrite && <button type="button" class="is-danger" onClick={(event) => { event.stopPropagation(); deleteDeal(deal); }}>×</button>}</div></td>
    <td><input aria-label="Oppty No." disabled={!canWrite} value={deal.opportunityNo ?? ""} onClick={stopPropagation} onInput={(event) => updateDeal(deal.id, "opportunityNo", nullable(event.currentTarget.value))}/></td>
    <td><select aria-label="Revenue Type" disabled={!canWrite} value={deal.revenueType} onClick={stopPropagation} onChange={(event) => updateDeal(deal.id, "revenueType", event.currentTarget.value)}><option value="NEW">New</option><option value="EXPANSION">Expansion</option><option value="RENEWAL">Renewal</option></select></td>
    <td><input aria-label="Win Prob" type="number" min="0" max="100" disabled={!canWrite} value={deal.winProbability ?? ""} onClick={stopPropagation} onInput={(event) => updateDeal(deal.id, "winProbability", numeric(event.currentTarget.value))}/></td>
    <td><select aria-label="Target Quarter" disabled={!canWrite} value={targetPeriod(deal)} onClick={stopPropagation} onChange={(event) => updateDealTarget(deal.id, event.currentTarget.value)}><option value="">—</option>{targetOptions(deal).map((option) => <option key={option} value={option}>{option}</option>)}</select></td>
    <td><input aria-label="ARR USD" type="number" disabled={!canWrite} value={deal.arrUsd ?? ""} onClick={stopPropagation} onInput={(event) => updateDeal(deal.id, "arrUsd", numeric(event.currentTarget.value))}/></td>
    <td><input aria-label="ARR KRW" type="number" disabled={!canWrite} value={deal.arrKrw ?? ""} onClick={stopPropagation} onInput={(event) => updateDeal(deal.id, "arrKrw", numeric(event.currentTarget.value))}/></td>
    <td><input aria-label="ACR USD" type="number" disabled={!canWrite} value={deal.acrUsd ?? ""} onClick={stopPropagation} onInput={(event) => updateDeal(deal.id, "acrUsd", numeric(event.currentTarget.value))}/></td>
    <td><input aria-label="ACR KRW" type="number" disabled={!canWrite} value={deal.acrKrw ?? ""} onClick={stopPropagation} onInput={(event) => updateDeal(deal.id, "acrKrw", numeric(event.currentTarget.value))}/></td>
    <td><select aria-label="Status" disabled={!canWrite} value={deal.status} onClick={stopPropagation} onChange={(event) => updateDeal(deal.id, "status", event.currentTarget.value)}><option value="OPEN">Open</option><option value="WON">Won</option><option value="LOST">Lost</option></select></td>
    <td><input aria-label="Close Date" type="date" disabled={!canWrite} value={deal.actualCloseDate ?? ""} onClick={stopPropagation} onInput={(event) => updateDeal(deal.id, "actualCloseDate", nullable(event.currentTarget.value))}/></td>
    <td><input aria-label="Start Date" type="date" disabled={!canWrite} value={deal.contractStartDate ?? ""} onClick={stopPropagation} onInput={(event) => updateDeal(deal.id, "contractStartDate", nullable(event.currentTarget.value))}/></td>
    <td><input aria-label="End Date" type="date" disabled={!canWrite} value={deal.contractEndDate ?? ""} onClick={stopPropagation} onInput={(event) => updateDeal(deal.id, "contractEndDate", nullable(event.currentTarget.value))}/></td>
    <td><input aria-label="Latest Update" disabled={!canWrite} value={deal.latestUpdate ?? ""} onClick={stopPropagation} onInput={(event) => updateDeal(deal.id, "latestUpdate", nullable(event.currentTarget.value))}/></td>
  </tr>);

  return <section class="accounts-workloads-page accounts-hierarchy-page" aria-labelledby="accountsWorkloadsTitle">
    <header class="accounts-workloads-header">
      <div>{breadcrumb}<h1 id="accountsWorkloadsTitle">Accounts &amp; Workloads</h1><p>Manage accounts, workloads, and their opportunities independently of fiscal year.</p></div>
      <div class="accounts-workloads-actions">
        <oj-button disabled={!canWrite || saving} onojAction={() => addAccountWorkload()}>Add Account & Workload</oj-button>
        <oj-button disabled={!canWrite || saving} onojAction={() => void openForecast()}>Consumption Records</oj-button>
        <oj-button chroming="callToAction" disabled={!canWrite || !dirty || saving} onojAction={() => void save()}>{saving ? "Saving…" : "Save changes"}</oj-button>
      </div>
    </header>
    {!canWrite && <div class="accounts-workloads-banner" role="status">Read-only access. Write permission is required to change Accounts, Workloads, Plans, or Opportunities.</div>}
    <form class="accounts-workloads-toolbar" onSubmit={(event) => { event.preventDefault(); if (dirty) { setError("Save or discard draft changes before searching."); return; } setSearch(searchInput.trim()); }}>
      <label class="accounts-workloads-search">Search hierarchy<div class="accounts-workloads-search__control"><input value={searchInput} onInput={(event) => setSearchInput(event.currentTarget.value)} placeholder="Account, workload, or opportunity"/><button type="submit" aria-label="Search">⌕</button></div></label>
      <label class="accounts-workloads-switch"><input type="checkbox" checked={includeArchived} disabled={dirty} onChange={(event) => setIncludeArchived(event.currentTarget.checked)}/> Include archived</label>
      <label class="accounts-workloads-switch"><input type="checkbox" checked={includeDeletedDeals} disabled={dirty} onChange={(event) => setIncludeDeletedDeals(event.currentTarget.checked)}/> Include deleted opportunities</label>
      <oj-button disabled={loading || saving || dirty} onojAction={() => void reload()}>Refresh</oj-button>
    </form>
    {error && <div class="accounts-workloads-banner accounts-workloads-banner--error" role="alert"><strong>{error}</strong>{saveErrors.length > 0 && <ul>{saveErrors.map((item) => <li key={`${item.entity}-${item.operationIndex}-${item.field}`}>{item.entity} {item.clientId ?? `#${item.operationIndex + 1}`} · {item.field}: {item.message}</li>)}</ul>}</div>}
    {notice && <div class="accounts-workloads-banner" role="status">{notice}</div>}
    {loading ? <div class="accounts-workloads-loading" role="status"><oj-progress-circle value={-1} size="md"></oj-progress-circle> Loading hierarchy…</div> :
      <div class="accounts-workloads-grid" tabIndex={0} aria-label="Editable Accounts and Workloads table">
        <table class="accounts-workloads-grid__parent">
          <thead><tr><th>Account</th><th>Workload</th><th>Plan Number</th><th>Last Updated</th><th>Notes</th></tr></thead>
          <tbody>
            {hierarchy.accounts.flatMap((account) => account.workloads.map((workload) => {
              const expanded = expandedWorkloads.has(workload.id);
              const visiblePlans = workload.plans.filter((plan) => !planWrites.some((write) => write.id === plan.id && write.action === "DELETE"));
              const workloadDraft = dirtyAccounts.has(account.id) || dirtyWorkloads.has(workload.id) || planWrites.some((write) => write.workloadRef === refFor(workload.id, "workload") || visiblePlans.some((plan) => plan.id === write.id));
              return <Fragment key={`${account.id}-${workload.id}`}>
                <tr class={`accounts-workloads-parent-row${workloadDraft ? " is-draft" : ""}${expanded ? " is-expanded" : ""}`} aria-expanded={expanded} onClick={(event) => { if (!isInteractiveTarget(event.target)) toggleWorkloadExpanded(workload.id); }}>
                  <td><div class="accounts-workloads-account-cell"><button type="button" class="accounts-workloads-expander" aria-label={`${expanded ? "Collapse" : "Expand"} ${account.name} ${workload.name}`} onClick={(event) => { event.stopPropagation(); toggleWorkloadExpanded(workload.id); }}>{expanded ? "▾" : "▸"}</button><input aria-label="Account" disabled={!canWrite} value={account.name} onClick={stopPropagation} onInput={(event) => updateAccount(account.id, event.currentTarget.value)}/>{workloadDraft && <span class="accounts-workloads-draft-badge">Draft</span>}</div></td>
                  <td><div class="accounts-workloads-workload-cell"><input aria-label="Workload" disabled={!canWrite} value={workload.name} onClick={stopPropagation} onInput={(event) => updateWorkload(workload.id, "name", event.currentTarget.value)}/>{canWrite && <div><button type="button" onClick={(event) => { event.stopPropagation(); addDeal(workload.id); }}>Add Oppty</button><button type="button" onClick={(event) => { event.stopPropagation(); addWorkload(account.id); }}>Add Workload</button><button type="button" class="is-danger" onClick={(event) => { event.stopPropagation(); archiveWorkload(workload); }}>{workload.id < 0 ? "Remove" : workload.archived ? "Restore" : "Archive"}</button></div>}</div></td>
                  <td><div class="accounts-hierarchy__plans"><input aria-label="Plan Number" disabled={!canWrite} value={visiblePlans[0]?.sourcePlanNumber ?? ""} onClick={stopPropagation} onInput={(event) => updatePlanNumber(workload, event.currentTarget.value)}/>{visiblePlans.slice(1).map((plan) => <span class="accounts-hierarchy__plan" key={plan.id}>{plan.sourcePlanNumber ?? `Plan ${plan.sourcePlanId ?? plan.id}`}{canWrite && <button type="button" aria-label={`Unlink ${plan.sourcePlanNumber ?? "plan"}`} onClick={(event) => { event.stopPropagation(); removePlan(workload.id, plan.id); }}>×</button>}</span>)}</div></td>
                  <td><input aria-label="Last Updated" disabled={!canWrite} value={workload.lastUpdated ?? ""} onClick={stopPropagation} onInput={(event) => updateWorkload(workload.id, "lastUpdated", nullable(event.currentTarget.value))}/></td>
                  <td><div class="accounts-workloads-notes-cell"><textarea aria-label="Notes" disabled={!canWrite} value={workload.notes ?? ""} onClick={stopPropagation} onInput={(event) => updateWorkload(workload.id, "notes", nullable(event.currentTarget.value))}/>{canWrite && account.workloads.length === 1 && <button type="button" class="is-danger" onClick={(event) => { event.stopPropagation(); archiveAccount(account); }}>{account.id < 0 ? "Remove row" : account.archived ? "Restore account" : "Archive account"}</button>}</div></td>
                </tr>
                {expanded && <tr class="accounts-workloads-child-row"><td colSpan={5}>
                  <div class="accounts-workloads-opportunities">
                    <div class="accounts-workloads-opportunities__heading"><strong>Opportunities</strong>{canWrite && <button type="button" onClick={(event) => { event.stopPropagation(); addDeal(workload.id); }}>Add Oppty</button>}</div>
                    <table><thead><tr><th>Oppty Name</th><th>Oppty No.</th><th>Revenue Type</th><th>Win Prob</th><th>Target Quarter</th><th>ARR ($)</th><th>ARR (₩)</th><th>ACR ($)</th><th>ACR (₩)</th><th>Status</th><th>Close Date</th><th>Start Date</th><th>End Date</th><th>Latest Update</th></tr></thead><tbody>{renderOpportunityRows(workload)}{workload.deals.length === 0 && <tr><td colSpan={14} class="accounts-workloads-empty">No opportunities yet.</td></tr>}</tbody></table>
                  </div>
                </td></tr>}
              </Fragment>;
            }))}
            {hierarchy.accounts.length === 0 && <tr><td colSpan={5} class="accounts-workloads-empty">No accounts found. Adjust the search or add your first Account &amp; Workload.</td></tr>}
          </tbody>
        </table>
      </div>}
    {forecastOpen && <div class="accounts-workloads-dialog-backdrop" role="presentation"><section class="accounts-workloads-dialog accounts-forecast-dialog" role="dialog" aria-modal="true" aria-labelledby="forecastCandidatesTitle">
      <header><div><h2 id="forecastCandidatesTitle">Consumption Records</h2><p>Select records to add as Account + Workload drafts. Existing saved records and current drafts are excluded.</p></div><button type="button" aria-label="Close" onClick={() => setForecastOpen(false)}>×</button></header>
      {forecastError && <div class="accounts-workloads-banner accounts-workloads-banner--error" role="alert">{forecastError}</div>}
      {forecastLoading ? <div role="status">Loading Consumption Records…</div> : <div class="accounts-forecast-list">
        <table class="accounts-forecast-candidates-table">
          <thead><tr><th aria-label="Select"/><th>Account</th><th>Plan ID(Number)</th></tr></thead>
          <tbody>{missingForecastCandidates.map((candidate) => { const key = forecastCandidateKey(candidate); return <tr class="accounts-forecast-candidate" key={key}>
            <td><input type="checkbox" aria-label={`Select ${candidate.accountName}`} checked={selectedCandidateKeys.has(key)} onChange={() => toggleCandidate(key)}/></td>
            <td>{candidate.accountName}</td>
            <td>{candidate.planNumber ?? "없음"}</td>
          </tr>; })}</tbody>
        </table>
        {missingForecastCandidates.length === 0 && <p class="accounts-workloads-empty">No Consumption Records candidates to add.</p>}
      </div>}
      <footer><span>{selectedCandidateKeys.size} selected / {missingForecastCandidates.length} candidates</span><div><button type="button" onClick={() => setForecastOpen(false)}>Cancel</button><button type="button" disabled={!canWrite || selectedCandidateKeys.size === 0} onClick={addSelectedCandidates}>Add</button></div></footer>
    </section></div>}
  </section>;
}
