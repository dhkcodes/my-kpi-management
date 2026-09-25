import type {
  AccountWorkloadDeal,
  DealWrite,
  OpportunityDealResult,
} from "../../data/accountsWorkloadsApi";

export type SubmittedOpportunityWrite = Readonly<{
  clientId: string;
  workloadId: number;
  originalId: number | null;
  write: DealWrite;
}>;

export type ConfirmedOpportunityDeal = Readonly<Pick<
  AccountWorkloadDeal,
  | "id"
  | "name"
  | "opportunityNo"
  | "revenueType"
  | "status"
  | "targetFiscalYear"
  | "targetQuarter"
  | "actualCloseDate"
  | "contractStartDate"
  | "contractEndDate"
  | "arrUsd"
  | "arrKrw"
  | "acrUsd"
  | "acrKrw"
  | "winProbability"
  | "latestUpdate"
  | "notes"
>>;

export type ConfirmedOpportunityWorkload = Readonly<{
  id: number;
  deals: ReadonlyArray<ConfirmedOpportunityDeal>;
}>;

const trim = (value: string | null) => value === null ? null : value.trim();
const trimBlankToNull = (value: string | null) => trim(value) || null;

/** Convert a finite JS number to Oracle's NUMBER(*,4) half-up representation. */
const oracleScale4 = (value: number | null): string | null => {
  if (value === null) return null;
  if (!Number.isFinite(value)) return `invalid:${String(value)}`;

  const negative = value < 0;
  const [coefficient, exponentText = "0"] = Math.abs(value).toString().toLowerCase().split("e");
  const [whole, fraction = ""] = coefficient.split(".");
  const digits = `${whole}${fraction}`;
  const decimalPosition = whole.length + Number(exponentText);
  const digitAt = (position: number) =>
    position < 0 || position >= digits.length ? "0" : digits[position];

  let integer = decimalPosition <= 0
    ? "0"
    : Array.from({ length: decimalPosition }, (_, index) => digitAt(index)).join("");
  let decimals = Array.from(
    { length: 4 },
    (_, index) => digitAt(decimalPosition + index),
  ).join("");

  if (digitAt(decimalPosition + 4) >= "5") {
    const scaledDigits = `${integer}${decimals}`.split("");
    let carry = 1;
    for (let index = scaledDigits.length - 1; index >= 0 && carry; index -= 1) {
      const next = Number(scaledDigits[index]) + carry;
      scaledDigits[index] = String(next % 10);
      carry = next >= 10 ? 1 : 0;
    }
    if (carry) scaledDigits.unshift("1");
    integer = scaledDigits.slice(0, -4).join("") || "0";
    decimals = scaledDigits.slice(-4).join("").padStart(4, "0");
  }

  integer = integer.replace(/^0+(?=\d)/, "");
  const scaled = `${integer}.${decimals}`;
  return negative && scaled !== "0.0000" ? `-${scaled}` : scaled;
};

const comparedFields = [
  "name",
  "opportunityNo",
  "revenueType",
  "status",
  "targetFiscalYear",
  "targetQuarter",
  "actualCloseDate",
  "contractStartDate",
  "contractEndDate",
  "arrUsd",
  "arrKrw",
  "acrUsd",
  "acrKrw",
  "winProbability",
  "latestUpdate",
  "notes",
] as const;

type ComparedField = typeof comparedFields[number];
const numericFields = new Set<ComparedField>([
  "arrUsd", "arrKrw", "acrUsd", "acrKrw", "winProbability",
]);

const normalizedField = (
  field: ComparedField,
  value: DealWrite[ComparedField] | ConfirmedOpportunityDeal[ComparedField],
) => {
  if (field === "name") return trim(value as string | null);
  if (field === "opportunityNo" || field === "latestUpdate") {
    return trimBlankToNull(value as string | null);
  }
  if (numericFields.has(field)) return oracleScale4(value as number | null);
  return value;
};

const verifyPersistedFields = (
  submission: SubmittedOpportunityWrite,
  confirmed: ConfirmedOpportunityDeal,
) => {
  for (const field of comparedFields) {
    // For existing rows, null/blank means "retain latest update" rather than write NULL.
    if (
      field === "latestUpdate" &&
      submission.originalId !== null &&
      trimBlankToNull(submission.write.latestUpdate) === null
    ) continue;

    const expected = normalizedField(field, submission.write[field]);
    const actual = normalizedField(field, confirmed[field]);
    if (!Object.is(expected, actual)) {
      throw new Error(`Saved Opportunity field mismatch: ${field}. Reload and reconcile before retrying.`);
    }
  }
};

/**
 * Confirm each submitted write against the authoritative hierarchy. Existing rows
 * retain their original identity; newly inserted rows must be correlated through
 * the save response's clientId -> serverId result. Counts are never sufficient.
 */
export const validateConfirmedOpportunityWrites = (
  submissions: ReadonlyArray<SubmittedOpportunityWrite>,
  workloads: ReadonlyArray<ConfirmedOpportunityWorkload>,
  dealResults: ReadonlyArray<OpportunityDealResult>,
) => {
  const dealsByWorkload = new Map(
    workloads.map((workload) => [workload.id, workload.deals] as const),
  );
  const resultByClientId = new Map<string, OpportunityDealResult>();
  for (const result of dealResults) {
    if (resultByClientId.has(result.clientId)) {
      throw new Error(`Duplicate Opportunity clientId mapping: ${result.clientId}.`);
    }
    resultByClientId.set(result.clientId, result);
  }

  for (const submission of submissions) {
    const confirmedDeals = dealsByWorkload.get(submission.workloadId);
    if (!confirmedDeals) {
      throw new Error("Saved Opportunity workload was not returned. Reload and reconcile before retrying.");
    }

    if (submission.write.action === "DELETE") {
      if (submission.originalId === null) {
        throw new Error("A new Opportunity cannot be confirmed as a server deletion.");
      }
      if (confirmedDeals.some((deal) => deal.id === submission.originalId)) {
        throw new Error("Deleted Opportunity was still returned. Reload and reconcile before retrying.");
      }
      continue;
    }

    let confirmedId = submission.originalId;
    if (confirmedId === null) {
      const result = resultByClientId.get(submission.clientId);
      if (
        !result ||
        result.action !== "UPSERT" ||
        result.workloadId !== submission.workloadId ||
        !Number.isInteger(result.serverId) ||
        result.serverId <= 0
      ) {
        throw new Error(`Opportunity clientId mapping was missing or invalid: ${submission.clientId}. Reload and reconcile before retrying.`);
      }
      confirmedId = result.serverId;
    }

    const confirmed = confirmedDeals.find((deal) => deal.id === confirmedId);
    if (!confirmed) {
      throw new Error("Saved Opportunity was not returned. Reload and reconcile before retrying.");
    }
    verifyPersistedFields(submission, confirmed);
  }
};
