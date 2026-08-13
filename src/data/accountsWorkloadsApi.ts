import { AccountWorkloadRow } from "./accountsWorkloadsMockData";
import { FiscalYear } from "./kpiMockData";

export const ACCOUNTS_WORKLOADS_API_BASE = "/api/v1";

type AccountsWorkloadsRuntime = Readonly<{
  __KPI_API_BASE_URL__?: unknown;
  location?: { hostname?: string; port?: string };
}>;

export class AccountsWorkloadsNetworkError extends Error {
  constructor(public readonly cause: unknown) {
    super("Accounts & Workloads API is unreachable");
    this.name = "AccountsWorkloadsNetworkError";
  }
}

export const canUseDevelopmentDataFallback = (
  error: unknown,
  runtime: AccountsWorkloadsRuntime = globalThis as AccountsWorkloadsRuntime
) => {
  if (typeof runtime.__KPI_API_BASE_URL__ === "string" && runtime.__KPI_API_BASE_URL__.trim() !== "") return false;
  if (!["localhost", "127.0.0.1"].includes(runtime.location?.hostname ?? "")) return false;
  if (error instanceof AccountsWorkloadsNetworkError) return true;
  if (typeof error !== "object" || error === null) return false;
  const apiError = error as { name?: unknown; status?: unknown };
  return apiError.name === "AccountsWorkloadsApiError" && apiError.status === 404;
};

const accountsWorkloadsApiBase = () => {
  const runtime = globalThis as typeof globalThis & AccountsWorkloadsRuntime;
  const configured = runtime.__KPI_API_BASE_URL__;
  if (typeof configured === "string" && configured.trim() !== "") return configured.trim().replace(/\/$/, "");
  if (["localhost", "127.0.0.1"].includes(runtime.location?.hostname ?? "") && runtime.location?.port === "8000") {
    return `http://${runtime.location?.hostname}:18081/api/v1`;
  }
  return ACCOUNTS_WORKLOADS_API_BASE;
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type AccountsWorkloadsListQuery = Readonly<{
  fiscalYear: FiscalYear;
  search?: string;
  includeDeleted?: boolean;
  sort?: string;
  direction?: "asc" | "desc";
}>;

export type AccountsWorkloadsListResponse = Readonly<{
  items: AccountWorkloadRow[];
  total: number;
}>;

export type AccountsWorkloadsSummary = Readonly<{
  activeAccounts: number;
  activeWorkloads: number;
  arrUsd: number;
  acrUsd: number;
  important: number;
  targeted: number;
}>;

export type AccountWorkloadPatch = Readonly<Record<string, unknown> & { versionNo: number }>;

export class AccountsWorkloadsApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "AccountsWorkloadsApiError";
  }
}

export class AccountsWorkloadsPersistenceError extends Error {
  constructor(
    message: string,
    public readonly cause: unknown,
    public readonly authoritative: AccountsWorkloadsListResponse,
    public readonly retryRows: AccountWorkloadRow[]
  ) {
    super(message);
    this.name = "AccountsWorkloadsPersistenceError";
  }
}

const requestJson = async <T>(fetchImpl: FetchLike, url: string, init?: RequestInit): Promise<T> => {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
    });
  } catch (cause) {
    throw new AccountsWorkloadsNetworkError(cause);
  }
  if (!response.ok) {
    let payload: { code?: string; message?: string } = {};
    try {
      payload = await response.json();
    } catch {
      // Keep a sanitized generic message when the response is not JSON.
    }
    throw new AccountsWorkloadsApiError(
      response.status,
      payload.code ?? "HTTP_ERROR",
      payload.message ?? `Accounts & Workloads API request failed (${response.status})`
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
};

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isNullableNumber = (value: unknown): value is number | null => value === null || isFiniteNumber(value);
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === "string";
const textOrEmpty = (value: string | null) => value ?? "";

const parseAccountWorkloadRow = (value: unknown): AccountWorkloadRow | null => {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    !isFiniteNumber(row.commitmentId) || !isFiniteNumber(row.versionNo) || !isFiniteNumber(row.sourceRowNumber) ||
    typeof row.account !== "string" || typeof row.workloadName !== "string" ||
    !isNullableString(row.planNumber) || !isNullableString(row.opptyNo) ||
    !isNullableString(row.startDate) || !isNullableString(row.endDate) ||
    !isNullableNumber(row.arrUsd) || !isNullableNumber(row.arrKrw) ||
    !isNullableNumber(row.acrUsd) || !isNullableNumber(row.acrKrw) ||
    !isNullableString(row.target) || !isNullableNumber(row.winProbability) ||
    !isNullableString(row.latestUpdate) || !isNullableString(row.notes) ||
    typeof row.isImportant !== "boolean" || typeof row.isDeleted !== "boolean" ||
    !isNullableString(row.deletedAt) || !isNullableString(row.deletedBy)
  ) return null;
  return {
    id: row.id,
    commitmentId: row.commitmentId,
    versionNo: row.versionNo,
    sourceRowNumber: row.sourceRowNumber,
    planNumber: textOrEmpty(row.planNumber),
    account: row.account,
    workloadName: row.workloadName,
    opptyNo: textOrEmpty(row.opptyNo),
    startDate: textOrEmpty(row.startDate),
    endDate: textOrEmpty(row.endDate),
    arrUsd: row.arrUsd,
    arrKrw: row.arrKrw,
    acrUsd: row.acrUsd,
    acrKrw: row.acrKrw,
    target: textOrEmpty(row.target),
    winProbability: row.winProbability,
    latestUpdate: textOrEmpty(row.latestUpdate),
    notes: textOrEmpty(row.notes),
    isImportant: row.isImportant,
    isDeleted: row.isDeleted,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy
  };
};

export const fetchAccountsWorkloads = async (
  query: AccountsWorkloadsListQuery,
  fetchImpl: FetchLike = fetch
): Promise<AccountsWorkloadsListResponse> => {
  const params = new URLSearchParams();
  params.set("fiscalYear", query.fiscalYear);
  params.set("search", query.search ?? "");
  params.set("includeDeleted", String(query.includeDeleted ?? false));
  params.set("sort", query.sort ?? "account");
  params.set("direction", query.direction ?? "asc");
  const payload = await requestJson<unknown>(fetchImpl, `${accountsWorkloadsApiBase()}/accounts-workloads?${params.toString()}`);
  const items = typeof payload === "object" && payload !== null
    ? (payload as { items?: unknown }).items
    : undefined;
  const total = typeof payload === "object" && payload !== null
    ? (payload as { total?: unknown }).total
    : undefined;
  const parsedItems = Array.isArray(items) ? items.map(parseAccountWorkloadRow) : [];
  if (
    !Array.isArray(items) || parsedItems.some((row) => row === null) ||
    typeof total !== "number" || !Number.isInteger(total) || total < 0
  ) {
    throw new Error("Malformed Accounts & Workloads API list response");
  }
  return { items: parsedItems as AccountWorkloadRow[], total };
};

const mutableFields: Array<keyof AccountWorkloadRow> = [
  "planNumber", "account", "workloadName", "opptyNo", "startDate", "endDate",
  "arrUsd", "arrKrw", "acrUsd", "acrKrw", "target", "winProbability",
  "latestUpdate", "notes", "isImportant"
];

export const buildAccountWorkloadPatch = (
  saved: AccountWorkloadRow,
  draft: AccountWorkloadRow
): AccountWorkloadPatch => {
  if (saved.commitmentId === undefined || saved.versionNo === undefined) {
    throw new Error("Cannot patch a row without commitmentId and versionNo");
  }
  const patch: Record<string, unknown> = { versionNo: saved.versionNo };
  mutableFields.forEach((field) => {
    if (!Object.is(saved[field], draft[field])) patch[field] = draft[field];
  });
  return patch as AccountWorkloadPatch;
};

export const createAccountWorkload = async (
  row: AccountWorkloadRow,
  fiscalYear: FiscalYear,
  fetchImpl: FetchLike = fetch
): Promise<AccountWorkloadRow> => {
  const { id: _id, commitmentId: _commitmentId, versionNo: _versionNo, sourceRowNumber: _sourceRowNumber, isDeleted: _isDeleted, deletedAt: _deletedAt, deletedBy: _deletedBy, ...fields } = row;
  const payload = await requestJson<unknown>(fetchImpl, `${accountsWorkloadsApiBase()}/accounts-workloads`, {
    method: "POST",
    body: JSON.stringify({ fiscalYear, ...fields })
  });
  const created = parseAccountWorkloadRow(payload);
  if (!created) throw new Error("Malformed Accounts & Workloads API mutation response");
  return created;
};

export const patchAccountWorkload = async (
  commitmentId: number,
  patch: AccountWorkloadPatch,
  fetchImpl: FetchLike = fetch
): Promise<AccountWorkloadRow> => {
  const payload = await requestJson<unknown>(
    fetchImpl,
    `${accountsWorkloadsApiBase()}/accounts-workloads/${commitmentId}`,
    { method: "PATCH", body: JSON.stringify(patch) }
  );
  const updated = parseAccountWorkloadRow(payload);
  if (!updated) throw new Error("Malformed Accounts & Workloads API mutation response");
  return updated;
};

export const deleteAccountWorkload = async (
  commitmentId: number,
  versionNo: number,
  fetchImpl: FetchLike = fetch
): Promise<void> => requestJson(
  fetchImpl,
  `${accountsWorkloadsApiBase()}/accounts-workloads/${commitmentId}?versionNo=${encodeURIComponent(versionNo)}`,
  { method: "DELETE" }
);

export const restoreAccountWorkload = async (
  commitmentId: number,
  versionNo: number,
  fetchImpl: FetchLike = fetch
): Promise<AccountWorkloadRow> => {
  const payload = await requestJson<unknown>(
    fetchImpl,
    `${accountsWorkloadsApiBase()}/accounts-workloads/${commitmentId}/restore?versionNo=${encodeURIComponent(versionNo)}`,
    { method: "POST" }
  );
  const restored = parseAccountWorkloadRow(payload);
  if (!restored) throw new Error("Malformed Accounts & Workloads API mutation response");
  return restored;
};

export const permanentlyDeleteAccountWorkload = async (
  commitmentId: number,
  versionNo: number,
  fetchImpl: FetchLike = fetch
): Promise<void> => requestJson(
  fetchImpl,
  `${accountsWorkloadsApiBase()}/accounts-workloads/${commitmentId}/permanent?versionNo=${encodeURIComponent(versionNo)}`,
  { method: "DELETE" }
);

export const fetchAccountsWorkloadsSummary = async (
  fiscalYear: FiscalYear,
  fetchImpl: FetchLike = fetch
): Promise<AccountsWorkloadsSummary> => requestJson(
  fetchImpl,
  `${accountsWorkloadsApiBase()}/dashboard/accounts-workloads?fiscalYear=${encodeURIComponent(fiscalYear)}`
);

export const persistAccountWorkloadChanges = async (
  savedRows: AccountWorkloadRow[],
  draftRows: AccountWorkloadRow[],
  fiscalYear: FiscalYear,
  fetchImpl: FetchLike = fetch,
  permanentDeleteIds: string[] = []
): Promise<void> => {
  for (const saved of savedRows) {
    if (permanentDeleteIds.includes(saved.id) && saved.isDeleted && saved.commitmentId !== undefined && saved.versionNo !== undefined) {
      await permanentlyDeleteAccountWorkload(saved.commitmentId, saved.versionNo, fetchImpl);
    }
  }
  for (const draft of draftRows) {
    if (permanentDeleteIds.includes(draft.id)) continue;
    const saved = savedRows.find((row) => row.id === draft.id);
    if (!saved) {
      await createAccountWorkload(draft, fiscalYear, fetchImpl);
      continue;
    }
    if (saved.commitmentId === undefined || saved.versionNo === undefined) continue;
    if (!saved.isDeleted && draft.isDeleted) {
      await deleteAccountWorkload(saved.commitmentId, saved.versionNo, fetchImpl);
      continue;
    }
    if (saved.isDeleted && !draft.isDeleted) {
      await restoreAccountWorkload(saved.commitmentId, saved.versionNo, fetchImpl);
      continue;
    }
    const patch = buildAccountWorkloadPatch(saved, draft);
    if (Object.keys(patch).length > 1) {
      await patchAccountWorkload(saved.commitmentId, patch, fetchImpl);
    }
  }
};

type PendingChange = Readonly<{
  draft: AccountWorkloadRow;
  saved?: AccountWorkloadRow;
  kind: "create" | "patch" | "delete" | "restore" | "permanent";
  patch?: AccountWorkloadPatch;
}>;

const collectPendingChanges = (
  savedRows: AccountWorkloadRow[],
  draftRows: AccountWorkloadRow[],
  permanentDeleteIds: string[] = []
): PendingChange[] => {
  const changes: PendingChange[] = [];
  savedRows
    .filter((saved) => permanentDeleteIds.includes(saved.id) && saved.isDeleted)
    .forEach((saved) => changes.push({ saved, draft: saved, kind: "permanent" }));
  for (const draft of draftRows) {
    if (permanentDeleteIds.includes(draft.id)) continue;
    const saved = savedRows.find((row) => row.id === draft.id);
    if (!saved) {
      changes.push({ draft, kind: "create" });
      continue;
    }
    if (saved.commitmentId === undefined || saved.versionNo === undefined) continue;
    if (!saved.isDeleted && draft.isDeleted) {
      changes.push({ draft, saved, kind: "delete" });
      continue;
    }
    if (saved.isDeleted && !draft.isDeleted) {
      changes.push({ draft, saved, kind: "restore" });
      continue;
    }
    const patch = buildAccountWorkloadPatch(saved, draft);
    if (Object.keys(patch).length > 1) changes.push({ draft, saved, kind: "patch", patch });
  }
  return changes;
};

const retryRowsAfterPartialSave = (
  authoritativeRows: AccountWorkloadRow[],
  pendingChanges: PendingChange[]
) => {
  const retryRows = authoritativeRows.map((row) => {
    const pending = pendingChanges.find((change) =>
      change.saved?.id === row.id ||
      (change.saved?.commitmentId !== undefined && change.saved.commitmentId === row.commitmentId)
    );
    if (!pending) return row;
    if (pending.kind === "delete") {
      return {
        ...row,
        isDeleted: true,
        deletedAt: pending.draft.deletedAt,
        deletedBy: pending.draft.deletedBy
      };
    }
    if (pending.kind === "restore") {
      return {
        ...row,
        isDeleted: false,
        deletedAt: null,
        deletedBy: null
      };
    }
    if (pending.kind !== "patch" || !pending.patch) return row;
    const changedFields = Object.entries(pending.patch)
      .filter(([field]) => field !== "versionNo");
    return { ...row, ...Object.fromEntries(changedFields) } as AccountWorkloadRow;
  });
  pendingChanges
    .filter((change) => change.kind === "create")
    .forEach((change) => retryRows.push(change.draft));
  return retryRows;
};

const replaceCommittedRow = (
  rows: AccountWorkloadRow[],
  saved: AccountWorkloadRow,
  committed: AccountWorkloadRow
) => rows.map((row) =>
  row.id === saved.id ||
  (saved.commitmentId !== undefined && row.commitmentId === saved.commitmentId)
    ? committed
    : row
);

export const persistAndReconcileAccountWorkloadChanges = async (
  savedRows: AccountWorkloadRow[],
  draftRows: AccountWorkloadRow[],
  fiscalYear: FiscalYear,
  refreshQuery: AccountsWorkloadsListQuery,
  fetchImpl: FetchLike = fetch,
  permanentDeleteIds: string[] = []
): Promise<AccountsWorkloadsListResponse> => {
  const changes = collectPendingChanges(savedRows, draftRows, permanentDeleteIds);
  const pendingChanges = [...changes];
  let reconciledRows = [...savedRows];
  let completedWrites = 0;

  try {
    for (const change of changes) {
      if (change.kind === "create") {
        const created = await createAccountWorkload(change.draft, fiscalYear, fetchImpl);
        reconciledRows = [...reconciledRows, created];
      } else if (change.kind === "delete" && change.saved?.commitmentId !== undefined && change.saved.versionNo !== undefined) {
        await deleteAccountWorkload(change.saved.commitmentId, change.saved.versionNo, fetchImpl);
        reconciledRows = refreshQuery.includeDeleted
          ? reconciledRows.map((row) => row.id === change.saved?.id
              ? { ...row, isDeleted: true, versionNo: (row.versionNo ?? 0) + 1 }
              : row)
          : reconciledRows.filter((row) => row.id !== change.saved?.id);
      } else if (change.kind === "restore" && change.saved?.commitmentId !== undefined && change.saved.versionNo !== undefined) {
        const restored = await restoreAccountWorkload(change.saved.commitmentId, change.saved.versionNo, fetchImpl);
        reconciledRows = replaceCommittedRow(reconciledRows, change.saved, restored);
      } else if (change.kind === "permanent" && change.saved?.commitmentId !== undefined && change.saved.versionNo !== undefined) {
        await permanentlyDeleteAccountWorkload(change.saved.commitmentId, change.saved.versionNo, fetchImpl);
        reconciledRows = reconciledRows.filter((row) => row.id !== change.saved?.id);
      } else if (change.kind === "patch" && change.saved?.commitmentId !== undefined && change.patch) {
        const updated = await patchAccountWorkload(change.saved.commitmentId, change.patch, fetchImpl);
        reconciledRows = replaceCommittedRow(reconciledRows, change.saved, updated);
      }
      completedWrites += 1;
      pendingChanges.shift();
    }
  } catch (cause) {
    if (completedWrites === 0) throw cause;
    try {
      const authoritative = await fetchAccountsWorkloads(refreshQuery, fetchImpl);
      throw new AccountsWorkloadsPersistenceError(
        "Some changes were saved before a later operation failed. Server state was reloaded.",
        cause,
        authoritative,
        retryRowsAfterPartialSave(authoritative.items, pendingChanges)
      );
    } catch (refreshCause) {
      if (refreshCause instanceof AccountsWorkloadsPersistenceError) throw refreshCause;
      const authoritative = { items: reconciledRows, total: reconciledRows.length };
      throw new AccountsWorkloadsPersistenceError(
        "Some changes were saved, but the authoritative refresh also failed. Completed writes were reconciled locally.",
        { operation: cause, refresh: refreshCause },
        authoritative,
        retryRowsAfterPartialSave(authoritative.items, pendingChanges)
      );
    }
  }

  try {
    return await fetchAccountsWorkloads(refreshQuery, fetchImpl);
  } catch (cause) {
    if (completedWrites === 0) throw cause;
    const authoritative = { items: reconciledRows, total: reconciledRows.length };
    throw new AccountsWorkloadsPersistenceError(
      "Changes were saved, but the authoritative refresh failed. Completed writes will not be resent.",
      cause,
      authoritative,
      authoritative.items
    );
  }
};
