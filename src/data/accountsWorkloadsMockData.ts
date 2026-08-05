export type AccountWorkloadRow = {
  id: string;
  sourceRowNumber: number;
  planNumber: string;
  account: string;
  workloadName: string;
  opptyNo: string;
  startDate: string;
  endDate: string;
  arrUsd: number | null;
  arrKrw: number | null;
  acrUsd: number | null;
  acrKrw: number | null;
  target: string;
  winProbability: number | null;
  latestUpdate: string;
  notes: string;
  isImportant: boolean;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedBy: string | null;
};

export type AccountWorkloadMetadata = {
  fiscalYear: "FY27";
  sourceWorkbook: string;
  sourceSheet: "Deal Status";
  headerRowNumber: number;
  exchangeRate: number;
  currencyPair: "USD_KRW";
  parsedRowCount: number;
};

export type AccountWorkloadStateSeed = {
  metadata: AccountWorkloadMetadata;
  rows: AccountWorkloadRow[];
};

const SYNTHETIC_ROW_COUNT = 29;
const SYNTHETIC_EXCHANGE_RATE = 1506.1;
const targetQuarters = ["FY27 Q1", "FY27 Q2", "FY27 Q3", "FY27 Q4"];
const probabilitySteps = [30, 50, 70, 90, 100];

const isoDate = (monthIndex: number, yearOffset = 0) => {
  const month = String((monthIndex % 12) + 1).padStart(2, "0");
  const year = 2026 + Math.floor(monthIndex / 12) + yearOffset;
  const day = String((monthIndex % 20) + 1).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const buildSyntheticRows = (): AccountWorkloadRow[] =>
  Array.from({ length: SYNTHETIC_ROW_COUNT }, (_, index) => {
    const rowNumber = index + 1;
    const arrUsd = rowNumber % 6 === 0 ? null : 10000 + rowNumber * 2750;
    const acrUsd = rowNumber % 5 === 0 ? null : 15000 + rowNumber * 3200;
    const isDeleted = index === 6;
    return {
      id: `fy27-aw-synthetic-${String(rowNumber).padStart(2, "0")}`,
      sourceRowNumber: rowNumber + 1,
      planNumber: rowNumber % 4 === 0 ? `PAYG 9${String(rowNumber).padStart(7, "0")}` : `UCM 9${String(rowNumber).padStart(7, "0")}`,
      account: `Demo Account ${String(Math.floor(index / 4) + 1).padStart(2, "0")}`,
      workloadName: `Synthetic Workload ${String(rowNumber).padStart(2, "0")}`,
      opptyNo: `D${String(70000 + rowNumber)}`,
      startDate: isoDate(index),
      endDate: isoDate(index, 1),
      arrUsd,
      arrKrw: arrUsd === null ? null : Math.round(arrUsd * SYNTHETIC_EXCHANGE_RATE),
      acrUsd,
      acrKrw: acrUsd === null ? null : Math.round(acrUsd * SYNTHETIC_EXCHANGE_RATE),
      target: targetQuarters[index % targetQuarters.length],
      winProbability: probabilitySteps[index % probabilitySteps.length],
      latestUpdate: `Synthetic status update ${rowNumber}: validation activity is in progress.`,
      notes: rowNumber % 3 === 0 ? `Synthetic planning note ${rowNumber}.` : "",
      isImportant: rowNumber % 4 === 0,
      isDeleted,
      deletedAt: isDeleted ? "2026-08-01T00:00:00.000Z" : null,
      deletedBy: isDeleted ? "synthetic-seed" : null
    };
  });

export const accountWorkloadSeed: AccountWorkloadStateSeed = {
  metadata: {
    fiscalYear: "FY27",
    sourceWorkbook: "synthetic-accounts-workloads-fy27.xlsx",
    sourceSheet: "Deal Status",
    headerRowNumber: 1,
    exchangeRate: SYNTHETIC_EXCHANGE_RATE,
    currencyPair: "USD_KRW",
    parsedRowCount: SYNTHETIC_ROW_COUNT
  },
  rows: buildSyntheticRows()
};

export const createAccountWorkloadRows = (): AccountWorkloadRow[] =>
  accountWorkloadSeed.rows.map((row) => ({ ...row }));

export const getAccountWorkloadMetadata = (): AccountWorkloadMetadata => ({
  ...accountWorkloadSeed.metadata
});
