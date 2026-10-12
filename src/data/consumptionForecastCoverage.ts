const fiscalMonthOrder = ["JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC", "JAN", "FEB", "MAR", "APR", "MAY"] as const;

const monthLabel = (month: string) => `${month.charAt(0)}${month.slice(1).toLowerCase()}`;

export const formatForecastCoverage = (periods: readonly string[]) => {
  const months = Array.from(new Set(periods
    .map((period) => period.split("-").pop()?.toUpperCase() ?? "")
    .filter((month) => fiscalMonthOrder.includes(month as typeof fiscalMonthOrder[number]))))
    .sort((left, right) => fiscalMonthOrder.indexOf(left as typeof fiscalMonthOrder[number])
      - fiscalMonthOrder.indexOf(right as typeof fiscalMonthOrder[number]));

  if (months.length === 0) return "No forecast entered";
  if (months.length === fiscalMonthOrder.length) return "Complete · Jun–May";

  const indices = months.map((month) => fiscalMonthOrder.indexOf(month as typeof fiscalMonthOrder[number]));
  const contiguous = indices.every((index, position) => position === 0 || index === indices[position - 1] + 1);
  const coverage = contiguous && months.length > 1
    ? `${monthLabel(months[0])}–${monthLabel(months[months.length - 1])}`
    : months.map(monthLabel).join(", ");

  return `Partial · ${coverage}`;
};
