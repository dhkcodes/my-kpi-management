import { AccountWorkloadRow } from "./accountsWorkloadsMockData";

export const ACCOUNT_WORKLOAD_EDITABLE_FIELDS = [
  "planNumber", "account", "workloadName", "opptyNo", "startDate", "endDate",
  "arrUsd", "arrKrw", "acrUsd", "acrKrw", "target", "winProbability", "latestUpdate", "notes"
] as const satisfies readonly (keyof AccountWorkloadRow)[];

const comparable = (value: unknown) => value ?? "";

export const hasEditableAccountWorkloadChanges = (
  savedRows: readonly AccountWorkloadRow[],
  draftRows: readonly AccountWorkloadRow[]
) => {
  const savedById = new Map(savedRows.map((row) => [row.id, row]));
  return draftRows.some((draft) => {
    const saved = savedById.get(draft.id);
    return Boolean(saved && ACCOUNT_WORKLOAD_EDITABLE_FIELDS.some((key) => comparable(saved[key]) !== comparable(draft[key])));
  });
};

export const overlayEditableAccountWorkloadChanges = (
  authoritativeRows: readonly AccountWorkloadRow[],
  draftRows: readonly AccountWorkloadRow[]
) => {
  const draftsById = new Map(draftRows.map((row) => [row.id, row]));
  return authoritativeRows.map((authoritative) => {
    const draft = draftsById.get(authoritative.id);
    if (!draft) return authoritative;
    const next = { ...authoritative };
    for (const key of ACCOUNT_WORKLOAD_EDITABLE_FIELDS) (next as any)[key] = draft[key];
    return next;
  });
};

export const applyPermanentDeletesLocally = (
  rows: readonly AccountWorkloadRow[],
  permanentDeleteIds: readonly string[] = []
) => {
  if (permanentDeleteIds.length === 0) return [...rows];
  const permanentIds = new Set(permanentDeleteIds);
  return rows.filter((row) => !permanentIds.has(row.id));
};

export const classifyAccountDeleteTargets = (
  savedRows: readonly AccountWorkloadRow[],
  selectedRowIds: readonly string[],
  draftRowId?: string | null
) => {
  const selected = new Set(selectedRowIds);
  return {
    draftIds: draftRowId && selected.has(draftRowId) ? [draftRowId] : [],
    activeIds: savedRows.filter((row) => selected.has(row.id) && !row.isDeleted).map((row) => row.id),
    permanentIds: savedRows.filter((row) => selected.has(row.id) && row.isDeleted).map((row) => row.id)
  };
};

export type DeleteMode = "draft" | "permanent" | "mixed" | "none";

export const resolveDeleteMode = (
  savedRows: AccountWorkloadRow[],
  selectedRowIds: string[]
): DeleteMode => {
  const selected = savedRows.filter((row) => selectedRowIds.includes(row.id));
  if (selected.length === 0) return "none";
  const deletedCount = selected.filter((row) => row.isDeleted).length;
  if (deletedCount === 0) return "draft";
  if (deletedCount === selected.length) return "permanent";
  return "mixed";
};

export const hasSelectedDeletedRows = (
  savedRows: AccountWorkloadRow[],
  selectedRowIds: string[]
) => savedRows.some((row) => selectedRowIds.includes(row.id) && row.isDeleted);

export const applyDraftDelete = (
  rows: AccountWorkloadRow[],
  selectedRowIds: string[],
  actor: string,
  deletedAt: string
) => rows.map((row) => selectedRowIds.includes(row.id) && !row.isDeleted
  ? { ...row, isDeleted: true, deletedAt, deletedBy: actor }
  : row);

export const applyDraftRestore = (
  rows: AccountWorkloadRow[],
  selectedRowIds: string[],
  savedRows: AccountWorkloadRow[]
) => rows.map((row) => {
  if (!selectedRowIds.includes(row.id) || !row.isDeleted) return row;
  const saved = savedRows.find((item) => item.id === row.id);
  return {
    ...row,
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    versionNo: saved?.versionNo ?? row.versionNo
  };
});

export const remainingPermanentDeleteIds = (
  retryRows: AccountWorkloadRow[],
  attemptedIds: string[]
) => attemptedIds.filter((id) => retryRows.some((row) => row.id === id && row.isDeleted));

export const withMinimumPendingDuration = async <T>(
  operation: () => Promise<T>,
  minimumMilliseconds = 500,
  now = Date.now,
  wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
) => {
  const startedAt = now();
  try {
    return await operation();
  } finally {
    const remaining = minimumMilliseconds - (now() - startedAt);
    if (remaining > 0) await wait(remaining);
  }
};
