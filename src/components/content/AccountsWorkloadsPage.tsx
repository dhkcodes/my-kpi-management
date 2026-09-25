import { ComponentChildren, Fragment, h } from "preact";
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
  WorkloadPlanWrite,
  filterForecastCandidates,
  fetchAccountsWorkloadsHierarchy,
  fetchForecastCandidates,
  forecastCandidateKey,
  saveAccountsWorkloadsHierarchy,
} from "../../data/accountsWorkloadsApi";

type Props = Readonly<{
  canWrite: boolean;
  breadcrumb?: ComponentChildren;
  onDraftStateChange?: (active: boolean) => void;
  initialSearch?: string;
}>;
type AwField = "account" | "workload" | "plan" | "lastUpdated" | "notes";
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
const isInteractive = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest("input,select,textarea,button,a,oj-button"));
const focusToEnd = (event: FocusEvent) => {
  const target = event.currentTarget as HTMLInputElement | HTMLTextAreaElement;
  const end = target.value.length;
  requestAnimationFrame(() => target.setSelectionRange(end, end));
};
const fmtUsd = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const fmtMoney = (value: number | null) =>
  value === null ? "—" : fmtUsd.format(value);
const targetPeriod = (deal: AccountWorkloadDeal) =>
  deal.targetFiscalYear && deal.targetQuarter
    ? `${deal.targetFiscalYear} Q${deal.targetQuarter}`
    : "";
const targetOptions = Array.from(
  { length: 16 },
  (_, index) => `FY${24 + Math.floor(index / 4)} Q${(index % 4) + 1}`,
);
const emptyWorkload = (id: number, name = ""): AccountWorkload => ({
  id,
  versionNo: 0,
  name,
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
const dealWrite = (
  deal: AccountWorkloadDeal,
  workloadId: number,
  original: AccountWorkloadDeal | null = null,
): DealWrite => ({
  id: deal.id > 0 ? deal.id : null,
  clientId: deal.id > 0 ? null : `deal-${Math.abs(deal.id)}`,
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
  initialSearch = "",
}: Props) {
  const nextTempId = useRef(-1);
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
  const [error, setError] = useState("");
  const [saveErrors, setSaveErrors] = useState<AccountsWorkloadsFieldError[]>(
    [],
  );
  const [notice, setNotice] = useState("");
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
  const [dealEditCell, setDealEditCell] = useState<DealEditCell | null>(null);
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

  const dirty =
    dirtyAccounts.size +
      dirtyWorkloads.size +
      dealDrafts.size +
      pendingDeleteWorkloadIds.size >
    0;
  useEffect(() => onDraftStateChange?.(dirty), [dirty, onDraftStateChange]);

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchAccountsWorkloadsHierarchy({
        search,
        includeArchived: includeDeleted,
        includeDeletedDeals: includeDeleted,
      });
      setHierarchy(result);
      setBaseline(result);
      setDirtyAccounts(new Set());
      setDirtyWorkloads(new Set());
      setPendingDeleteWorkloadIds(new Set());
      setSelectedRows(new Set());
      setEditCell(null);
    } catch (requestError) {
      setError(friendlyError(requestError));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void reload();
  }, [search, includeDeleted]);

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
                    : field === "lastUpdated"
                      ? { ...workload, lastUpdated: nullable(value) }
                      : field === "notes"
                        ? { ...workload, notes: nullable(value) }
                        : {
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
                          },
              ),
            },
      ),
    }));
    if (field === "account")
      setDirtyAccounts((current) => new Set(current).add(accountId));
    else setDirtyWorkloads((current) => new Set(current).add(workloadId));
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
  const tooltip = (value: string, empty = "—") => (
    <span class="accounts-workloads-ellipsis" tabIndex={value ? 0 : undefined}>
      <span>{value || empty}</span>
      {value && (
        <span class="accounts-workloads-instant-tooltip" role="tooltip">
          {value}
        </span>
      )}
    </span>
  );
  const truncatedWorkload = (value: string) => (
    <span
      class="accounts-workloads-ellipsis"
      onMouseEnter={(event) => {
        const element = event.currentTarget;
        element.title = element.scrollWidth > element.clientWidth ? value : "";
      }}
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
    const changed = value !== original;
    return (
      <td
        class={`${changed ? "is-unsaved-cell " : ""}${editing ? "is-editing-cell" : ""}`}
        onDblClick={(event) => {
          if (isInteractive(event.target)) return;
          event.stopPropagation();
          beginAwEdit(key, field, value);
        }}
      >
        {editing ? (
          field === "lastUpdated" || field === "notes" ? (
            <textarea
              autoFocus
              onFocus={focusToEnd}
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
              onFocus={focusToEnd}
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
          )
        ) : field === "lastUpdated" || field === "notes" ? (
          tooltip(value)
        ) : field === "workload" ? (
          truncatedWorkload(value)
        ) : (
          value || "—"
        )}
      </td>
    );
  };

  const addAw = () => {
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
    const targets = dealDeleteTargets;
    dealDeleteDialogRef.current?.close();
    setDealDeleteTargets([]);
    if (!targets.length) return;
    setSaving(true);
    setError("");
    const pageScrollY = window.scrollY;
    const scrollPositions = new Map(
      [...new Set(targets.map((deal) => deal.workloadId))].map((workloadId) => [
        workloadId,
        document.querySelector<HTMLElement>(`[data-opportunity-scroll="${workloadId}"]`)?.scrollLeft ?? 0,
      ]),
    );
    try {
      const saved = await saveAccountsWorkloadsHierarchy({
        accounts: [],
        workloads: [],
        workloadPlans: [],
        deals: targets.map((deal) =>
          dealWrite({ ...deal, deleted: true }, deal.workloadId, deal),
        ),
      });
      setHierarchy(saved);
      setBaseline(saved);
      setDealDrafts(new Map());
      setSelectedDeals(new Map());
      requestAnimationFrame(() => {
        window.scrollTo({ top: pageScrollY });
        scrollPositions.forEach((left, workloadId) => {
          const scroller = document.querySelector<HTMLElement>(`[data-opportunity-scroll="${workloadId}"]`);
          if (scroller) scroller.scrollLeft = left;
        });
      });
      setNotice(`${targets.length} opportunity deleted.`);
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

  const requestDealDelete = () => {
    const targets = [...selectedDeals.values()].filter((deal) => deal.id > 0);
    if (!targets.length) return;
    setDealDeleteTargets(targets);
    dealDeleteDialogRef.current?.open();
  };

  const deleteSelected = async () => {
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

  const cancelSelected = () => {
    const selected = selectedRows;
    const selectedWorkloadIds = new Set(
      allRows
        .filter((row) => selected.has(row.key))
        .map((row) => row.workload.id),
    );
    setHierarchy((current) => ({
      ...current,
      accounts: current.accounts
        .map((account) => {
          const savedAccount = baseline.accounts.find(
            (item) => item.id === account.id,
          );
          return {
            ...account,
            name:
              selected.size &&
              account.workloads.some((workload) =>
                selected.has(rowKey(account.id, workload.id)),
              ) &&
              savedAccount
                ? savedAccount.name
                : account.name,
            workloads: account.workloads
              .map((workload) =>
                selected.has(rowKey(account.id, workload.id))
                  ? (savedAccount?.workloads.find(
                      (item) => item.id === workload.id,
                    ) ?? workload)
                  : workload,
              )
              .filter(
                (workload) =>
                  workload.id > 0 ||
                  !selected.has(rowKey(account.id, workload.id)),
              ),
          };
        })
        .filter((account) => account.id > 0 || account.workloads.length > 0),
    }));
    setDirtyAccounts(
      (current) =>
        new Set(
          [...current].filter(
            (id) =>
              !allRows.some(
                (row) => selected.has(row.key) && row.account.id === id,
              ),
          ),
        ),
    );
    setDirtyWorkloads(
      (current) =>
        new Set([...current].filter((id) => !selectedWorkloadIds.has(id))),
    );
    setPendingDeleteWorkloadIds(
      (current) =>
        new Set([...current].filter((id) => !selectedWorkloadIds.has(id))),
    );
    setDealDrafts(
      (current) =>
        new Map(
          [...current].filter(
            ([, draft]) => !selectedWorkloadIds.has(draft.workloadId),
          ),
        ),
    );
    setSelectedRows(new Set());
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

  const saveAwDrafts = async () => {
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
              lastUpdated: workload.lastUpdated,
              notes: workload.notes,
              highlighted: workload.highlighted,
              action: "ARCHIVE",
            });
          continue;
        }
        if (
          dirtyAccounts.has(account.id) &&
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
        if (dirtyWorkloads.has(workload.id)) {
          if (!account.name.trim() || !workload.name.trim()) {
            setError("Account and Workload are required.");
            return;
          }
          request.workloads.push({
            id: workload.id > 0 ? workload.id : null,
            clientId: workload.id > 0 ? null : refFor(workload.id, "workload"),
            accountRef: refFor(account.id, "account"),
            versionNo: workload.id > 0 ? workload.versionNo : null,
            name: workload.name,
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
    setSaving(true);
    setError("");
    setSaveErrors([]);
    try {
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
      setNotice("AW changes saved.");
    } catch (saveError) {
      setError(friendlyError(saveError));
      setSaveErrors(
        saveError instanceof AccountsWorkloadsApiError ? saveError.errors : [],
      );
    } finally {
      setSaving(false);
    }
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
    if (!canWrite) return;
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
  const updateDealDraft = (key: string, field: DealField, value: string) =>
    setDealDrafts((current) => {
      const draft = current.get(key);
      if (!draft) return current;
      let deal = { ...draft.deal };
      if (field === "target") {
        const match = /^(FY\d{2}) Q([1-4])$/.exec(value);
        deal.targetFiscalYear = match?.[1] ?? null;
        deal.targetQuarter = match ? Number(match[2]) : null;
      } else if (
        ["arrUsd", "arrKrw", "acrUsd", "acrKrw", "winProbability"].includes(
          field,
        )
      )
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
      else (deal as any)[field] = value;
      const next = new Map(current);
      next.set(key, { ...draft, deal });
      return next;
    });
  const addDeal = (workloadId: number) => {
    if (workloadId < 0) return;
    const id = nextTempId.current--;
    const deal = emptyDeal(id, workloadId);
    const key = `draft:${id}`;
    setDealDrafts((current) =>
      new Map(current).set(key, { key, workloadId, original: null, deal }),
    );
    setDealEditCell({ key, field: "name" });
  };
  const cancelDeal = (key: string) => {
    setDealDrafts((current) => {
      const next = new Map(current);
      next.delete(key);
      return next;
    });
    if (dealEditCell?.key === key) setDealEditCell(null);
  };
  const saveDeal = async (draft: DealDraft) => {
    if (!draft.deal.deleted && !draft.deal.name.trim()) {
      setError("Oppty Name is required.");
      return;
    }
    setSaving(true);
    setError("");
    const pageScrollY = window.scrollY;
    const opportunityScroller = document.querySelector<HTMLElement>(
      `[data-opportunity-scroll="${draft.workloadId}"]`,
    );
    const opportunityScrollLeft = opportunityScroller?.scrollLeft ?? 0;
    try {
      const saved = await saveAccountsWorkloadsHierarchy({
        accounts: [],
        workloads: [],
        workloadPlans: [],
        deals: [dealWrite(draft.deal, draft.workloadId, draft.original)],
      });
      const savedWorkload = saved.accounts
        .flatMap((account) => account.workloads)
        .find((workload) => workload.id === draft.workloadId);
      if (!savedWorkload) throw new Error("Saved workload was not returned.");
      const mergeDeals = (
        current: AccountsWorkloadsHierarchy,
      ): AccountsWorkloadsHierarchy => ({
        ...current,
        accounts: current.accounts.map((account) => ({
          ...account,
          workloads: account.workloads.map((workload) =>
            workload.id === draft.workloadId
              ? { ...workload, deals: savedWorkload.deals }
              : workload,
          ),
        })),
      });
      setHierarchy((current) => mergeDeals(current));
      setBaseline((current) => mergeDeals(current));
      setDealDrafts((current) => {
        const next = new Map(current);
        next.delete(draft.key);
        return next;
      });
      setDealEditCell(null);
      setNotice("");
      requestAnimationFrame(() => {
        window.scrollTo({ top: pageScrollY });
        const restoredScroller = document.querySelector<HTMLElement>(
          `[data-opportunity-scroll="${draft.workloadId}"]`,
        );
        if (restoredScroller) restoredScroller.scrollLeft = opportunityScrollLeft;
      });
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

  const dealDisplay = (deal: AccountWorkloadDeal, field: DealField) =>
    field === "target"
      ? targetPeriod(deal)
      : field === "revenueType"
        ? deal.revenueType
        : field === "status"
          ? deal.status
          : String((deal as any)[field] ?? "");
  const isDealDraftChanged = (draft: DealDraft) => {
    if (!draft.original) return true;
    return (
      [
        "name", "opportunityNo", "revenueType", "status", "targetFiscalYear",
        "targetQuarter", "actualCloseDate", "contractStartDate", "contractEndDate",
        "arrUsd", "arrKrw", "acrUsd", "acrKrw", "winProbability", "latestUpdate",
      ] as const
    ).some(
      (field) =>
        String(draft.deal[field] ?? "") !== String(draft.original?.[field] ?? ""),
    );
  };
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
            <option value="NEW">New</option>
            <option value="EXPANSION">Expansion</option>
            <option value="RENEWAL">Renewal</option>
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
            onFocus={focusToEnd}
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
            onFocus={focusToEnd}
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
            onFocus={focusToEnd}
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
        class={`${field === "name" ? "is-oppty-sticky is-oppty-sticky-name " : field === "opportunityNo" ? "is-oppty-sticky is-oppty-sticky-id " : ""}${changed ? "is-unsaved-cell" : ""}`}
        onDblClick={(event) => {
          if (isInteractive(event.target)) return;
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
        {editing
          ? editor
          : field === "latestUpdate"
            ? <span class="accounts-workloads-ellipsis" title={value}>{value || "—"}</span>
            : ["arrUsd", "arrKrw", "acrUsd", "acrKrw", "winProbability"].includes(field) && value
              ? Number(value).toLocaleString("en-US")
              : value || "—"}
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
      const workload = emptyWorkload(workloadId, CANDIDATE_WORKLOAD_NAME);
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
  const hasNewAw = allRows.some((row) => row.workload.id < 0);
  const hasNewDeal = [...dealDrafts.values()].some((draft) => !draft.original);
  const selectedDirtyCount = allRows.filter(
    (row) =>
      selectedRows.has(row.key) &&
      (row.workload.id < 0 ||
        pendingDeleteWorkloadIds.has(row.workload.id) ||
        dirtyAccounts.has(row.account.id) ||
        dirtyWorkloads.has(row.workload.id)),
  ).length;
  const savableAwDraftCount =
    dirtyAccounts.size + dirtyWorkloads.size + pendingDeleteWorkloadIds.size;

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
        <div>
          {breadcrumb}
          <span class="kpi-eyebrow">My Customers 360</span>
          <h1 id="accountsWorkloadsTitle">Accounts &amp; Workloads</h1>
        </div>
        <div class="consumption-import-actions accounts-workloads-header-actions">
          <oj-button
            chroming="outlined"
            disabled={!canWrite || saving || hasNewAw}
            onojAction={() => void openForecast()}
          >
            <span slot="startIcon" class="oj-ux-ico-plus" />
            Account Recommendations
          </oj-button>
          <oj-button
            chroming="callToAction"
            disabled={!canWrite || saving || hasNewAw}
            onojAction={addAw}
          >
            Add Account & Workload
          </oj-button>
        </div>
      </header>
      <form
        class="accounts-workloads-toolbar consumption-range-bar accounts-workloads-toolbar--compact"
        onSubmit={(event) => {
          event.preventDefault();
          if (dirty) {
            setError("Save or cancel drafts before searching.");
            return;
          }
          setSearch(searchInput.trim());
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
            onInput={(event) => setSearchInput(event.currentTarget.value)}
          />
        </label>
        <button
          type="submit"
          class="consumption-range-apply"
          disabled={loading || saving}
        >
          <span class="oj-ux-ico-search" aria-hidden="true" />
          <span class="oj-helper-hidden-accessible">Search</span>
        </button>
        <label class="accounts-workloads-include-deleted">
          <input
            type="checkbox"
            checked={includeDeleted}
            disabled={dirty || loading || saving}
            onChange={(event) => setIncludeDeleted(event.currentTarget.checked)}
          />
          Include Deleted
        </label>
        {selectedCount > 0 && rows.some((row) => selectedRows.has(row.key) && row.workload.id > 0) && (
          <button
            type="button"
            class="accounts-workloads-button"
            disabled={!canWrite || saving}
            onClick={deleteSelected}
          >
            Delete
          </button>
        )}
        {selectedDirtyCount > 0 && (
          <button
            type="button"
            class="accounts-workloads-button"
            onClick={cancelSelected}
          >
            Cancel
          </button>
        )}
        {savableAwDraftCount > 0 && (
          <button
            type="button"
            class="accounts-workloads-button accounts-workloads-button--primary"
            disabled={!canWrite || saving}
            onClick={() => void saveAwDrafts()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        )}
        <span class="accounts-workloads-toolbar-spacer" />
        <oj-button chroming="outlined" disabled={!canWrite || saving || hasNewAw} onojAction={() => void openForecast()}>
          Account Recommendations
        </oj-button>
        <oj-button chroming="callToAction" disabled={!canWrite || saving || hasNewAw} onojAction={addAw}>
          Add Account & Workload
        </oj-button>
      </form>
      <div class="accounts-workloads-table-summary">
        <span>{hierarchy.accounts.length} accounts</span>
      </div>
      {error && (
        <div
          class="accounts-workloads-banner accounts-workloads-banner--error"
          role="alert"
        >
          <strong>{error}</strong>
          {saveErrors.length > 0 && (
            <ul>
              {saveErrors.map((item) => (
                <li>
                  {item.entity} · {item.field}: {item.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {notice && (
        <div class="accounts-workloads-banner" role="status">
          {notice}
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
                      {label} {sortLabel(field)}
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
                        <td colSpan={10}>
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
                                <button
                                  type="button"
                                  disabled={
                                    !canWrite ||
                                    workload.id < 0 ||
                                    hasNewDeal
                                  }
                                  onClick={() => addDeal(workload.id)}
                                >
                                  Add Opportunity
                                </button>
                                {selectedDeals.size > 0 && (
                                  <button
                                    type="button"
                                    disabled={!canWrite || saving}
                                    onClick={requestDealDelete}
                                  >
                                    Delete selected
                                  </button>
                                )}
                                {activeDraft && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={saving}
                                      onClick={() => void saveDeal(activeDraft)}
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      disabled={saving}
                                      onClick={() => cancelDeal(activeDraft.key)}
                                    >
                                      Cancel
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
                                        <th>{label}</th>
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
                                          class={`${draft ? "is-draft" : ""}${draft?.deal.deleted || deal.deleted ? " is-draft-delete" : ""}${selectedDeals.has(deal.id) ? " is-selected" : ""}`}
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
    </section>
  );
}
