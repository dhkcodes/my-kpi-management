import { compareExactDecimals, subtractExactDecimals } from "./exactDecimal";
import type { ConsumptionPillar } from "./consumptionData";

export type ForecastImportComparisonRow = Readonly<{
  normalizedAccount: string;
  pillar: Exclude<ConsumptionPillar, "ALL">;
  periodKey: string;
  forecastAmount: string;
}>;

export type CurrentForecastComparisonRow = Readonly<{
  normalizedAccount: string;
  pillar: Exclude<ConsumptionPillar, "ALL">;
  periodKey: string;
  amountExact: string;
}>;

export type ForecastImportComparison = Readonly<{
  status: "available";
  currentValue: string;
  inputValue: string;
  difference: string;
}> | Readonly<{
  status: "unavailable";
  inputValue: string;
  reason: "Version mismatch" | "Current data unavailable" | "No unique current value" | "Duplicate join key" | "Invalid decimal";
}>;

const normalizedIdentity = (value: string): string => value.trim().replace(/\s+/g, " ").toLocaleUpperCase();
const forecastJoinKey = (row: Pick<ForecastImportComparisonRow, "normalizedAccount" | "pillar" | "periodKey">): string =>
  `${normalizedIdentity(row.normalizedAccount)}::${row.pillar}::${row.periodKey}`;

export const buildForecastImportComparisons = (
  previewEtag: string,
  workspaceEtag: string | null,
  previewRows: readonly ForecastImportComparisonRow[],
  currentRows: readonly CurrentForecastComparisonRow[]
): readonly ForecastImportComparison[] => {
  if (workspaceEtag === null) return previewRows.map((row) => ({
    status: "unavailable",
    inputValue: row.forecastAmount,
    reason: "Current data unavailable"
  }));
  if (previewEtag !== workspaceEtag) return previewRows.map((row) => ({
    status: "unavailable",
    inputValue: row.forecastAmount,
    reason: "Version mismatch"
  }));

  const previewKeyCounts = new Map<string, number>();
  previewRows.forEach((row) => {
    const key = forecastJoinKey(row);
    previewKeyCounts.set(key, (previewKeyCounts.get(key) ?? 0) + 1);
  });
  const currentByKey = new Map<string, CurrentForecastComparisonRow[]>();
  currentRows.forEach((row) => {
    const key = forecastJoinKey(row);
    currentByKey.set(key, [...(currentByKey.get(key) ?? []), row]);
  });

  return previewRows.map((row): ForecastImportComparison => {
    const key = forecastJoinKey(row);
    const matches = currentByKey.get(key) ?? [];
    if ((previewKeyCounts.get(key) ?? 0) > 1 || matches.length > 1) return {
      status: "unavailable",
      inputValue: row.forecastAmount,
      reason: "Duplicate join key"
    };
    if (matches.length !== 1) return {
      status: "unavailable",
      inputValue: row.forecastAmount,
      reason: "No unique current value"
    };
    const currentValue = matches[0].amountExact;
    try {
      return {
        status: "available",
        currentValue,
        inputValue: row.forecastAmount,
        difference: subtractExactDecimals(row.forecastAmount, currentValue)
      };
    } catch {
      return {
        status: "unavailable",
        inputValue: row.forecastAmount,
        reason: "Invalid decimal"
      };
    }
  });
};

export type ActualImportState = "FINAL" | "MTD";
export type ActualImportChangeDescription = Readonly<{
  difference: string;
  amountChanged: boolean;
  metadataChanged: boolean;
  reason: string;
}>;

export const describeActualImportChange = (
  existingValue: string,
  newValue: string,
  existingState: ActualImportState | null,
  incomingState: ActualImportState | null
): ActualImportChangeDescription => {
  const difference = subtractExactDecimals(newValue, existingValue);
  const amountChanged = compareExactDecimals(existingValue, newValue) !== 0;
  const stateComparisonAvailable = existingState !== null && incomingState !== null;
  const metadataChanged = stateComparisonAvailable && existingState !== incomingState;
  const statusReason = metadataChanged ? `status ${existingState} → ${incomingState}` : "";
  return {
    difference,
    amountChanged,
    metadataChanged,
    reason: amountChanged && metadataChanged
      ? `Amount and ${statusReason} changed`
      : amountChanged
        ? "Amount changed"
        : metadataChanged
          ? `Status ${existingState} → ${incomingState}`
          : stateComparisonAvailable ? "No amount or status change" : "Status comparison unavailable"
  };
};
