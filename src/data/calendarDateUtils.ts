export type FiscalYearRange = Readonly<{ fromDate: string; toDate: string }>;
export type CalendarDayKind = "weekday" | "saturday" | "sunday" | "holiday";
export type MonthCell = Readonly<{ date: string; day: number; inMonth: boolean }>;

const isoDate = (date: Date): string => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;

/** Oracle fiscal years run June 1 through May 31 and are named for the ending year. */
export function getFiscalYearForDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : value;
  const endingYear = date.getUTCMonth() >= 5 ? date.getUTCFullYear() + 1 : date.getUTCFullYear();
  return `FY${String(endingYear).slice(-2)}`;
}

export function getFiscalYearRange(fiscalYear: string): FiscalYearRange {
  const match = /^FY(\d{2})$/.exec(fiscalYear);
  if (!match) throw new Error("Fiscal year must use the FYxx format.");
  const endYear = 2000 + Number(match[1]);
  return { fromDate: `${endYear - 1}-06-01`, toDate: `${endYear}-05-31` };
}

export function getMonthCells(year: number, zeroBasedMonth: number): MonthCell[] {
  const first = new Date(Date.UTC(year, zeroBasedMonth, 1));
  const gridStart = new Date(first);
  gridStart.setUTCDate(1 - first.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + index);
    return { date: isoDate(date), day: date.getUTCDate(), inMonth: date.getUTCMonth() === zeroBasedMonth };
  });
}

export function getDayKind(dateValue: string, holidays: ReadonlyMap<string, string>): CalendarDayKind {
  if (holidays.has(dateValue)) return "holiday";
  const day = new Date(`${dateValue}T00:00:00Z`).getUTCDay();
  return day === 0 ? "sunday" : day === 6 ? "saturday" : "weekday";
}
