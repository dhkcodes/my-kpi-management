import type { ForecastActualMonth, ForecastActualRow } from "./consumptionApi";
import { compareExactDecimals, subtractExactDecimals } from "./exactDecimal";

export type ForecastActualProblemFilter = "FINAL_SHORTFALL" | "MTD_SHORTFALL";
export type ForecastActualAssessmentKind = "NORMAL" | "FINAL_SHORTFALL" | "MTD_SHORTFALL" | "UNCONFIRMED" | "UNAVAILABLE";

export type ForecastActualMonthAssessment = Readonly<{
  kind: ForecastActualAssessmentKind;
  label: "정상" | "미달" | "미달 예상" | "미확정" | "비교 불가";
  differenceAmount: string | null;
  differenceLabel: "Difference" | "월말 예상 Difference" | "비교 불가";
  tooltip: string;
}>;

const compareToZero = (value: string): number => compareExactDecimals(value, "0");

export const assessForecastActualMonth = (month: ForecastActualMonth): ForecastActualMonthAssessment => {
  if (month.forecastAmount === null) {
    return {
      kind: "UNAVAILABLE", label: "비교 불가", differenceAmount: null, differenceLabel: "비교 불가",
      tooltip: "Forecast 미입력으로 비교할 수 없습니다."
    };
  }

  if (month.actualState === "FINAL") {
    if (month.actualAmount === null) {
      return {
        kind: "UNCONFIRMED", label: "미확정", differenceAmount: null, differenceLabel: "비교 불가",
        tooltip: "확정 Actual이 아직 없습니다. 미래 월은 미달로 판정하지 않습니다."
      };
    }
    // Recompute from the two values rendered in this exact month. Never trust a cross-period or summary delta.
    const differenceAmount = subtractExactDecimals(month.actualAmount, month.forecastAmount);
    const shortfall = compareToZero(differenceAmount) < 0;
    return {
      kind: shortfall ? "FINAL_SHORTFALL" : "NORMAL",
      label: shortfall ? "미달" : "정상",
      differenceAmount,
      differenceLabel: "Difference",
      tooltip: `확정 월: Actual − Forecast = ${differenceAmount}`
    };
  }

  if (month.actualState === "MTD") {
    if (month.actualAmount === null || month.monthEndProjection === null) {
      return {
        kind: "UNAVAILABLE", label: "비교 불가", differenceAmount: null, differenceLabel: "비교 불가",
        tooltip: "MTD 누적액은 있으나 실제 데이터 기준일이 확인되지 않아 월말 예상액과 예상 Difference를 계산하지 않습니다. import 시각은 기준일로 사용하지 않습니다."
      };
    }
    const differenceAmount = subtractExactDecimals(month.monthEndProjection, month.forecastAmount);
    const shortfall = compareToZero(differenceAmount) < 0;
    return {
      kind: shortfall ? "MTD_SHORTFALL" : "NORMAL",
      label: shortfall ? "미달 예상" : "정상",
      differenceAmount,
      differenceLabel: "월말 예상 Difference",
      tooltip: `MTD 월말 예상액 − 월 Forecast = ${differenceAmount}`
    };
  }

  return {
    kind: "UNCONFIRMED", label: "미확정", differenceAmount: null, differenceLabel: "비교 불가",
    tooltip: "Actual이 아직 확정되지 않았습니다. 미래 월은 미달로 판정하지 않습니다."
  };
};

const rowMatchesProblem = (
  row: ForecastActualRow,
  filter: ForecastActualProblemFilter,
  periodKeys?: ReadonlySet<string>
): boolean => row.months.some((month) =>
  (!periodKeys || periodKeys.has(month.periodKey)) && assessForecastActualMonth(month).kind === filter);

export const countForecastActualProblemAccounts = (
  rows: readonly ForecastActualRow[],
  periods?: readonly string[]
) => {
  const periodKeys = periods ? new Set(periods) : undefined;
  const finalShortfallAccounts = new Set<string>();
  const mtdShortfallAccounts = new Set<string>();
  rows.forEach((row) => {
    if (rowMatchesProblem(row, "FINAL_SHORTFALL", periodKeys)) finalShortfallAccounts.add(row.account);
    if (rowMatchesProblem(row, "MTD_SHORTFALL", periodKeys)) mtdShortfallAccounts.add(row.account);
  });
  return {
    finalShortfall: finalShortfallAccounts.size,
    mtdShortfall: mtdShortfallAccounts.size
  } as const;
};

export const filterForecastActualProblemRows = (
  rows: readonly ForecastActualRow[],
  filter: ForecastActualProblemFilter | null,
  periods?: readonly string[]
): ForecastActualRow[] => {
  if (!filter) return [...rows];
  const periodKeys = periods ? new Set(periods) : undefined;
  return rows.filter((row) => rowMatchesProblem(row, filter, periodKeys));
};

export const countDistinctForecastActualAccounts = (rows: readonly ForecastActualRow[]): number =>
  new Set(rows.map((row) => row.account)).size;
