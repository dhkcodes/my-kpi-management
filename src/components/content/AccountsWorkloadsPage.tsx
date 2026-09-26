import { ComponentChildren, Fragment, h } from "preact";
import { createPortal } from "preact/compat";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import "ojs/ojbutton";
import "ojs/ojdialog";
import "ojs/ojdatetimepicker";
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
  OpportunityDealResult,
  WorkloadPlanWrite,
  filterForecastCandidates,
  fetchAccountsWorkloadsHierarchy,
  fetchForecastCandidates,
  forecastCandidateKey,
  saveAccountsWorkloadsHierarchy,
  saveAccountsWorkloadsHierarchyWithResults,
} from "../../data/accountsWorkloadsApi";
import { FxRateRecord } from "../../data/kpiConfigurationApi";
import { createOpportunitySaveLock } from "./opportunitySaveLock";
import {
  correlateLegacyOpportunityResults,
  SubmittedOpportunityWrite,
  validateConfirmedOpportunityWrites,
} from "./opportunitySaveReconciliation";
import {
  canonicalizeOpportunityRevenueType,
  opportunityRevenueTypeOptions,
} from "../../data/opportunityRevenueType";
import {
  OpportunityCurrencyField,
  updateOpportunityCurrencyPair,
} from "./opportunityCurrency";
import { AppMessageBanner } from "./AppMessageBanner";

type NavigationGuard = (label: string, action: () => void) => void;

type Props = Readonly<{
  canWrite: boolean;
  breadcrumb?: ComponentChildren;
  onDraftStateChange?: (active: boolean) => void;
  onNavigationGuardChange?: (guard: NavigationGuard | null, hasUnsavedChanges: boolean) => void;
  initialSearch?: string;
  fxRate: FxRateRecord | null;
  fxLoading: boolean;
  fxError: string;
  onFxRateChange: (rateValue: number) => Promise<FxRateRecord>;
}>;
type AwField = "account" | "workload" | "salesRep" | "plan" | "lastUpdated" | "notes";
type DealField =
  | "name"
  | "opportunityNo"
  | "revenueType"
  | "winProbability"
  | "target"
  | "arrUsd"
  | "arrKrw"
  | "acrUsd"
  | "acrKrw"
  | "status"
  | "actualCloseDate"
  | "contractStartDate"
  | "contractEndDate"
  | "latestUpdate";
type SortField = AwField | "arrUsd" | "acrUsd" | "opptyCount";
type EditCell = Readonly<{ key: string; field: AwField }>;
type DealEditCell = Readonly<{ key: string; field: DealField }>;
type DealDraft = Readonly<{
  key: string;
  workloadId: number;
  original: AccountWorkloadDeal | null;
  deal: AccountWorkloadDeal;
}>;
type PendingDealConfirmation = Readonly<{
  drafts: ReadonlyArray<DealDraft>;
  submittedWrites: ReadonlyArray<SubmittedOpportunityWrite>;
  dealResults: ReadonlyArray<OpportunityDealResult>;
  knownServerIds: ReadonlyArray<number>;
}>;

const EMPTY: AccountsWorkloadsHierarchy = { fiscalYear: null, accounts: [] };
const CANDIDATE_WORKLOAD_NAME = "미정의 — 수정 필요";
const rowKey = (accountId: number, workloadId: number) =>
  `${accountId}:${workloadId}`;
const refFor = (id: number, entity: "account" | "workload") =>
  id > 0 ? String(id) : `${entity}-${Math.abs(id)}`;
const nullable = (value: string) => value.trim() || null;
const numberValue = (value: string) =>
  value.trim() === "" ? null : Number(value);
const normalizedAccount = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLocaleUpperCase();
const friendlyError = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The request could not be completed.";
const isDefiniteWriteRejection = (error: unknown) =>
  error instanceof AccountsWorkloadsApiError &&
  [400, 401, 403, 404, 409, 422].includes(error.status);

const hasUnrecoverableNewDealCorrelationLoss = (
  pending: PendingDealConfirmation | null,
) => Boolean(
  pending?.submittedWrites.some(
    (write) => write.originalId === null &&
      !pending.dealResults.some(
        (result) => result.action === "UPSERT" && result.clientId === write.clientId,
      ),
  ),
);
const isInteractive = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest("input,select,textarea,button,a,oj-button"));
const fmtUsd = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const fmtMoney = (value: number | null) =>
  value === null ? "—" : fmtUsd.format(value);
const targetPeriod = (deal: AccountWorkloadDeal) =>
  deal.targetFiscalYear && deal.targetQuarter
    ? `${deal.targetFiscalYear} Q${deal.targetQuarter}`
    : "";
const DEAL_DRAFT_FIELDS = [
  "name", "opportunityNo", "revenueType", "status", "targetFiscalYear",
  "targetQuarter", "actualCloseDate", "contractStartDate", "contractEndDate",
  "arrUsd", "arrKrw", "acrUsd", "acrKrw", "winProbability", "latestUpdate",
] as const;
const isDealDraftChanged = (draft: DealDraft) => {
  if (!draft.original) return true;
  return DEAL_DRAFT_FIELDS.some(
    (field) =>
      String(draft.deal[field] ?? "") !== String(draft.original?.[field] ?? ""),
  );
};
const currentFiscalYear = (today = new Date()) =>
  (today.getMonth() >= 5 ? today.getFullYear() + 1 : today.getFullYear()) % 100;
export const targetOptionsFor = (fiscalYear = currentFiscalYear()) => [
  `FY${fiscalYear - 1} Q3`, `FY${fiscalYear - 1} Q4`,
  `FY${fiscalYear} Q1`, `FY${fiscalYear} Q2`, `FY${fiscalYear} Q3`, `FY${fiscalYear} Q4`,
  `FY${fiscalYear + 1} Q1`, `FY${fiscalYear + 1} Q2`,
];
const targetOptions = targetOptionsFor();
const emptyWorkload = (id: number, name = "", salesRep: string | null = null): AccountWorkload => ({
  id,
  versionNo: 0,
  name,
  salesRep,
  lastUpdated: null,
  notes: null,
  highlighted: false,
  archived: false,
  plans: [],
  deals: [],
});
const emptyDeal = (id: number, workloadId: number): AccountWorkloadDeal => ({
  id,
  workloadId,
  versionNo: 0,
  name: "",
  opportunityNo: null,
  revenueType: "NEW",
  status: "OPEN",
  targetFiscalYear: null,
  targetQuarter: null,
  actualCloseDate: null,
  contractStartDate: null,
  contractEndDate: null,
  arrUsd: null,
  arrKrw: null,
  acrUsd: null,
  acrKrw: null,
  winProbability: null,
  latestUpdate: null,
  notes: null,
  deleted: false,
  deletedAt: null,
  sourceCommitmentId: null,
});
const mergeSearchResultWithAwDrafts = (
  result: AccountsWorkloadsHierarchy,
  current: AccountsWorkloadsHierarchy,
  dirtyAccountIds: ReadonlySet<number>,
  dirtyWorkloadIds: ReadonlySet<number>,
): AccountsWorkloadsHierarchy => {
  const currentAccounts = new Map(current.accounts.map((account) => [account.id, account]));
  const accounts = result.accounts.map((account) => {
    const currentAccount = currentAccounts.get(account.id);
    if (!currentAccount) return account;
    const currentWorkloads = new Map(currentAccount.workloads.map((workload) => [workload.id, workload]));
    const workloads = account.workloads.map((workload) =>
      dirtyWorkloadIds.has(workload.id) ? currentWorkloads.get(workload.id) ?? workload : workload);
    currentAccount.workloads.forEach((workload) => {
      if ((workload.id < 0 || dirtyWorkloadIds.has(workload.id))
        && !workloads.some((candidate) => candidate.id === workload.id)) workloads.push(workload);
    });
    return {
      ...account,
      name: dirtyAccountIds.has(account.id) ? currentAccount.name : account.name,
      workloads,
    };
  });
  current.accounts.forEach((account) => {
    if ((account.id < 0 || dirtyAccountIds.has(account.id))
      && !accounts.some((candidate) => candidate.id === account.id)) accounts.unshift(account);
  });
  return { ...result, accounts };
};
const dealWrite = (
  deal: AccountWorkloadDeal,
  workloadId: number,
  original: AccountWorkloadDeal | null = null,
  clientId = deal.id > 0 ? `deal:${deal.id}` : `draft:${deal.id}`,
): DealWrite => ({
  id: deal.id > 0 ? deal.id : null,
  clientId,
  workloadRef: String(workloadId),
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
  latestUpdate:
    original &&
    nullable(deal.latestUpdate ?? "") === nullable(original.latestUpdate ?? "")
      ? null
      : deal.latestUpdate,
  notes: deal.notes,
  action: deal.deleted ? "DELETE" : "UPSERT",
});

export function AccountsWorkloadsPage({
  canWrite,
  breadcrumb,
  onDraftStateChange,
  onNavigationGuardChange,
  initialSearch = "",
  fxRate,
  fxLoading,
  fxError,
  onFxRateChange,
}: Props) {
  const nextTempId = useRef(-1);
  const reloadGeneration = useRef(0);
  const preserveDraftsForNextReload = useRef(false);
  const appliedSearchRef = useRef(initialSearch);
  const searchComposingRef = useRef(false);
  const editSnapshot = useRef("");
  const highlightRequests = useRef(new Set<number>());
  const permanentDeleteDialogRef = useRef<any>(null);
  const dealDeleteDialogRef = useRef<any>(null);
  const [hierarchy, setHierarchy] = useState<AccountsWorkloadsHierarchy>(EMPTY);
  const [baseline, setBaseline] = useState<AccountsWorkloadsHierarchy>(EMPTY);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const dealSaveLock = useRef(createOpportunitySaveLock()).current;
  const [error, setError] = useState("");
  const [saveErrors, setSaveErrors] = useState<AccountsWorkloadsFieldError[]>(
    [],
  );
  const [notice, setNotice] = useState("");
  const [actionConfirmation, setActionConfirmation] = useState<"save" | "cancel" | "opportunity-save" | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<Readonly<{ label: string; action: () => void }> | null>(null);
  const initialFxRate = fxRate?.rateValue ?? 0;
  const [savedFxRateValue, setSavedFxRateValue] = useState(initialFxRate);
  const [fxRateValue, setFxRateValue] = useState(initialFxRate);
  const [fxDraft, setFxDraft] = useState(String(initialFxRate || ""));
  const [fxPopoverOpen, setFxPopoverOpen] = useState(false);
  const [fxSaving, setFxSaving] = useState(false);
  const [dirtyAccounts, setDirtyAccounts] = useState<Set<number>>(new Set());
  const [dirtyWorkloads, setDirtyWorkloads] = useState<Set<number>>(new Set());
  const [pendingDeleteWorkloadIds, setPendingDeleteWorkloadIds] = useState<
    Set<number>
  >(new Set());
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [selectedDeals, setSelectedDeals] = useState<Map<number, AccountWorkloadDeal>>(new Map());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [editCell, setEditCell] = useState<EditCell | null>(null);
  const [sortField, setSortField] = useState<SortField>("account");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [dealDrafts, setDealDrafts] = useState<Map<string, DealDraft>>(
    new Map(),
  );
  const [pendingDealConfirmation, setPendingDealConfirmation] =
    useState<PendingDealConfirmation | null>(null);
  const [dealEditCell, setDealEditCell] = useState<DealEditCell | null>(null);
  const [latestUpdateTooltip, setLatestUpdateTooltip] = useState<
    Readonly<{ text: string; top: number; left: number }> | null
  >(null);
  const [permanentDeleteTargets, setPermanentDeleteTargets] = useState<string[]>([]);
  const [dealDeleteTargets, setDealDeleteTargets] = useState<AccountWorkloadDeal[]>([]);
  const [forecastOpen, setForecastOpen] = useState(false);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastCandidates, setForecastCandidates] = useState<
    ForecastCandidate[]
  >([]);
  const [selectedCandidateKeys, setSelectedCandidateKeys] = useState<
    Set<string>
  >(new Set());

  const changedAccountIds = new Set(
    [...dirtyAccounts].filter((id) => {
      const current = hierarchy.accounts.find((account) => account.id === id);
      const original = baseline.accounts.find((account) => account.id === id);
      return Boolean(current && (!original || current.name !== original.name));
    }),
  );
  const changedWorkloadIds = new Set(
    [...dirtyWorkloads].filter((id) => {
      const current = hierarchy.accounts
        .flatMap((account) => account.workloads)
        .find((workload) => workload.id === id);
      const original = baseline.accounts
        .flatMap((account) => account.workloads)
        .find((workload) => workload.id === id);
      if (!current) return false;
      if (!original) return true;
      return (
        current.name !== original.name ||
        (current.salesRep ?? "").trim() !==
          (original.salesRep ?? "").trim() ||
        (current.lastUpdated ?? "") !== (original.lastUpdated ?? "") ||
        (current.notes ?? "") !== (original.notes ?? "") ||
        (current.plans[0]?.sourcePlanNumber?.trim() ?? "") !==
          (original.plans[0]?.sourcePlanNumber?.trim() ?? "")
      );
    }),
  );
  const fxDirty = fxRateValue > 0 && fxRateValue !== savedFxRateValue;
  const fxDraftDirty =
    fxPopoverOpen && fxDraft.trim() !== String(fxRateValue || "");
  const dirty =
    changedAccountIds.size +
      changedWorkloadIds.size +
      [...dealDrafts.values()].filter(isDealDraftChanged).length +
      pendingDeleteWorkloadIds.size >
      0 || fxDirty || fxDraftDirty;
  const isDraftDeletedWorkload = (workloadId: number) =>
    hierarchy.accounts
      .flatMap((account) => account.workloads)
      .some((workload) => workload.id === workloadId && workload.archived);
  useEffect(() => onDraftStateChange?.(dirty), [dirty, onDraftStateChange]);

  useEffect(() => {
    if (fxSaving || fxDirty) return;
    const nextRate = fxRate?.rateValue ?? 0;
    setSavedFxRateValue(nextRate);
    setFxRateValue(nextRate);
    setFxDraft(String(nextRate || ""));
  }, [fxRate, fxSaving, fxDirty]);

  useEffect(() => {
    if (!editCell && !dealEditCell) return;
    const frame = window.requestAnimationFrame(() => {
      const selector = editCell
        ? `[data-aw-row-key="${CSS.escape(editCell.key)}"] td.is-editing-cell input, [data-aw-row-key="${CSS.escape(editCell.key)}"] td.is-editing-cell textarea`
        : `[data-deal-draft-key="${CSS.escape(dealEditCell!.key)}"] td.is-editing-cell input, [data-deal-draft-key="${CSS.escape(dealEditCell!.key)}"] td.is-editing-cell textarea, [data-deal-draft-key="${CSS.escape(dealEditCell!.key)}"] td.is-editing-cell select`;
      const editor = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector);
      editor?.focus();
      if (editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement) {
        const end = editor.value.length;
        editor.setSelectionRange(end, end);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editCell, dealEditCell]);

  const reload = async () => {
    const generation = ++reloadGeneration.current;
    const preserveDrafts = preserveDraftsForNextReload.current;
    preserveDraftsForNextReload.current = false;
    setLoading(true);
    setError("");
    try {
      const result = await fetchAccountsWorkloadsHierarchy({
        search,
        includeArchived: includeDeleted,
        includeDeletedDeals: includeDeleted,
      });
      if (generation !== reloadGeneration.current) return;
      setHierarchy((current) => preserveDrafts
        ? mergeSearchResultWithAwDrafts(result, current, dirtyAccounts, dirtyWorkloads)
        : result);
      setBaseline(result);
      if (!preserveDrafts) {
        setDirtyAccounts(new Set());
        setDirtyWorkloads(new Set());
        setPendingDeleteWorkloadIds(new Set());
        setSelectedRows(new Set());
        setEditCell(null);
      }
    } catch (requestError) {
      if (generation !== reloadGeneration.current) return;
      setError(friendlyError(requestError));
    } finally {
      if (generation === reloadGeneration.current) setLoading(false);
    }
  };
  useEffect(() => {
    void reload();
  }, [search, includeDeleted]);

  const applySearch = (value: string) => {
    const nextSearch = value.trim();
    if (nextSearch === appliedSearchRef.current) return;
    preserveDraftsForNextReload.current = nextSearch === "";
    appliedSearchRef.current = nextSearch;
    reloadGeneration.current++;
    setSearch(nextSearch);
  };

  const allRows = useMemo(() => {
    const flattened = hierarchy.accounts.flatMap((account) =>
      account.workloads.map((workload) => ({
        account,
        workload,
        key: rowKey(account.id, workload.id),
      })),
    );
    const scalar = (item: (typeof flattened)[number]) => {
      const deals = item.workload.deals.filter((deal) => !deal.deleted);
      if (sortField === "account") return item.account.name;
      if (sortField === "workload") return item.workload.name;
      if (sortField === "salesRep") return item.workload.salesRep ?? "";
      if (sortField === "plan")
        return item.workload.plans[0]?.sourcePlanNumber ?? "";
      if (sortField === "lastUpdated") return item.workload.lastUpdated ?? "";
      if (sortField === "notes") return item.workload.notes ?? "";
      if (sortField === "arrUsd")
        return deals.reduce((sum, deal) => sum + (deal.arrUsd ?? 0), 0);
      if (sortField === "acrUsd")
        return deals.reduce((sum, deal) => sum + (deal.acrUsd ?? 0), 0);
      return deals.length;
    };
    return [...flattened].sort((left, right) => {
      if (left.workload.id < 0 && right.workload.id > 0) return -1;
      if (right.workload.id < 0 && left.workload.id > 0) return 1;
      const a = scalar(left);
      const b = scalar(right);
      const result =
        typeof a === "number" && typeof b === "number"
          ? a - b
          : String(a).localeCompare(String(b), undefined, {
              numeric: true,
              sensitivity: "base",
            });
      return (
        (sortDirection === "asc" ? result : -result) ||
        left.key.localeCompare(right.key)
      );
    });
  }, [hierarchy, sortField, sortDirection]);
  // A pending delete is only a local draft. Keep the saved workload and its
  // opportunities visible (and therefore counted) until Save succeeds.
  const rows = allRows;
  const allExpanded = rows.length > 0 && rows.every((row) => expandedRows.has(row.key));

  const missingCandidates = useMemo(
    () => filterForecastCandidates(forecastCandidates, hierarchy.accounts),
    [forecastCandidates, hierarchy.accounts],
  );
  const toggleSort = (field: SortField) => {
    if (sortField === field)
      setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDirection("asc");
    }
  };
  const sortLabel = (field: SortField) =>
    sortField === field ? (sortDirection === "asc" ? "▲" : "▼") : "";

  const updateAw = (
    accountId: number,
    workloadId: number,
    field: AwField,
    value: string,
  ) => {
    setHierarchy((current) => ({
      ...current,
      accounts: current.accounts.map((account) =>
        account.id !== accountId
          ? account
          : {
              ...account,
              name: field === "account" ? value : account.name,
              workloads: account.workloads.map((workload) =>
                workload.id !== workloadId
                  ? workload
                  : field === "workload"
                    ? { ...workload, name: value }
                    : field === "salesRep"
                      ? { ...workload, salesRep: value }
                    : field === "lastUpdated"
                      ? { ...workload, lastUpdated: nullable(value) }
                      : field === "notes"
                        ? { ...workload, notes: nullable(value) }
                        : field === "plan"
                          ? {
                              ...workload,
                              plans: workload.plans.length
                                ? workload.plans.map((plan, index) =>
                                    index === 0
                                      ? {
                                          ...plan,
                                          sourcePlanNumber: nullable(value),
                                        }
                                      : plan,
                                  )
                                : value.trim()
                                  ? [
                                      {
                                        id: nextTempId.current--,
                                        workloadId,
                                        sourcePlanId: null,
                                        sourcePlanNumber: value,
                                        versionNo: 0,
                                      },
                                    ]
                                  : [],
                            }
                          : workload,
              ),
            },
      ),
    }));
    const currentAccount = hierarchy.accounts.find((item) => item.id === accountId);
    const currentWorkload = currentAccount?.workloads.find((item) => item.id === workloadId);
    const baselineAccount = baseline.accounts.find((item) => item.id === accountId);
    const baselineWorkload = baselineAccount?.workloads.find((item) => item.id === workloadId);
    if (field === "account") {
      setDirtyAccounts((current) => {
        const next = new Set(current);
        if (accountId < 0 || value !== (baselineAccount?.name ?? "")) next.add(accountId);
        else next.delete(accountId);
        return next;
      });
    } else {
      const nextName = field === "workload" ? value : (currentWorkload?.name ?? "");
      const nextSalesRep = field === "salesRep" ? value : (currentWorkload?.salesRep ?? "");
      const nextPlan = field === "plan" ? value : (currentWorkload?.plans[0]?.sourcePlanNumber ?? "");
      const nextUpdated = field === "lastUpdated" ? value : (currentWorkload?.lastUpdated ?? "");
      const nextNotes = field === "notes" ? value : (currentWorkload?.notes ?? "");
      const changed = workloadId < 0 || !baselineWorkload ||
        nextName !== baselineWorkload.name ||
        nextSalesRep.trim() !== (baselineWorkload.salesRep ?? "").trim() ||
        nextPlan !== (baselineWorkload.plans[0]?.sourcePlanNumber ?? "") ||
        nextUpdated !== (baselineWorkload.lastUpdated ?? "") ||
        nextNotes !== (baselineWorkload.notes ?? "");
      setDirtyWorkloads((current) => {
        const next = new Set(current);
        if (changed) next.add(workloadId); else next.delete(workloadId);
        return next;
      });
    }
  };

  const awValue = (
    account: AccountHierarchyAccount,
    workload: AccountWorkload,
    field: AwField,
  ) =>
    field === "account"
      ? account.name
      : field === "workload"
        ? workload.name
        : field === "salesRep"
          ? (workload.salesRep ?? "")
        : field === "plan"
          ? (workload.plans[0]?.sourcePlanNumber ?? "")
          : field === "lastUpdated"
            ? (workload.lastUpdated ?? "")
            : (workload.notes ?? "");
  const beginAwEdit = (key: string, field: AwField, value: string) => {
    if (!canWrite) return;
    editSnapshot.current = value;
    setSelectedRows(new Set([key]));
    setEditCell({ key, field });
  };
  const cancelAwCell = (
    accountId: number,
    workloadId: number,
    field: AwField,
  ) => {
    updateAw(accountId, workloadId, field, String(editSnapshot.current ?? ""));
    setEditCell(null);
  };
  const awEditorKey = (
    event: KeyboardEvent,
    accountId: number,
    workloadId: number,
    field: AwField,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelAwCell(accountId, workloadId, field);
    } else if (
      event.key === "Enter" &&
      !((field === "lastUpdated" || field === "notes") && event.shiftKey)
    ) {
      event.preventDefault();
      setEditCell(null);
    }
  };
  const showImmediateTooltip = (
    element: HTMLElement,
    value: string,
    onlyIfClipped = false,
  ) => {
    if (!value || (onlyIfClipped && element.scrollWidth <= element.clientWidth)) {
      setLatestUpdateTooltip(null);
      return;
    }
    const bounds = element.getBoundingClientRect();
    setLatestUpdateTooltip({
      text: value,
      top: bounds.bottom + 6,
      left: Math.min(bounds.left, window.innerWidth - 376),
    });
  };
  const tooltip = (value: string, empty = "—") => (
    <span
      class="accounts-workloads-ellipsis"
      tabIndex={value ? 0 : undefined}
      onMouseEnter={(event) => showImmediateTooltip(event.currentTarget, value, true)}
      onMouseLeave={() => setLatestUpdateTooltip(null)}
      onFocus={(event) => showImmediateTooltip(event.currentTarget, value, true)}
      onBlur={() => setLatestUpdateTooltip(null)}
    >
      {value || empty}
    </span>
  );
  const truncatedWorkload = (value: string) => (
    <span
      class="accounts-workloads-ellipsis"
      tabIndex={value ? 0 : undefined}
      onMouseEnter={(event) => showImmediateTooltip(event.currentTarget, value, true)}
      onMouseLeave={() => setLatestUpdateTooltip(null)}
      onFocus={(event) => showImmediateTooltip(event.currentTarget, value, true)}
      onBlur={() => setLatestUpdateTooltip(null)}
    >
      {value || "—"}
    </span>
  );
  const renderAwCell = (
    account: AccountHierarchyAccount,
    workload: AccountWorkload,
    field: AwField,
  ) => {
    const key = rowKey(account.id, workload.id);
    const value = awValue(account, workload, field);
    const editing = editCell?.key === key && editCell.field === field;
    const baselineAccount = baseline.accounts.find(
      (item) => item.id === account.id,
    );
    const baselineWorkload = baselineAccount?.workloads.find(
      (item) => item.id === workload.id,
    );
    const original =
      baselineAccount && baselineWorkload
        ? awValue(baselineAccount, baselineWorkload, field)
        : "";
    const changed = !baselineWorkload || value !== original;
    return (
      <td
        data-aw-field={field}
        class={`${changed ? "is-unsaved-cell " : ""}${editing ? "is-editing-cell" : ""}`}
        onDblClick={(event) => {
          if (isInteractive(event.target)) return;
          event.stopPropagation();
          beginAwEdit(key, field, value);
        }}
      >
        <div class="accounts-workloads-cell-content">
        {editing ? (
          field === "lastUpdated" || field === "notes" ? (
            <textarea
              autoFocus
              class="accounts-workloads-edit-field"
              value={value}
              onInput={(event) =>
                updateAw(
                  account.id,
                  workload.id,
                  field,
                  event.currentTarget.value,
                )
              }
              onKeyDown={(event) =>
                awEditorKey(event, account.id, workload.id, field)
              }
              onBlur={() => setEditCell(null)}
            />
          ) : (
            <input
              autoFocus
              class="accounts-workloads-edit-field"
              aria-label={`${field === "account" ? "Account" : field === "workload" ? "Workload" : field === "salesRep" ? "Sales Rep" : field}${field === "account" || field === "workload" ? " (required)" : ""}`}
              aria-required={field === "account" || field === "workload" ? "true" : undefined}
              placeholder={field === "account" ? "Account *" : field === "workload" ? "Workload *" : undefined}
              maxLength={field === "salesRep" ? 200 : undefined}
              value={value}
              onInput={(event) =>
                updateAw(
                  account.id,
                  workload.id,
                  field,
                  event.currentTarget.value,
                )
              }
              onKeyDown={(event) =>
                awEditorKey(event, account.id, workload.id, field)
              }
              onBlur={() => setEditCell(null)}
            />
          )
        ) : field === "lastUpdated" || field === "notes" ? (
          tooltip(value)
        ) : field === "salesRep" && !value ? (
          "미지정"
        ) : field === "workload" || field === "salesRep" ? (
          truncatedWorkload(value)
        ) : (
          value || "—"
        )}
        </div>
      </td>
    );
  };

  const addAw = () => {
    if (dealSaveLock.isLocked()) return;
    const accountId = nextTempId.current--;
    const workloadId = nextTempId.current--;
    setHierarchy((current) => ({
      ...current,
      accounts: [
        {
          id: accountId,
          versionNo: 0,
          name: "",
          archived: false,
          workloads: [emptyWorkload(workloadId)],
        },
        ...current.accounts,
      ],
    }));
    setDirtyAccounts((current) => new Set(current).add(accountId));
    setDirtyWorkloads((current) => new Set(current).add(workloadId));
    setSelectedRows(new Set([rowKey(accountId, workloadId)]));
    setEditCell({ key: rowKey(accountId, workloadId), field: "account" });
  };
  const removeUnsavedSelected = (selected: ReadonlySet<string>) => {
    if (dealSaveLock.isLocked()) return;
    const removedWorkloadIds = new Set(
      allRows
        .filter((row) => selected.has(row.key) && row.workload.id < 0)
        .map((row) => row.workload.id),
    );
    if (!removedWorkloadIds.size) return;
    setHierarchy((current) => ({
      ...current,
      accounts: current.accounts
        .map((account) => ({
          ...account,
          workloads: account.workloads.filter(
            (workload) => !removedWorkloadIds.has(workload.id),
          ),
        }))
        .filter((account) => account.id > 0 || account.workloads.length > 0),
    }));
    setDirtyAccounts((current) => new Set([...current].filter((id) => id > 0)));
    setDirtyWorkloads(
      (current) =>
        new Set([...current].filter((id) => !removedWorkloadIds.has(id))),
    );
    setDealDrafts(
      (current) =>
        new Map(
          [...current].filter(
            ([, draft]) => !removedWorkloadIds.has(draft.workloadId),
          ),
        ),
    );
  };

  const confirmPermanentDelete = async () => {
    if (dealSaveLock.isLocked()) return;
    const permanentTargets = rows.filter((row) =>
      permanentDeleteTargets.includes(row.key),
    );
    permanentDeleteDialogRef.current?.close();
    setPermanentDeleteTargets([]);
    if (!permanentTargets.length) return;
    const deletedIds = new Set(permanentTargets.map((row) => row.workload.id));
    const request: AccountsWorkloadsHierarchySaveRequest = {
      accounts: [],
      deals: [],
      workloadPlans: [],
      workloads: permanentTargets.map((row) => ({
        id: row.workload.id,
        clientId: null,
        accountRef: String(row.account.id),
        versionNo: row.workload.versionNo,
        name: row.workload.name,
        salesRep: row.workload.salesRep,
        lastUpdated: row.workload.lastUpdated,
        notes: row.workload.notes,
        highlighted: row.workload.highlighted,
        action: "PERMANENT_DELETE",
      })),
    };
    setSaving(true);
    setError("");
    setSaveErrors([]);
    try {
      await saveAccountsWorkloadsHierarchy(request);
      setHierarchy((current) => ({
        ...current,
        accounts: current.accounts
          .map((account) => ({
            ...account,
            workloads: account.workloads.filter(
              (workload) => !deletedIds.has(workload.id),
            ),
          }))
          .filter((account) => account.workloads.length > 0),
      }));
      setBaseline((current) => ({
        ...current,
        accounts: current.accounts
          .map((account) => ({
            ...account,
            workloads: account.workloads.filter(
              (workload) => !deletedIds.has(workload.id),
            ),
          }))
          .filter((account) => account.workloads.length > 0),
      }));
      setDealDrafts(
        (current) =>
          new Map(
            [...current].filter(
              ([, draft]) => !deletedIds.has(draft.workloadId),
            ),
          ),
      );
      setPendingDeleteWorkloadIds(
        (current) =>
          new Set([...current].filter((id) => !deletedIds.has(id))),
      );
      setDirtyWorkloads(
        (current) =>
          new Set([...current].filter((id) => !deletedIds.has(id))),
      );
      setSelectedRows(new Set());
      setNotice(`${deletedIds.size} AW permanently deleted.`);
    } catch (requestError) {
      setError(friendlyError(requestError));
      setSaveErrors(
        requestError instanceof AccountsWorkloadsApiError
          ? requestError.errors
          : [],
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmDealDelete = async () => {
    if (dealSaveLock.isLocked()) return;
    const targets = dealDeleteTargets;
    dealDeleteDialogRef.current?.close();
    setDealDeleteTargets([]);
    if (!targets.length) return;
    setSaving(true);
    setError("");
    const pageScrollY = window.scrollY;
    const deletedDealIds = new Set(targets.map((deal) => deal.id));
    const knownServerIds = hierarchy.accounts.flatMap((account) =>
      account.workloads.flatMap((workload) => workload.deals.map((deal) => deal.id)),
    ).filter((id) => id > 0);
    const firstTarget = targets[0];
    const currentDeals = hierarchy.accounts
      .flatMap((account) => account.workloads)
      .find((workload) => workload.id === firstTarget.workloadId)?.deals ?? [];
    const targetIndex = currentDeals.findIndex((deal) => deal.id === firstTarget.id);
    const adjacentDeal =
      currentDeals
        .slice(Math.max(targetIndex, 0) + 1)
        .find((deal) => !deletedDealIds.has(deal.id)) ??
      [...currentDeals.slice(0, Math.max(targetIndex, 0))]
        .reverse()
        .find((deal) => !deletedDealIds.has(deal.id));
    const scrollPositions = new Map(
      [...new Set(targets.map((deal) => deal.workloadId))].map((workloadId) => [
        workloadId,
        document.querySelector<HTMLElement>(`[data-opportunity-scroll="${workloadId}"]`)?.scrollLeft ?? 0,
      ]),
    );
    const deleteWrites = targets.map((deal) =>
      dealWrite({ ...deal, deleted: true }, deal.workloadId, deal),
    );
    const submittedDeletes: SubmittedOpportunityWrite[] = targets.map((deal, index) => ({
      clientId: `deal:${deal.id}`,
      workloadId: deal.workloadId,
      originalId: deal.id,
      write: deleteWrites[index],
    }));
    const submittedDeleteDrafts = targets.flatMap((deal) => {
      const draft = dealDrafts.get(`deal:${deal.id}`);
      return draft ? [draft] : [];
    });
    if (!dealSaveLock.tryStart(submittedDeletes)) {
      setSaving(false);
      return;
    }
    let saveAccepted = false;
    let responseDealResults: ReadonlyArray<OpportunityDealResult> = [];
    try {
      const saved = await saveAccountsWorkloadsHierarchyWithResults({
        accounts: [],
        workloads: [],
        workloadPlans: [],
        deals: deleteWrites,
      });
      saveAccepted = true;
      responseDealResults = saved.dealResults;
      const confirmed = await fetchAccountsWorkloadsHierarchy({
        search: "",
        includeArchived: true,
        includeDeletedDeals: false,
      });
      const confirmedWorkloads = confirmed.accounts.flatMap((account) => account.workloads);
      validateConfirmedOpportunityWrites(
        submittedDeletes,
        confirmedWorkloads,
        saved.dealResults,
        new Set(knownServerIds),
      );
      applyConfirmedDeals(
        confirmedWorkloads,
        new Set(targets.map((deal) => deal.workloadId)),
      );
      const deletedDraftKeys = new Set(targets.map((deal) => `deal:${deal.id}`));
      setDealDrafts((current) => new Map(
        [...current].filter(([key]) => !deletedDraftKeys.has(key)),
      ));
      setSelectedDeals(new Map());
      requestAnimationFrame(() => {
        window.scrollTo({ top: pageScrollY });
        scrollPositions.forEach((left, workloadId) => {
          const scroller = document.querySelector<HTMLElement>(`[data-opportunity-scroll="${workloadId}"]`);
          if (scroller) scroller.scrollLeft = left;
        });
        const focusTarget = adjacentDeal
          ? document.querySelector<HTMLElement>(
              `[data-opportunity-deal-id="${adjacentDeal.id}"]`,
            )
          : document.querySelector<HTMLElement>(
              `[data-opportunity-scroll="${firstTarget.workloadId}"]`,
            );
        if (focusTarget) {
          if (!adjacentDeal) focusTarget.tabIndex = -1;
          focusTarget.focus({ preventScroll: true });
        }
      });
      setNotice(`${targets.length} opportunity deleted.`);
      dealSaveLock.confirmReconciled();
    } catch (requestError) {
      if (!saveAccepted && isDefiniteWriteRejection(requestError)) {
        setError(friendlyError(requestError));
        setSaveErrors(
          requestError instanceof AccountsWorkloadsApiError
            ? requestError.errors
            : [],
        );
      } else {
        dealSaveLock.markAwaitingConfirmation();
        setPendingDealConfirmation({
          drafts: Object.freeze([...submittedDeleteDrafts]),
          submittedWrites: Object.freeze([...submittedDeletes]),
          dealResults: Object.freeze([...responseDealResults]),
          knownServerIds: Object.freeze([...knownServerIds]),
        });
        setError(
          "저장 확인 대기: the Opportunity delete outcome could not be confirmed. Selection and submitted snapshot are preserved; delete and Save remain blocked until GET reconciliation succeeds.",
        );
        setSaveErrors([]);
      }
    } finally {
      dealSaveLock.release();
      setSaving(false);
    }
  };

  const requestDealDelete = () => {
    if (dealSaveLock.isLocked()) return;
    const targets = [...selectedDeals.values()].filter((deal) => deal.id > 0);
    if (!targets.length) return;
    setDealDeleteTargets(targets);
    dealDeleteDialogRef.current?.open();
  };

  const deleteSelected = async () => {
    if (dealSaveLock.isLocked()) return;
    const selected = new Set(selectedRows);
    const savedRows = rows.filter(
      (row) => selected.has(row.key) && row.workload.id > 0,
    );
    const permanentTargets = savedRows.filter(
      (row) => row.workload.archived,
    );
    const draftTargets = savedRows.filter((row) => !row.workload.archived);

    if (permanentTargets.length) {
      setPermanentDeleteTargets(permanentTargets.map((row) => row.key));
      permanentDeleteDialogRef.current?.open();
      return;
    }

    removeUnsavedSelected(selected);
    if (!draftTargets.length) {
      setSelectedRows(new Set());
      return;
    }

    const request: AccountsWorkloadsHierarchySaveRequest = {
      accounts: [],
      deals: [],
      workloadPlans: [],
      workloads: draftTargets.map((row) => ({
        id: row.workload.id,
        clientId: null,
        accountRef: String(row.account.id),
        versionNo: row.workload.versionNo,
        name: row.workload.name,
        salesRep: row.workload.salesRep,
        lastUpdated: row.workload.lastUpdated,
        notes: row.workload.notes,
        highlighted: row.workload.highlighted,
        action: "ARCHIVE",
      })),
    };
    setSaving(true);
    setError("");
    try {
      await saveAccountsWorkloadsHierarchy(request);
      setSelectedRows(new Set());
      await reload();
      setNotice(`${draftTargets.length} AW moved to Draft Delete.`);
    } catch (requestError) {
      setError(friendlyError(requestError));
      setSaveErrors(
        requestError instanceof AccountsWorkloadsApiError
          ? requestError.errors
          : [],
      );
    } finally {
      setSaving(false);
    }
  };

  const restoreSelected = async () => {
    if (dealSaveLock.isLocked()) return;
    const targets = rows.filter((row) => selectedRows.has(row.key) && row.workload.id > 0 && row.workload.archived);
    if (!targets.length) return;
    setSaving(true);
    setError("");
    try {
      await saveAccountsWorkloadsHierarchy({
        accounts: [], deals: [], workloadPlans: [],
        workloads: targets.map((row) => ({
          id: row.workload.id, clientId: null, accountRef: String(row.account.id),
          versionNo: row.workload.versionNo, name: row.workload.name, salesRep: row.workload.salesRep,
          lastUpdated: row.workload.lastUpdated, notes: row.workload.notes,
          highlighted: row.workload.highlighted, action: "RESTORE",
        })),
      });
      setSelectedRows(new Set());
      await reload();
      setNotice(`${targets.length} AW restored.`);
    } catch (requestError) {
      setError(friendlyError(requestError));
    } finally {
      setSaving(false);
    }
  };

  const cancelAllDrafts = () => {
    if (dealSaveLock.isLocked()) return;
    setHierarchy(baseline);
    setDirtyAccounts(new Set());
    setDirtyWorkloads(new Set());
    setPendingDeleteWorkloadIds(new Set());
    setDealDrafts(new Map());
    setSelectedRows(new Set());
    setSelectedDeals(new Map());
    setEditCell(null);
    setDealEditCell(null);
    setFxRateValue(savedFxRateValue);
    setFxDraft(String(savedFxRateValue || ""));
    setFxPopoverOpen(false);
    setError("");
    setSaveErrors([]);
    setNotice("All unsaved changes canceled.");
  };

  const planWriteFor = (
    workload: AccountWorkload,
    saved: AccountWorkload | undefined,
  ): WorkloadPlanWrite[] => {
    const current = workload.plans[0];
    const original = saved?.plans[0];
    const currentValue = current?.sourcePlanNumber?.trim() ?? "";
    const originalValue = original?.sourcePlanNumber?.trim() ?? "";
    if (currentValue === originalValue) return [];
    if (!original && currentValue)
      return [
        {
          id: null,
          workloadRef: refFor(workload.id, "workload"),
          versionNo: null,
          sourcePlanId: null,
          sourcePlanNumber: currentValue,
          action: "UPSERT",
        },
      ];
    if (original && !currentValue && original.sourcePlanId === null)
      return [
        {
          id: original.id,
          workloadRef: null,
          versionNo: original.versionNo,
          sourcePlanId: null,
          sourcePlanNumber: null,
          action: "DELETE",
        },
      ];
    return original
      ? [
          {
            id: original.id,
            workloadRef: null,
            versionNo: original.versionNo,
            sourcePlanId: original.sourcePlanId,
            sourcePlanNumber: currentValue || null,
            action: "UPSERT",
          },
        ]
      : [];
  };

  const saveAwDrafts = async (): Promise<boolean> => {
    if (dealSaveLock.isLocked()) return false;
    if (
      hierarchy.accounts.some(
        (account) =>
          (changedAccountIds.has(account.id) && !account.name.trim()) ||
          account.workloads.some(
            (workload) =>
              changedWorkloadIds.has(workload.id) &&
              (!account.name.trim() || !workload.name.trim()),
          ),
      )
    ) {
      setError("Account and Workload are required.");
      return false;
    }
    const archivedIds = new Set(pendingDeleteWorkloadIds);
    const request: AccountsWorkloadsHierarchySaveRequest = {
      accounts: [],
      workloads: [],
      deals: [],
      workloadPlans: [],
    };
    for (const account of hierarchy.accounts)
      for (const workload of account.workloads) {
        if (pendingDeleteWorkloadIds.has(workload.id)) {
          if (workload.id > 0)
            request.workloads.push({
              id: workload.id,
              clientId: null,
              accountRef: refFor(account.id, "account"),
              versionNo: workload.versionNo,
              name: workload.name,
              salesRep: workload.salesRep,
              lastUpdated: workload.lastUpdated,
              notes: workload.notes,
              highlighted: workload.highlighted,
              action: "ARCHIVE",
            });
          continue;
        }
        if (
          changedAccountIds.has(account.id) &&
          !request.accounts.some(
            (write) =>
              write.id === account.id ||
              write.clientId === refFor(account.id, "account"),
          )
        )
          request.accounts.push({
            id: account.id > 0 ? account.id : null,
            clientId: account.id > 0 ? null : refFor(account.id, "account"),
            versionNo: account.id > 0 ? account.versionNo : null,
            name: account.name,
            action: "UPSERT",
          });
        if (changedWorkloadIds.has(workload.id)) {
          request.workloads.push({
            id: workload.id > 0 ? workload.id : null,
            clientId: workload.id > 0 ? null : refFor(workload.id, "workload"),
            accountRef: refFor(account.id, "account"),
            versionNo: workload.id > 0 ? workload.versionNo : null,
            name: workload.name,
            salesRep: workload.salesRep,
            lastUpdated: workload.lastUpdated,
            notes: workload.notes,
            highlighted: workload.highlighted,
            action: "UPSERT",
          });
          request.workloadPlans.push(
            ...planWriteFor(
              workload,
              baseline.accounts
                .find((item) => item.id === account.id)
                ?.workloads.find((item) => item.id === workload.id),
            ),
          );
        }
      }
    const hasAwDrafts =
      request.accounts.length +
        request.workloads.length +
        request.workloadPlans.length >
      0;
    setSaving(true);
    setError("");
    setSaveErrors([]);
    try {
      if (hasAwDrafts) {
        const saved = await saveAccountsWorkloadsHierarchy(request);
        const withoutArchived = {
          ...saved,
          accounts: saved.accounts.map((account) => ({
            ...account,
            workloads: account.workloads.filter(
              (workload) => !archivedIds.has(workload.id),
            ),
          })),
        };
        setHierarchy(withoutArchived);
        setBaseline(withoutArchived);
        setDirtyAccounts(new Set());
        setDirtyWorkloads(new Set());
        setDealDrafts(
          (current) =>
            new Map(
              [...current].filter(
                ([, draft]) => !archivedIds.has(draft.workloadId),
              ),
            ),
        );
        setPendingDeleteWorkloadIds(new Set());
        setSelectedRows(new Set());
      }
      if (fxDirty) {
        setFxSaving(true);
        const savedRate = await onFxRateChange(fxRateValue);
        setSavedFxRateValue(savedRate.rateValue);
        setFxRateValue(savedRate.rateValue);
        setFxDraft(String(savedRate.rateValue));
      }
      setNotice(hasAwDrafts && fxDirty ? "AW and exchange rate changes saved." : fxDirty ? "Exchange rate saved." : "AW changes saved.");
      return true;
    } catch (saveError) {
      setError(friendlyError(saveError));
      setSaveErrors(
        saveError instanceof AccountsWorkloadsApiError ? saveError.errors : [],
      );
      return false;
    } finally {
      setFxSaving(false);
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!onNavigationGuardChange) return;
    if (!dirty) {
      onNavigationGuardChange(null, false);
      return;
    }
    const guard: NavigationGuard = (label, action) => {
      if (saving) return;
      setActionConfirmation(null);
      setPendingNavigation({ label, action });
    };
    onNavigationGuardChange(guard, true);
    return () => onNavigationGuardChange(null, false);
  }, [dirty, onNavigationGuardChange, saving]);

  const saveAllDrafts = async (): Promise<boolean> => {
    const awSaved = await saveAwDrafts();
    if (!awSaved) return false;
    return await saveDealDrafts();
  };

  const confirmPrimaryAction = async () => {
    if (actionConfirmation === "save") {
      setActionConfirmation(null);
      await saveAllDrafts();
      return;
    }
    if (actionConfirmation === "opportunity-save") {
      setActionConfirmation(null);
      await saveDealDrafts();
      return;
    }
    if (actionConfirmation === "cancel") {
      cancelAllDrafts();
      setActionConfirmation(null);
      setNotice("Changes discarded.");
    }
  };

  const saveAndContinue = async () => {
    const pending = pendingNavigation;
    if (!pending || saving) return;
    const saved = await saveAllDrafts();
    if (!saved) return;
    setPendingNavigation(null);
    pending.action();
  };

  const toggleHighlight = async (
    account: AccountHierarchyAccount,
    workload: AccountWorkload,
  ) => {
    if (workload.id < 0) {
      setHierarchy((current) => ({
        ...current,
        accounts: current.accounts.map((item) => ({
          ...item,
          workloads: item.workloads.map((entry) =>
            entry.id === workload.id
              ? { ...entry, highlighted: !entry.highlighted }
              : entry,
          ),
        })),
      }));
      setDirtyWorkloads((current) => new Set(current).add(workload.id));
      return;
    }
    const savedWorkload = baseline.accounts
      .find((item) => item.id === account.id)
      ?.workloads.find((item) => item.id === workload.id);
    if (!savedWorkload) {
      setError("Saved workload baseline is unavailable.");
      return;
    }
    if (highlightRequests.current.has(workload.id)) return;
    highlightRequests.current.add(workload.id);
    const request: AccountsWorkloadsHierarchySaveRequest = {
      accounts: [],
      deals: [],
      workloadPlans: [],
      workloads: [
        {
          id: workload.id,
          clientId: null,
          accountRef: String(account.id),
          versionNo: workload.versionNo,
          name: savedWorkload.name,
          salesRep: savedWorkload.salesRep,
          lastUpdated: savedWorkload.lastUpdated,
          notes: savedWorkload.notes,
          highlighted: !workload.highlighted,
          action: "UPSERT",
        },
      ],
    };
    try {
      const saved = await saveAccountsWorkloadsHierarchy(request);
      const confirmedWorkload = saved.accounts
        .flatMap((item) => item.workloads)
        .find((item) => item.id === workload.id);
      if (!confirmedWorkload)
        throw new Error("Saved workload was not returned.");
      const mergeHighlight = (
        current: AccountsWorkloadsHierarchy,
      ): AccountsWorkloadsHierarchy => ({
        ...current,
        accounts: current.accounts.map((item) => ({
          ...item,
          workloads: item.workloads.map((entry) =>
            entry.id === workload.id
              ? {
                  ...entry,
                  versionNo: confirmedWorkload.versionNo,
                  highlighted: confirmedWorkload.highlighted,
                }
              : entry,
          ),
        })),
      });
      setHierarchy((current) => mergeHighlight(current));
      setBaseline((current) => mergeHighlight(current));
    } catch (requestError) {
      setError(friendlyError(requestError));
    } finally {
      highlightRequests.current.delete(workload.id);
    }
  };

  const beginDealEdit = (
    workloadId: number,
    deal: AccountWorkloadDeal,
    field: DealField,
  ) => {
    if (isDraftDeletedWorkload(workloadId)) {
      setError("Draft Deleted AW의 Opportunity는 수정할 수 없습니다. 삭제만 가능합니다.");
      return;
    }
    if (!canWrite || dealSaveLock.isLocked()) return;
    const key = deal.id > 0 ? `deal:${deal.id}` : `draft:${deal.id}`;
    setDealDrafts((current) => {
      if (current.has(key)) return current;
      const next = new Map(current);
      next.set(key, {
        key,
        workloadId,
        original: deal.id > 0 ? deal : null,
        deal: { ...deal },
      });
      return next;
    });
    setDealEditCell({ key, field });
  };
  const updateDealDraft = (key: string, field: DealField, value: string) => {
    if (dealSaveLock.isLocked()) return;
    const existing = dealDrafts.get(key);
    if (existing && isDraftDeletedWorkload(existing.workloadId)) {
      setError("Draft Deleted AW의 Opportunity는 수정할 수 없습니다. 삭제만 가능합니다.");
      return;
    }
    setDealDrafts((current) => {
      const draft = current.get(key);
      if (!draft) return current;
      let deal = { ...draft.deal };
      if (field === "target") {
        const match = /^(FY\d{2}) Q([1-4])$/.exec(value);
        deal.targetFiscalYear = match?.[1] ?? null;
        deal.targetQuarter = match ? Number(match[2]) : null;
      } else if (["arrUsd", "arrKrw", "acrUsd", "acrKrw"].includes(field)) {
        Object.assign(
          deal,
          updateOpportunityCurrencyPair(
            deal,
            field as OpportunityCurrencyField,
            value,
            fxRateValue,
          ),
        );
      } else if (field === "winProbability")
        (deal as any)[field] = numberValue(value);
      else if (
        [
          "opportunityNo",
          "actualCloseDate",
          "contractStartDate",
          "contractEndDate",
          "latestUpdate",
        ].includes(field)
      )
        (deal as any)[field] = nullable(value);
      else if (field === "revenueType") {
        deal.revenueType = canonicalizeOpportunityRevenueType(value);
      } else (deal as any)[field] = value;
      const next = new Map(current);
      next.set(key, { ...draft, deal });
      return next;
    });
  };
  const applyFxRate = () => {
    const rateValue = Number(fxDraft);
    if (!Number.isFinite(rateValue) || rateValue <= 0) {
      setError("Exchange rate must be a positive number.");
      return;
    }
    setError("");
    setFxRateValue(rateValue);
    setFxDraft(String(rateValue));
    setFxPopoverOpen(false);
  };
  const addDeal = (workloadId: number) => {
    if (dealSaveLock.isLocked() || workloadId < 0 || isDraftDeletedWorkload(workloadId)) {
      if (isDraftDeletedWorkload(workloadId)) {
        setError("Draft Deleted AW에서는 Opportunity를 추가할 수 없습니다. 삭제만 가능합니다.");
      }
      return;
    }
    const id = nextTempId.current--;
    const deal = emptyDeal(id, workloadId);
    const key = `draft:${id}`;
    setDealDrafts((current) =>
      new Map(current).set(key, { key, workloadId, original: null, deal }),
    );
    setDealEditCell({ key, field: "name" });
  };
  const cancelDeal = (key: string) => {
    if (dealSaveLock.isLocked()) return;
    setDealDrafts((current) => {
      const next = new Map(current);
      next.delete(key);
      return next;
    });
    if (dealEditCell?.key === key) setDealEditCell(null);
    setError("");
    setSaveErrors([]);
  };
  const sameDraftRevision = (submitted: DealDraft, current: DealDraft) =>
    submitted.workloadId === current.workloadId &&
    (submitted.original?.id ?? null) === (current.original?.id ?? null) &&
    submitted.deal.deleted === current.deal.deleted &&
    DEAL_DRAFT_FIELDS.every(
      (field) => String(submitted.deal[field] ?? "") === String(current.deal[field] ?? ""),
    );
  const clearSubmittedDealDrafts = (drafts: ReadonlyArray<DealDraft>) =>
    setDealDrafts((current) => {
      const next = new Map(current);
      for (const submitted of drafts) {
        const latest = next.get(submitted.key);
        if (latest && sameDraftRevision(submitted, latest)) next.delete(submitted.key);
      }
      return next;
    });
  const applyConfirmedDeals = (
    confirmedWorkloads: ReadonlyArray<AccountWorkload>,
    touchedWorkloadIds: ReadonlySet<number>,
  ) => {
    const confirmedDealsByWorkload = new Map(
      confirmedWorkloads.map((workload) => [workload.id, workload.deals] as const),
    );
    const merge = (current: AccountsWorkloadsHierarchy): AccountsWorkloadsHierarchy => ({
      ...current,
      accounts: current.accounts.map((account) => ({
        ...account,
        workloads: account.workloads.map((workload) =>
          touchedWorkloadIds.has(workload.id) && confirmedDealsByWorkload.has(workload.id)
            ? { ...workload, deals: confirmedDealsByWorkload.get(workload.id)! }
            : workload,
        ),
      })),
    });
    setHierarchy((current) => merge(current));
    setBaseline((current) => merge(current));
  };
  const reconcilePendingDealSave = async () => {
    const pending = pendingDealConfirmation;
    if (!pending || !dealSaveLock.isAwaitingConfirmation() || saving) return;
    setSaving(true);
    setError("");
    try {
      const confirmed = await fetchAccountsWorkloadsHierarchy({
        search: "",
        includeArchived: true,
        includeDeletedDeals: false,
      });
      const confirmedWorkloads = confirmed.accounts.flatMap((account) => account.workloads);
      validateConfirmedOpportunityWrites(
        pending.submittedWrites,
        confirmedWorkloads,
        pending.dealResults,
        new Set(pending.knownServerIds),
      );
      applyConfirmedDeals(
        confirmedWorkloads,
        new Set(pending.submittedWrites.map((submission) => submission.workloadId)),
      );
      clearSubmittedDealDrafts(pending.drafts);
      const confirmedDeleteKeys = new Set(
        pending.submittedWrites
          .filter((submission) => submission.write.action === "DELETE")
          .map((submission) => submission.clientId),
      );
      if (confirmedDeleteKeys.size) {
        setDealDrafts((current) => new Map(
          [...current].filter(([key]) => !confirmedDeleteKeys.has(key)),
        ));
      }
      setPendingDealConfirmation(null);
      dealSaveLock.confirmReconciled();
      setSelectedDeals(new Map());
      setDealEditCell(null);
      setNotice(`${pending.submittedWrites.length} Opportunities confirmed.`);
    } catch (requestError) {
      setError(
        `저장 확인 대기: ${friendlyError(requestError)} Drafts are preserved and Save remains blocked.`,
      );
    } finally {
      setSaving(false);
    }
  };
  const saveDealDrafts = async () => {
    if (dealSaveLock.isLocked()) return false;
    const changedDrafts = [...dealDrafts.values()].filter(isDealDraftChanged);
    if (!changedDrafts.length) return true;
    if (changedDrafts.some((draft) => !draft.deal.deleted && isDraftDeletedWorkload(draft.workloadId))) {
      setError("Draft Deleted AW 아래 Opportunity 변경은 저장할 수 없습니다. 삭제만 가능합니다.");
      return false;
    }
    if (
      changedDrafts.some(
        (draft) => !draft.deal.deleted && !draft.deal.name.trim(),
      )
    ) {
      setError("Oppty Name is required.");
      return false;
    }
    const drafts = dealSaveLock.tryStart(changedDrafts);
    if (!drafts) return false;
    setSaving(true);
    setError("");
    const pageScrollY = window.scrollY;
    const opportunityScrolls = new Map(
      Array.from(document.querySelectorAll<HTMLElement>("[data-opportunity-scroll]"))
        .map((element) => [element.dataset.opportunityScroll ?? "", element.scrollLeft] as const),
    );
    let saveAccepted = false;
    let responseDealResults: ReadonlyArray<OpportunityDealResult> = [];
    const dealWrites = drafts.map((draft) =>
      dealWrite(draft.deal, draft.workloadId, draft.original, draft.key),
    );
    const submittedWrites: SubmittedOpportunityWrite[] = drafts.map((draft, index) => ({
      clientId: draft.key,
      workloadId: draft.workloadId,
      originalId: draft.original?.id ?? null,
      write: dealWrites[index],
    }));
    const knownServerIds = hierarchy.accounts.flatMap((account) =>
      account.workloads.flatMap((workload) => workload.deals.map((deal) => deal.id)),
    ).filter((id) => id > 0);
    try {
      const saved = await saveAccountsWorkloadsHierarchyWithResults({
        accounts: [],
        workloads: [],
        workloadPlans: [],
        deals: dealWrites,
      });
      saveAccepted = true;
      const knownIds = new Set(knownServerIds);
      const postWorkloads = saved.hierarchy.accounts.flatMap((account) => account.workloads);
      responseDealResults = saved.dealResults.length
        ? saved.dealResults
        : correlateLegacyOpportunityResults(submittedWrites, postWorkloads, knownIds);
      validateConfirmedOpportunityWrites(
        submittedWrites,
        postWorkloads,
        responseDealResults,
        knownIds,
      );
      const confirmed = await fetchAccountsWorkloadsHierarchy({
        search: "",
        includeArchived: true,
        includeDeletedDeals: true,
      });
      const confirmedWorkloads = confirmed.accounts.flatMap((account) => account.workloads);
      validateConfirmedOpportunityWrites(
        submittedWrites,
        confirmedWorkloads,
        responseDealResults,
        knownIds,
      );
      applyConfirmedDeals(
        confirmedWorkloads,
        new Set(drafts.map((draft) => draft.workloadId)),
      );
      clearSubmittedDealDrafts(drafts);
      setSelectedDeals(new Map());
      setDealEditCell(null);
      setNotice(`${drafts.length} Opportunities saved.`);
      requestAnimationFrame(() => {
        window.scrollTo({ top: pageScrollY });
        document.querySelectorAll<HTMLElement>("[data-opportunity-scroll]").forEach((element) => {
          element.scrollLeft = opportunityScrolls.get(element.dataset.opportunityScroll ?? "") ?? 0;
        });
      });
      return true;
    } catch (requestError) {
      const confirmedRejection = !saveAccepted && isDefiniteWriteRejection(requestError);
      if (!confirmedRejection) {
        dealSaveLock.markAwaitingConfirmation();
        const pendingConfirmation: PendingDealConfirmation = {
          drafts: Object.freeze([...drafts]),
          submittedWrites: Object.freeze([...submittedWrites]),
          dealResults: Object.freeze([...responseDealResults]),
          knownServerIds: Object.freeze([...knownServerIds]),
        };
        setPendingDealConfirmation(pendingConfirmation);
        setError(
          hasUnrecoverableNewDealCorrelationLoss(pendingConfirmation)
            ? "저장 확인 대기: 신규 Opportunity correlation을 받지 못해 일반 재조회로 해당 행을 안전하게 연결할 수 없습니다. 입력은 보존되고 재전송은 차단됩니다. 관리자 확인이 필요합니다."
            : "저장 확인 대기: the POST outcome could not be confirmed. Drafts and the submitted snapshot are preserved; Save is blocked until GET reconciliation succeeds.",
        );
        setSaveErrors([]);
      } else {
        setError(friendlyError(requestError));
        setSaveErrors(
          requestError instanceof AccountsWorkloadsApiError ? requestError.errors : [],
        );
      }
      return false;
    } finally {
      dealSaveLock.release();
      setSaving(false);
    }
  };

  const dealDisplay = (deal: AccountWorkloadDeal, field: DealField) =>
    field === "target"
      ? targetPeriod(deal)
      : field === "revenueType"
        ? deal.revenueType
        : field === "status"
          ? deal.status
          : String((deal as any)[field] ?? "");

  const renderDealCell = (
    workloadId: number,
    deal: AccountWorkloadDeal,
    field: DealField,
  ) => {
    const key = deal.id > 0 ? `deal:${deal.id}` : `draft:${deal.id}`;
    const draft = dealDrafts.get(key);
    const effective = draft?.deal ?? deal;
    const value = dealDisplay(effective, field);
    const editing = dealEditCell?.key === key && dealEditCell.field === field;
    const changed = Boolean(
      draft &&
        dealDisplay(draft.original ?? emptyDeal(0, workloadId), field) !==
          value,
    );
    let editor: any = null;
    if (editing) {
      if (field === "revenueType")
        editor = (
          <select
            autoFocus
            value={value}
            onChange={(event) =>
              updateDealDraft(key, field, event.currentTarget.value)
            }
            onBlur={() => setDealEditCell(null)}
          >
            {opportunityRevenueTypeOptions(value).map((option) => (
              <option value={option.value}>{option.label}</option>
            ))}
          </select>
        );
      else if (field === "status")
        editor = (
          <select
            autoFocus
            value={value}
            onChange={(event) =>
              updateDealDraft(key, field, event.currentTarget.value)
            }
            onBlur={() => setDealEditCell(null)}
          >
            <option value="OPEN">Open</option>
            <option value="WON">Won</option>
            <option value="LOST">Lost</option>
          </select>
        );
      else if (field === "target")
        editor = (
          <select
            autoFocus
            value={value}
            onChange={(event) =>
              updateDealDraft(key, field, event.currentTarget.value)
            }
            onBlur={() => setDealEditCell(null)}
          >
            <option value="">—</option>
            {value && !targetOptions.includes(value) && (
              <option value={value}>{value}</option>
            )}
            {targetOptions.map((option) => (
              <option value={option}>{option}</option>
            ))}
          </select>
        );
      else if (
        ["actualCloseDate", "contractStartDate", "contractEndDate"].includes(
          field,
        )
      )
        editor = (
          <oj-input-date
            value={value}
            labelEdge="none"
            onvalueChanged={(event: CustomEvent) => {
              updateDealDraft(key, field, String(event.detail.value ?? ""));
              setDealEditCell(null);
            }}
          />
        );
      else if (
        ["arrUsd", "arrKrw", "acrUsd", "acrKrw", "winProbability"].includes(
          field,
        )
      )
        editor = (
          <input
            autoFocus
            type="number"
            value={value}
            onInput={(event) =>
              updateDealDraft(key, field, event.currentTarget.value)
            }
            onBlur={() => setDealEditCell(null)}
          />
        );
      else if (field === "latestUpdate")
        editor = (
          <textarea
            autoFocus
            value={value}
            onInput={(event) =>
              updateDealDraft(key, field, event.currentTarget.value)
            }
            onBlur={() => setDealEditCell(null)}
          />
        );
      else
        editor = (
          <input
            autoFocus
            aria-label={field === "name" ? "Oppty Name (required)" : undefined}
            placeholder={field === "name" ? "Oppty Name *" : undefined}
            value={value}
            onInput={(event) =>
              updateDealDraft(key, field, event.currentTarget.value)
            }
            onBlur={() => setDealEditCell(null)}
          />
        );
    }
    return (
      <td
        data-deal-field={field}
        class={`${field === "name" ? "is-oppty-sticky is-oppty-sticky-name " : field === "opportunityNo" ? "is-oppty-sticky is-oppty-sticky-id " : ""}${changed ? "is-unsaved-cell " : ""}${editing ? "is-editing-cell" : ""}`}
        onClick={(event) => {
          if (dealEditCell && (dealEditCell.key !== key || dealEditCell.field !== field) && !isInteractive(event.target)) {
            setDealEditCell(null);
          }
        }}
        onDblClick={(event) => {
          if (isDraftDeletedWorkload(workloadId) || isInteractive(event.target)) return;
          event.stopPropagation();
          beginDealEdit(workloadId, effective, field);
        }}
        onKeyDown={(event) => {
          if (editing && event.key === "Enter") {
            event.preventDefault();
            setDealEditCell(null);
          }
        }}
      >
        <div class="accounts-workloads-cell-content">
        {editing
          ? editor
          : field === "latestUpdate"
            ? <span
                class="accounts-workloads-ellipsis"
                tabIndex={value ? 0 : undefined}
                onMouseEnter={(event) => showImmediateTooltip(event.currentTarget, value, true)}
                onMouseLeave={() => setLatestUpdateTooltip(null)}
                onFocus={(event) => showImmediateTooltip(event.currentTarget, value, true)}
                onBlur={() => setLatestUpdateTooltip(null)}
              >
                {value || "—"}
              </span>
            : field === "winProbability" && value
              ? `${Number(value).toLocaleString("en-US")}%`
              : ["arrUsd", "arrKrw", "acrUsd", "acrKrw"].includes(field) && value
                ? Number(value).toLocaleString("en-US")
                : value || "—"}
        </div>
      </td>
    );
  };

  const openForecast = async () => {
    setForecastOpen(true);
    setForecastLoading(true);
    setSelectedCandidateKeys(new Set());
    try {
      setForecastCandidates(await fetchForecastCandidates());
    } catch (requestError) {
      setError(friendlyError(requestError));
    } finally {
      setForecastLoading(false);
    }
  };
  const addCandidates = () => {
    if (dealSaveLock.isLocked()) return;
    const selected = missingCandidates.filter((item) =>
      selectedCandidateKeys.has(forecastCandidateKey(item)),
    );
    const groups = new Map<
      string,
      {
        accountId: number;
        name: string;
        isNew: boolean;
        workloads: AccountWorkload[];
      }
    >();
    const workloadIds: number[] = [];
    selected.forEach((candidate) => {
      const identity = normalizedAccount(candidate.accountName);
      let group = groups.get(identity);
      if (!group) {
        const existing = hierarchy.accounts.find(
          (account) => normalizedAccount(account.name) === identity,
        );
        group = {
          accountId: existing?.id ?? nextTempId.current--,
          name: candidate.accountName.trim(),
          isNew: !existing,
          workloads: [],
        };
        groups.set(identity, group);
      }
      const workloadId = nextTempId.current--;
      const workload = emptyWorkload(workloadId, CANDIDATE_WORKLOAD_NAME, candidate.salesRep);
      if (candidate.planId !== null || candidate.planNumber !== null)
        Object.assign(workload, {
          plans: [
            {
              id: nextTempId.current--,
              workloadId,
              sourcePlanId: candidate.planId,
              sourcePlanNumber: candidate.planNumber,
              versionNo: 0,
            },
          ],
        });
      group.workloads.push(workload);
      workloadIds.push(workloadId);
    });
    setHierarchy((current) => {
      let accounts = [...current.accounts];
      groups.forEach((group) => {
        accounts = group.isNew
          ? [
              {
                id: group.accountId,
                versionNo: 0,
                name: group.name,
                archived: false,
                workloads: group.workloads,
              },
              ...accounts,
            ]
          : accounts.map((account) =>
              account.id === group.accountId
                ? {
                    ...account,
                    workloads: [...group.workloads, ...account.workloads],
                  }
                : account,
            );
      });
      return { ...current, accounts };
    });
    setDirtyAccounts((current) => {
      const next = new Set(current);
      groups.forEach((group) => {
        if (group.isNew) next.add(group.accountId);
      });
      return next;
    });
    setDirtyWorkloads((current) => new Set([...current, ...workloadIds]));
    setForecastOpen(false);
    setNotice(
      `Added ${selected.length} record candidate${selected.length === 1 ? "" : "s"} as AW drafts.`,
    );
  };

  const selectedCount = rows.filter((row) => selectedRows.has(row.key)).length;
  const selectedArchivedCount = rows.filter((row) => selectedRows.has(row.key) && row.workload.archived).length;
  const selectedDirtyCount = allRows.filter(
    (row) =>
      selectedRows.has(row.key) &&
      (row.workload.id < 0 ||
        pendingDeleteWorkloadIds.has(row.workload.id) ||
        dirtyAccounts.has(row.account.id) ||
        dirtyWorkloads.has(row.workload.id)),
  ).length;
  const savableAwDraftCount =
    dirtyAccounts.size + dirtyWorkloads.size + pendingDeleteWorkloadIds.size + (fxDirty ? 1 : 0);

  return (
    <section
      class="accounts-workloads-page accounts-hierarchy-page"
      aria-labelledby="accountsWorkloadsTitle"
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button,input,textarea,select,oj-button,.accounts-workloads-parent-row")) return;
        setSelectedRows(new Set());
        setSelectedDeals(new Map());
      }}
    >
      <header class="accounts-workloads-header consumption-page__header">
        <div class="accounts-workloads-header-topline">
          <div class="accounts-workloads-header-navigation">
            {breadcrumb}
            <span class="kpi-eyebrow">My Customers 360</span>
          </div>
          <div class="consumption-import-actions accounts-workloads-header-actions">
            <oj-button
              chroming="outlined"
              aria-label="Account Recommendations"
              disabled={!canWrite || saving}
              onojAction={() => void openForecast()}
            >
              <span slot="startIcon" class="oj-ux-ico-plus" />
              <span class="accounts-workloads-recommendations-label--desktop">Account Recommendations</span>
              <span class="accounts-workloads-recommendations-label--mobile">Account Recomm.</span>
            </oj-button>
          </div>
        </div>
        <h1 id="accountsWorkloadsTitle">Accounts &amp; Workloads</h1>
      </header>
      <form
        class="accounts-workloads-toolbar accounts-workloads-toolbar--compact"
        onSubmit={(event) => {
          event.preventDefault();
          if (searchComposingRef.current) return;
          if (dirty) {
            setError("Save or cancel drafts before searching.");
            return;
          }
          applySearch(searchInput);
        }}
      >
        <label
          class="consumption-record-search accounts-workloads-search"
          for="accountsWorkloadsSearch"
        >
          <span class="oj-helper-hidden-accessible">Search</span>
          <input
            id="accountsWorkloadsSearch"
            type="search"
            value={searchInput}
            placeholder="Account, workload, opportunity, or Plan"
            onCompositionStart={() => { searchComposingRef.current = true; }}
            onCompositionEnd={(event) => {
              searchComposingRef.current = false;
              setSearchInput(event.currentTarget.value);
            }}
            onInput={(event) => {
              const value = event.currentTarget.value;
              setSearchInput(value);
              if (!value && appliedSearchRef.current) applySearch("");
            }}
          />
          <button
            type="submit"
            class="consumption-record-search__submit"
            disabled={loading || saving}
          >
            <span class="oj-ux-ico-search" aria-hidden="true" />
            <span class="oj-helper-hidden-accessible">Search</span>
          </button>
        </label>
        <label class="accounts-workloads-include-deleted">
          <input
            type="checkbox"
            checked={includeDeleted}
            disabled={dirty || loading || saving}
            onChange={(event) => setIncludeDeleted(event.currentTarget.checked)}
          />
          <span>Include Deleted</span>
        </label>
        <span class="accounts-workloads-toolbar-spacer" />
        {savableAwDraftCount > 0 && (
          <button
            type="button"
            class="accounts-workloads-button accounts-workloads-button--primary"
            disabled={!canWrite || saving}
            onClick={() => setActionConfirmation("save")}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        )}
        {dirty && (
          <button
            type="button"
            class="accounts-workloads-button"
            disabled={saving}
            onClick={() => setActionConfirmation("cancel")}
          >
            Cancel
          </button>
        )}
        {selectedCount > 0 && !editCell && !dirty && selectedArchivedCount > 0 && (
          <button type="button" class="accounts-workloads-button" disabled={!canWrite || saving} onClick={() => void restoreSelected()}>
            Restore
          </button>
        )}
        {selectedCount > 0 && !editCell && !dirty && (
          <button type="button" class="accounts-workloads-button" disabled={!canWrite || saving} onClick={deleteSelected}>
            {selectedArchivedCount > 0 ? "Delete" : "Draft Delete"}
          </button>
        )}
        <button
          type="button"
          class="accounts-workloads-add-aw"
          disabled={!canWrite || saving}
          onClick={addAw}
        >
          Add Account & Workload
        </button>
      </form>
      <div class="accounts-workloads-table-summary">
        <strong class="consumption-table-title">
          Account / Workload / Opportunity
          <small class="consumption-table-plan-count">{hierarchy.accounts.length} accounts</small>
        </strong>
        <div class="accounts-workloads-table-summary__meta">
          <div class="accounts-workloads-fx">
          <button
            type="button"
            class="accounts-workloads-fx__button"
            disabled={!canWrite || fxLoading || fxSaving || saving}
            aria-expanded={fxPopoverOpen ? "true" : "false"}
            onClick={() => {
              setFxDraft(String(fxRateValue || ""));
              setFxPopoverOpen((value) => !value);
            }}
          >
            <span>Exchange Rate (USD to KRW)</span>
            <strong>1 USD = KRW {fmtUsd.format(fxRateValue)}</strong>
          </button>
          {fxPopoverOpen && (
            <div class="accounts-workloads-fx-popover" role="dialog" aria-label="Edit exchange rate">
              <label>
                <span>Exchange Rate (USD to KRW)</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={fxDraft}
                  disabled={!canWrite || fxLoading || fxSaving || saving}
                  onInput={(event) => setFxDraft(event.currentTarget.value)}
                />
              </label>
              <p>ARR/ACR USD and KRW pairs recalculate automatically after Apply.</p>
              {fxLoading && <p id="accountsWorkloadsFxLoading" role="status">Loading saved exchange rate…</p>}
              {fxError && <p id="accountsWorkloadsFxError" role="alert">{fxError}</p>}
              <div class="accounts-workloads-popover-actions">
                <button
                  type="button"
                  class="accounts-workloads-button accounts-workloads-button--primary"
                  disabled={!canWrite || fxLoading || fxSaving || saving}
                  onClick={applyFxRate}
                >
                  Apply
                </button>
                <button
                  type="button"
                  class="accounts-workloads-button"
                  disabled={fxSaving || saving}
                  onClick={() => {
                    setFxDraft(String(fxRateValue || ""));
                    setFxPopoverOpen(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
      {!canWrite && <div class="accounts-workloads-read-only">Read-only access. Write permission is required.</div>}
      <AppMessageBanner
        messages={[
          ...(error ? [{ id: "accounts-workloads-error", severity: "error" as const, summary: error, persistence: "sticky" as const }] : []),
          ...(notice ? [{ id: "accounts-workloads-notice", severity: "confirmation" as const, summary: notice, persistence: "auto" as const }] : []),
        ]}
        onClose={(id) => {
          if (id === "accounts-workloads-error") {
            setError("");
            setSaveErrors([]);
          } else {
            setNotice("");
          }
        }}
      />
      {saveErrors.length > 0 && (
        <div class="accounts-workloads-inline-validation" role="status">
          <ul>
            {saveErrors.map((item) => (
              <li>{item.entity} · {item.field}: {item.message}</li>
            ))}
          </ul>
        </div>
      )}
      {loading ? (
        <div class="accounts-workloads-loading">
          <oj-progress-circle value={-1} size="md" /> Loading hierarchy…
        </div>
      ) : (
        <div class="accounts-workloads-grid-wrap accounts-workloads-grid-wrap--compact">
          <table class="accounts-workloads-grid accounts-workloads-aw-grid">
            <thead>
              <tr>
                <th class="accounts-workloads-expand-col">
                  <button
                    type="button"
                    class="accounts-workloads-expand-all"
                    aria-label={allExpanded ? "Collapse all" : "Expand all"}
                    title={allExpanded ? "Collapse all" : "Expand all"}
                    onClick={() => setExpandedRows(allExpanded ? new Set() : new Set(rows.map((row) => row.key)))}
                  >
                    <span class={allExpanded ? "oj-ux-ico-collapse" : "oj-ux-ico-expand"} />
                  </button>
                </th>
                <th class="accounts-workloads-highlight-col">★</th>
                {(
                  [
                    ["account", "Account"],
                    ["workload", "Workload"],
                    ["salesRep", "Sales Rep"],
                    ["plan", "Plan Number"],
                    ["arrUsd", "ARR($)"],
                    ["acrUsd", "ACR($)"],
                    ["opptyCount", "Oppty Count"],
                    ["lastUpdated", "Latest Update"],
                    ["notes", "Notes"],
                  ] as [SortField, string][]
                ).map(([field, label]) => (
                  <th class={`is-${field}`}>
                    <button type="button" onClick={() => toggleSort(field)}>
                      {label}{(field === "account" || field === "workload") && (
                        <> <span class="accounts-workloads-required-marker" aria-label="required">*</span></>
                      )} {sortLabel(field)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ account, workload, key }) => {
                const expanded = expandedRows.has(key);
                const pendingDelete =
                  workload.archived || pendingDeleteWorkloadIds.has(workload.id);
                const deals = workload.deals.filter((deal) => !deal.deleted);
                const arr = deals.reduce(
                  (sum, deal) => sum + (deal.arrUsd ?? 0),
                  0,
                );
                const acr = deals.reduce(
                  (sum, deal) => sum + (deal.acrUsd ?? 0),
                  0,
                );
                const childDrafts = [...dealDrafts.values()].filter(
                  (draft) => draft.workloadId === workload.id,
                );
                const changedChildDrafts = childDrafts.filter(isDealDraftChanged);
                const activeDraft =
                  changedChildDrafts.find((draft) => draft.key === dealEditCell?.key) ??
                  changedChildDrafts[0];
                const shownDeals = deals.map(
                  (deal) =>
                    childDrafts.find((draft) => draft.deal.id === deal.id)
                      ?.deal ?? deal,
                );
                childDrafts
                  .filter((draft) => draft.original === null)
                  .forEach((draft) => shownDeals.unshift(draft.deal));
                return (
                  <Fragment key={key}>
                    <tr
                      data-aw-row-key={key}
                      class={`accounts-workloads-parent-row${workload.highlighted ? " is-highlighted" : ""}${selectedRows.has(key) ? " is-selected" : ""}${pendingDelete ? " is-pending-delete" : ""}`}
                      onClick={(event) => {
                        if (isInteractive(event.target)) return;
                        if (!event.ctrlKey && !event.metaKey) {
                          setSelectedRows((current) =>
                            current.size === 1 && current.has(key)
                              ? new Set()
                              : new Set([key]),
                          );
                          return;
                        }
                        setSelectedRows((current) => {
                          const next = new Set(current);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        });
                      }}
                    >
                      <td>
                        <button
                          type="button"
                          class="accounts-workloads-expander"
                          onClick={() =>
                            setExpandedRows((current) => {
                              const next = new Set(current);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            })
                          }
                        >
                          {expanded ? "▾" : "▸"}
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          class="accounts-workloads-highlight"
                          aria-pressed={workload.highlighted}
                          onClick={() =>
                            void toggleHighlight(account, workload)
                          }
                        >
                          {workload.highlighted ? "★" : "☆"}
                        </button>
                      </td>
                      {renderAwCell(account, workload, "account")}
                      {renderAwCell(account, workload, "workload")}
                      {renderAwCell(account, workload, "salesRep")}
                      {renderAwCell(account, workload, "plan")}
                      <td class="accounts-workloads-number-cell">
                        {fmtMoney(arr)}
                      </td>
                      <td class="accounts-workloads-number-cell">
                        {fmtMoney(acr)}
                      </td>
                      <td class="accounts-workloads-number-cell">
                        {deals.length}
                      </td>
                      {renderAwCell(account, workload, "lastUpdated")}
                      {renderAwCell(account, workload, "notes")}
                    </tr>
                    {expanded && (
                      <tr class="accounts-workloads-child-row">
                        <td colSpan={11}>
                          <section
                            class="accounts-workloads-opportunities"
                            aria-label={`${account.name} ${workload.name} opportunities`}
                          >
                            <header class="accounts-workloads-opportunities__heading">
                              <div>
                                <strong>Opportunities</strong>
                                <span>{deals.length} saved</span>
                              </div>
                              <div class="accounts-workloads-opportunity-heading-actions">
                                <button
                                  type="button"
                                  aria-label="Scroll opportunities left"
                                  onClick={(event) =>
                                    event.currentTarget
                                      .closest(".accounts-workloads-opportunities")
                                      ?.querySelector<HTMLElement>(
                                        ".accounts-workloads-oppty-scroll",
                                      )
                                      ?.scrollBy({ left: -480, behavior: "smooth" })
                                  }
                                >
                                  ‹
                                </button>
                                <button
                                  type="button"
                                  aria-label="Scroll opportunities right"
                                  onClick={(event) =>
                                    event.currentTarget
                                      .closest(".accounts-workloads-opportunities")
                                      ?.querySelector<HTMLElement>(
                                        ".accounts-workloads-oppty-scroll",
                                      )
                                      ?.scrollBy({ left: 480, behavior: "smooth" })
                                  }
                                >
                                  ›
                                </button>
                                {!workload.archived && <button
                                  type="button"
                                  disabled={
                                    !canWrite ||
                                    saving ||
                                    Boolean(pendingDealConfirmation) ||
                                    workload.id < 0
                                  }
                                  onClick={() => addDeal(workload.id)}
                                >
                                  Add Opportunity
                                </button>}
                                {selectedDeals.size > 0 && !dealEditCell && (
                                  <button
                                    type="button"
                                    disabled={!canWrite || saving || Boolean(pendingDealConfirmation)}
                                    onClick={requestDealDelete}
                                  >
                                    Delete selected
                                  </button>
                                )}
                                {pendingDealConfirmation && (
                                  <button
                                    type="button"
                                    disabled={
                                      saving ||
                                      hasUnrecoverableNewDealCorrelationLoss(pendingDealConfirmation)
                                    }
                                    onClick={() => void reconcilePendingDealSave()}
                                  >
                                    {hasUnrecoverableNewDealCorrelationLoss(pendingDealConfirmation)
                                      ? "저장 결과 확인 불가 — 관리자 확인 필요"
                                      : "저장 확인 대기 — GET 확인"}
                                  </button>
                                )}
                                {activeDraft && !workload.archived && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={saving || Boolean(pendingDealConfirmation)}
                                      onClick={() => setActionConfirmation("opportunity-save")}
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      disabled={saving || Boolean(pendingDealConfirmation)}
                                      onClick={() => cancelDeal(activeDraft.key)}
                                    >
                                      Undo
                                    </button>
                                  </>
                                )}
                              </div>
                            </header>
                            {workload.id < 0 ? (
                              <p class="accounts-workloads-child-guidance">
                                Save the parent AW before adding opportunities.
                              </p>
                            ) : (
                              <div
                                class="accounts-workloads-oppty-scroll"
                                data-opportunity-scroll={workload.id}
                              >
                                <table class="accounts-workloads-oppty-grid">
                                  <colgroup class="accounts-workloads-oppty-columns">
                                    <col class="accounts-workloads-oppty-column--name" />
                                    <col class="accounts-workloads-oppty-column--id" />
                                    <col class="accounts-workloads-oppty-column--revenue" />
                                    <col class="accounts-workloads-oppty-column--probability" />
                                    <col class="accounts-workloads-oppty-column--target" />
                                    <col class="accounts-workloads-oppty-column--arr-usd" />
                                    <col class="accounts-workloads-oppty-column--arr-krw" />
                                    <col class="accounts-workloads-oppty-column--acr-usd" />
                                    <col class="accounts-workloads-oppty-column--acr-krw" />
                                    <col class="accounts-workloads-oppty-column--status" />
                                    <col class="accounts-workloads-oppty-column--date" />
                                    <col class="accounts-workloads-oppty-column--date" />
                                    <col class="accounts-workloads-oppty-column--date" />
                                    <col class="accounts-workloads-oppty-column--update" />
                                  </colgroup>
                                  <thead>
                                    <tr>
                                      {[
                                        "Oppty Name",
                                        "Oppty ID",
                                        "Revenue Type",
                                        "WIN PROB.",
                                        "Target Quarter",
                                        "ARR ($)",
                                        "ARR (₩)",
                                        "ACR ($)",
                                        "ACR (₩)",
                                        "Status",
                                        "Close Date",
                                        "Start Date",
                                        "End Date",
                                        "Latest Update",
                                      ].map((label) => (
                                        <th>
                                          {label}{label === "Oppty Name" && (
                                            <> <span class="accounts-workloads-required-marker" aria-label="required">*</span></>
                                          )}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {shownDeals.map((deal) => {
                                      const draftKey =
                                        deal.id > 0
                                          ? `deal:${deal.id}`
                                          : `draft:${deal.id}`;
                                      const draft = dealDrafts.get(draftKey);
                                      return (
                                        <tr
                                          key={draftKey}
                                          data-deal-draft-key={draftKey}
                                          data-opportunity-deal-id={deal.id}
                                          tabIndex={0}
                                          class={`${draft && isDealDraftChanged(draft) ? "is-draft" : ""}${draft?.deal.deleted || deal.deleted ? " is-draft-delete" : ""}${selectedDeals.has(deal.id) ? " is-selected" : ""}`}
                                          onClick={(event) => {
                                            if (isInteractive(event.target)) return;
                                            event.stopPropagation();
                                            if (deal.id <= 0) return;
                                            setSelectedDeals((current) => {
                                              const next = new Map(current);
                                              if (!event.ctrlKey && !event.metaKey) {
                                                if (next.size === 1 && next.has(deal.id)) return new Map();
                                                return new Map([[deal.id, deal]]);
                                              }
                                              if (next.has(deal.id)) next.delete(deal.id);
                                              else next.set(deal.id, deal);
                                              return next;
                                            });
                                          }}
                                        >
                                          {renderDealCell(
                                            workload.id,
                                            deal,
                                            "name",
                                          )}
                                          {renderDealCell(
                                            workload.id,
                                            deal,
                                            "opportunityNo",
                                          )}
                                          {renderDealCell(
                                            workload.id,
                                            deal,
                                            "revenueType",
                                          )}
                                          {renderDealCell(
                                            workload.id,
                                            deal,
                                            "winProbability",
                                          )}
                                          {renderDealCell(
                                            workload.id,
                                            deal,
                                            "target",
                                          )}
                                          {renderDealCell(
                                            workload.id,
                                            deal,
                                            "arrUsd",
                                          )}
                                          {renderDealCell(
                                            workload.id,
                                            deal,
                                            "arrKrw",
                                          )}
                                          {renderDealCell(
                                            workload.id,
                                            deal,
                                            "acrUsd",
                                          )}
                                          {renderDealCell(
                                            workload.id,
                                            deal,
                                            "acrKrw",
                                          )}
                                          {renderDealCell(
                                            workload.id,
                                            deal,
                                            "status",
                                          )}
                                          {renderDealCell(
                                            workload.id,
                                            deal,
                                            "actualCloseDate",
                                          )}
                                          {renderDealCell(
                                            workload.id,
                                            deal,
                                            "contractStartDate",
                                          )}
                                          {renderDealCell(
                                            workload.id,
                                            deal,
                                            "contractEndDate",
                                          )}
                                          {renderDealCell(
                                            workload.id,
                                            deal,
                                            "latestUpdate",
                                          )}

                                        </tr>
                                      );
                                    })}
                                    {shownDeals.length === 0 && (
                                      <tr>
                                        <td
                                          colSpan={14}
                                          class="accounts-workloads-empty"
                                        >
                                          No opportunities.
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </section>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} class="accounts-workloads-empty">
                    No accounts or workloads found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <oj-dialog
        ref={permanentDeleteDialogRef}
        dialogTitle="Permanently delete Draft Delete rows?"
        cancelBehavior={saving ? "none" : "icon"}
        onojClose={() => {
          if (!saving) setPermanentDeleteTargets([]);
        }}
      >
        <div slot="body" class="accounts-workloads-permanent-delete-dialog">
          <p>
            The selected Account &amp; Workload rows and their dependent
            Opportunity history will be permanently deleted. This cannot be
            undone.
          </p>
          <ul>
            {rows
              .filter((row) => permanentDeleteTargets.includes(row.key))
              .map((row) => (
                <li key={row.key}>
                  {row.account.name} / {row.workload.name} · {row.workload.deals.length}
                  {" "}opportunities
                </li>
              ))}
          </ul>
        </div>
        <div slot="footer">
          <oj-button
            disabled={saving}
            onojAction={() => permanentDeleteDialogRef.current?.close()}
          >
            Cancel
          </oj-button>
          <oj-button
            chroming="danger"
            disabled={saving || !permanentDeleteTargets.length}
            onojAction={() => void confirmPermanentDelete()}
          >
            {saving ? "Deleting…" : "Permanently delete"}
          </oj-button>
        </div>
      </oj-dialog>
      <oj-dialog
        ref={dealDeleteDialogRef}
        dialogTitle="Delete selected opportunities?"
        cancelBehavior={saving ? "none" : "icon"}
        onojClose={() => {
          if (!saving) setDealDeleteTargets([]);
        }}
      >
        <div slot="body" class="accounts-workloads-permanent-delete-dialog">
          <p>
            {dealDeleteTargets.length} selected {dealDeleteTargets.length === 1 ? "opportunity" : "opportunities"} will be permanently deleted immediately. This cannot be undone.
          </p>
        </div>
        <div slot="footer">
          <oj-button
            disabled={saving}
            onojAction={() => dealDeleteDialogRef.current?.close()}
          >
            Cancel
          </oj-button>
          <oj-button
            chroming="danger"
            disabled={saving || !dealDeleteTargets.length}
            onojAction={() => void confirmDealDelete()}
          >
            {saving ? "Deleting…" : "Delete"}
          </oj-button>
        </div>
      </oj-dialog>
      {forecastOpen && (
        <div class="accounts-workloads-dialog-backdrop">
          <section
            class="accounts-workloads-dialog accounts-forecast-dialog"
            role="dialog"
            aria-modal="true"
          >
            <header>
              <div>
                <h2>Account Recommendations</h2>
                <p>
                  Select one or more recommendations, then confirm to add them as
                  unsaved Account &amp; Workload drafts. Plan ID is matched first;
                  normalized Account exact match is used only when Plan ID is
                  unavailable. They will be added as unsaved AW drafts.
                </p>
              </div>
              <button type="button" onClick={() => setForecastOpen(false)}>
                ×
              </button>
            </header>
            {forecastLoading ? (
              <p>Loading…</p>
            ) : (
              <table class="accounts-forecast-candidates-table">
                <thead>
                  <tr>
                    <th />
                    <th>Account</th>
                    <th>Sales Rep</th>
                    <th>Plan ID(Number)</th>
                  </tr>
                </thead>
                <tbody>
                  {missingCandidates.map((candidate) => {
                    const key = forecastCandidateKey(candidate);
                    return (
                      <tr key={key}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedCandidateKeys.has(key)}
                            onChange={() =>
                              setSelectedCandidateKeys((current) => {
                                const next = new Set(current);
                                if (next.has(key)) next.delete(key);
                                else next.add(key);
                                return next;
                              })
                            }
                          />
                        </td>
                        <td>{candidate.accountName}</td>
                        <td>{candidate.salesRep ?? "—"}</td>
                        <td>{candidate.planNumber ?? "No Plan Number"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <footer>
              <span>{selectedCandidateKeys.size} selected</span>
              <div>
                <button type="button" onClick={() => setForecastOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedCandidateKeys.size}
                  onClick={addCandidates}
                >
                  Apply selected
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
      {actionConfirmation && (
        <div class="accounts-workloads-confirmation-backdrop" role="presentation">
          <section class="accounts-workloads-confirmation" role="dialog" aria-modal="true" aria-labelledby="accountsWorkloadsActionTitle">
            <h2 id="accountsWorkloadsActionTitle">
              {actionConfirmation === "save"
                ? "Save changes?"
                : actionConfirmation === "opportunity-save"
                  ? "Save Opportunity changes?"
                  : "Discard changes?"}
            </h2>
            <p>
              {actionConfirmation === "save"
                ? "Save all current Accounts & Workloads changes?"
                : actionConfirmation === "opportunity-save"
                  ? "Save the current Opportunity changes?"
                  : "Discard all unsaved Accounts & Workloads changes?"}
            </p>
            <footer>
              <button type="button" disabled={saving} onClick={() => setActionConfirmation(null)}>Keep editing</button>
              <button type="button" disabled={saving} onClick={() => void confirmPrimaryAction()}>
                {actionConfirmation === "save"
                  ? "Save changes"
                  : actionConfirmation === "opportunity-save"
                    ? "Save Opportunities"
                    : "Discard changes"}
              </button>
            </footer>
          </section>
        </div>
      )}
      {pendingNavigation && (
        <div class="accounts-workloads-confirmation-backdrop" role="presentation">
          <section class="accounts-workloads-confirmation" role="dialog" aria-modal="true" aria-labelledby="accountsWorkloadsNavigationTitle">
            <h2 id="accountsWorkloadsNavigationTitle">Unsaved changes</h2>
            <p>Save changes before moving to {pendingNavigation.label}?</p>
            <footer>
              <button type="button" disabled={saving} onClick={() => setPendingNavigation(null)}>Stay</button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  const pending = pendingNavigation;
                  cancelAllDrafts();
                  setPendingNavigation(null);
                  pending.action();
                }}
              >
                Discard and Continue
              </button>
              <button type="button" disabled={saving} onClick={() => void saveAndContinue()}>
                {saving ? "Saving…" : "Save and Continue"}
              </button>
            </footer>
          </section>
        </div>
      )}
      {latestUpdateTooltip && typeof document !== "undefined" && createPortal(
        <div
          class="accounts-workloads-latest-tooltip"
          role="tooltip"
          style={{
            top: `${latestUpdateTooltip.top}px`,
            left: `${Math.max(8, latestUpdateTooltip.left)}px`,
          }}
        >
          {latestUpdateTooltip.text}
        </div>,
        document.body,
      )}
    </section>
  );
}
