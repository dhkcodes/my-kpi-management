import {
  AccountWorkloadMetadata,
  AccountWorkloadRow,
  AccountWorkloadStateSeed,
  accountWorkloadSeed
} from "./accountsWorkloadsMockData";

export const ACCOUNTS_WORKLOADS_PRIVATE_DATA_URL = "/private-data/accounts-workloads-fy27.json";

export type AccountsWorkloadsDataSource = "api" | "private-runtime" | "synthetic-fallback";
export type AccountsWorkloadsLoadResult = Readonly<{
  seed: AccountWorkloadStateSeed;
  source: AccountsWorkloadsDataSource;
}>;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringValue = (value: unknown, field: string, required = false) => {
  if (typeof value !== "string") throw new Error(`Invalid ${field}`);
  const normalized = value.trim();
  if (required && normalized === "") throw new Error(`Missing ${field}`);
  return normalized;
};

const nullableString = (value: unknown, field: string) => {
  if (value === null) return null;
  return stringValue(value, field);
};

const finiteNumber = (value: unknown, field: string, nullable = false) => {
  if (nullable && value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid ${field}`);
  return value;
};

const integerValue = (value: unknown, field: string, minimum = 0) => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) throw new Error(`Invalid ${field}`);
  return value;
};

const booleanValue = (value: unknown, field: string) => {
  if (typeof value !== "boolean") throw new Error(`Invalid ${field}`);
  return value;
};

const isoDateValue = (value: unknown, field: string) => {
  const normalized = stringValue(value, field);
  if (normalized !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error(`Invalid ${field}`);
  return normalized;
};

const normalizeMetadata = (value: unknown): AccountWorkloadMetadata => {
  if (!isRecord(value)) throw new Error("Invalid metadata");
  if (value.fiscalYear !== "FY27") throw new Error("Invalid fiscal year");
  if (value.sourceSheet !== "Deal Status") throw new Error("Invalid source sheet");
  if (value.currencyPair !== "USD_KRW") throw new Error("Invalid currency pair");
  const exchangeRate = finiteNumber(value.exchangeRate, "exchange rate");
  if (exchangeRate === null || exchangeRate <= 0) throw new Error("Invalid exchange rate");
  return {
    fiscalYear: "FY27",
    sourceWorkbook: stringValue(value.sourceWorkbook, "source workbook", true),
    sourceSheet: "Deal Status",
    headerRowNumber: integerValue(value.headerRowNumber, "header row", 1),
    exchangeRate,
    currencyPair: "USD_KRW",
    parsedRowCount: integerValue(value.parsedRowCount, "parsed row count", 0)
  };
};

const normalizeRow = (value: unknown, index: number): AccountWorkloadRow => {
  if (!isRecord(value)) throw new Error(`Invalid row ${index + 1}`);
  const winProbability = finiteNumber(value.winProbability, `row ${index + 1} win probability`, true);
  if (winProbability !== null && (winProbability < 0 || winProbability > 100)) {
    throw new Error(`Invalid row ${index + 1} win probability`);
  }
  return {
    id: stringValue(value.id, `row ${index + 1} id`, true),
    sourceRowNumber: integerValue(value.sourceRowNumber, `row ${index + 1} source row`, 1),
    planNumber: stringValue(value.planNumber, `row ${index + 1} plan number`),
    account: stringValue(value.account, `row ${index + 1} account`, true),
    workloadName: stringValue(value.workloadName, `row ${index + 1} workload name`),
    opptyNo: stringValue(value.opptyNo, `row ${index + 1} opportunity number`),
    startDate: isoDateValue(value.startDate, `row ${index + 1} start date`),
    endDate: isoDateValue(value.endDate, `row ${index + 1} end date`),
    arrUsd: finiteNumber(value.arrUsd, `row ${index + 1} ARR USD`, true),
    arrKrw: finiteNumber(value.arrKrw, `row ${index + 1} ARR KRW`, true),
    acrUsd: finiteNumber(value.acrUsd, `row ${index + 1} ACR USD`, true),
    acrKrw: finiteNumber(value.acrKrw, `row ${index + 1} ACR KRW`, true),
    target: stringValue(value.target, `row ${index + 1} target`),
    winProbability,
    latestUpdate: stringValue(value.latestUpdate, `row ${index + 1} latest update`),
    notes: stringValue(value.notes, `row ${index + 1} notes`),
    isImportant: booleanValue(value.isImportant, `row ${index + 1} important flag`),
    isDeleted: booleanValue(value.isDeleted, `row ${index + 1} deleted flag`),
    deletedAt: nullableString(value.deletedAt, `row ${index + 1} deleted at`),
    deletedBy: nullableString(value.deletedBy, `row ${index + 1} deleted by`)
  };
};

export const normalizeAccountWorkloadStateSeed = (value: unknown): AccountWorkloadStateSeed => {
  if (!isRecord(value)) throw new Error("Invalid Accounts & Workloads payload");
  const metadata = normalizeMetadata(value.metadata);
  if (!Array.isArray(value.rows)) throw new Error("Invalid rows");
  const rows = value.rows.map(normalizeRow);
  if (metadata.parsedRowCount !== rows.length) throw new Error("Parsed row count does not match rows");
  const ids = new Set(rows.map((row) => row.id));
  if (ids.size !== rows.length) throw new Error("Duplicate row IDs");
  return { metadata, rows };
};

const fallbackSeed = (): AccountWorkloadStateSeed => ({
  metadata: { ...accountWorkloadSeed.metadata },
  rows: accountWorkloadSeed.rows.map((row) => ({ ...row }))
});

export const loadAccountWorkloadStateSeed = async (
  fetchImpl: FetchLike = fetch,
  url = ACCOUNTS_WORKLOADS_PRIVATE_DATA_URL
): Promise<AccountsWorkloadsLoadResult> => {
  const response = await fetchImpl(url, { cache: "no-store", credentials: "same-origin" });
  if (response.status === 404) return { seed: fallbackSeed(), source: "synthetic-fallback" };
  if (!response.ok) throw new Error(`Accounts & Workloads development data request failed (${response.status})`);
  const seed = normalizeAccountWorkloadStateSeed(await response.json());
  return { seed, source: "private-runtime" };
};
