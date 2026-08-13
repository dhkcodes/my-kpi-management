import { AccountWorkloadRow } from "./accountsWorkloadsMockData";

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
