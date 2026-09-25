import type {
  AccountWorkloadDeal,
  DealWrite,
  OpportunityDealResult,
} from "../../data/accountsWorkloadsApi";
import { canonicalizeOpportunityRevenueType } from "../../data/opportunityRevenueType";

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
  if (field === "revenueType") {
    return canonicalizeOpportunityRevenueType(String(value ?? ""));
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

const persistedFieldsMatch = (
  submission: SubmittedOpportunityWrite,
  confirmed: ConfirmedOpportunityDeal,
) => {
  try {
    verifyPersistedFields(submission, confirmed);
    return true;
  } catch {
    return false;
  }
};

/**
 * Older Backends returned an authoritative hierarchy but no clientId mappings.
 * Recover only mappings that have one unique new server row matching one unique
 * submission. Ambiguous identical rows deliberately remain uncorrelated.
 */
export const correlateLegacyOpportunityResults = (
  submissions: ReadonlyArray<SubmittedOpportunityWrite>,
  workloads: ReadonlyArray<ConfirmedOpportunityWorkload>,
  knownServerIds: ReadonlySet<number>,
): OpportunityDealResult[] => {
  const dealsByWorkload = new Map(
    workloads.map((workload) => [workload.id, workload.deals] as const),
  );
  const candidates = new Map<string, number[]>();
  for (const submission of submissions) {
    if (submission.originalId !== null || submission.write.action !== "UPSERT") continue;
    const matches = (dealsByWorkload.get(submission.workloadId) ?? [])
      .filter((deal) => !knownServerIds.has(deal.id) && persistedFieldsMatch(submission, deal))
      .map((deal) => deal.id);
    candidates.set(submission.clientId, matches);
  }

  const results: OpportunityDealResult[] = [];
  const assigned = new Set<number>();
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const submission of submissions) {
      if (!candidates.has(submission.clientId) || results.some((item) => item.clientId === submission.clientId)) continue;
      const available = candidates.get(submission.clientId)!.filter((id) => !assigned.has(id));
      const uniquelyClaimed = available.filter((id) =>
        [...candidates.entries()].filter(([clientId, ids]) =>
          !results.some((item) => item.clientId === clientId) && ids.includes(id) && !assigned.has(id),
        ).length === 1,
      );
      if (available.length !== 1 || uniquelyClaimed.length !== 1) continue;
      assigned.add(available[0]);
      results.push({
        clientId: submission.clientId,
        serverId: available[0],
        workloadId: submission.workloadId,
        action: "UPSERT",
      });
      progressed = true;
    }
  }
  return results;
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
  knownServerIds: ReadonlySet<number> = new Set<number>(),
) => {
  const dealsByWorkload = new Map(
    workloads.map((workload) => [workload.id, workload.deals] as const),
  );
  const resultByClientId = new Map<string, OpportunityDealResult>();
  const clientIdByServerId = new Map<number, string>();
  for (const result of dealResults) {
    if (resultByClientId.has(result.clientId)) {
      throw new Error(`Duplicate Opportunity clientId mapping: ${result.clientId}.`);
    }
    if (result.action === "UPSERT") {
      const mappedClientId = clientIdByServerId.get(result.serverId);
      if (mappedClientId !== undefined && mappedClientId !== result.clientId) {
        throw new Error(`Duplicate Opportunity serverId mapping: ${result.serverId}.`);
      }
      clientIdByServerId.set(result.serverId, result.clientId);
    }
    resultByClientId.set(result.clientId, result);
  }

  const assignedNewServerIds = new Set<number>();
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
      if (result) {
        if (
          result.action !== "UPSERT" ||
          result.workloadId !== submission.workloadId ||
          !Number.isInteger(result.serverId) ||
          result.serverId <= 0 ||
          knownServerIds.has(result.serverId) ||
          assignedNewServerIds.has(result.serverId)
        ) {
          throw new Error(`Opportunity clientId mapping was missing or invalid: ${submission.clientId}. Reload and reconcile before retrying.`);
        }
        confirmedId = result.serverId;
      } else {
        throw new Error(
          `Opportunity clientId mapping was unavailable after the POST response was lost: ${submission.clientId}. Confirmation remains pending.`,
        );
      }
      assignedNewServerIds.add(confirmedId);
    }

    const confirmed = confirmedDeals.find((deal) => deal.id === confirmedId);
    if (!confirmed) {
      throw new Error("Saved Opportunity was not returned. Reload and reconcile before retrying.");
    }
    verifyPersistedFields(submission, confirmed);
  }
};
