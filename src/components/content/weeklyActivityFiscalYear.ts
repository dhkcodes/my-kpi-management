import { FiscalYear } from "../../data/kpiMockData";

export type WeeklyActivityFiscalYearRange = Readonly<{ fromDate: string; toDate: string }>;

const fiscalYearNumber = (fiscalYear: FiscalYear): number => {
  const suffix = Number.parseInt(fiscalYear.slice(2), 10);
  if (!Number.isInteger(suffix)) throw new Error(`Invalid fiscal year: ${fiscalYear}`);
  return 2000 + suffix;
};

export const getWeeklyActivityFiscalYearRange = (fiscalYear: FiscalYear): WeeklyActivityFiscalYearRange => {
  const endYear = fiscalYearNumber(fiscalYear);
  return { fromDate: `${endYear - 1}-06-01`, toDate: `${endYear}-05-31` };
};

export const getFiscalYearForWeekDate = (weekOfDate: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekOfDate);
  if (!match) throw new Error(`Invalid week date: ${weekOfDate}`);
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const fiscalEndYear = month >= 6 ? year + 1 : year;
  return `FY${String(fiscalEndYear % 100).padStart(2, "0")}`;
};