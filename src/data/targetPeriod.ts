import { FiscalYear, Quarter } from "./kpiExcelParser";

type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
export type TargetFiscalYear = `FY${Digit}${Digit}`;
export type TargetPeriod = `${TargetFiscalYear} ${Quarter}`;

export const isTargetFiscalYear = (value: string): value is TargetFiscalYear => /^FY\d{2}$/.test(value);

const fiscalYearNumber = (fiscalYear: FiscalYear): number => Number(fiscalYear.slice(2));
const toTargetFiscalYear = (year: number): TargetFiscalYear => {
  const value = `FY${String(year).padStart(2, "0")}`;
  if (!isTargetFiscalYear(value)) throw new Error(`Invalid target fiscal year: ${value}`);
  return value;
};

export const getTargetPeriodOptions = (fiscalYear: FiscalYear): TargetPeriod[] => {
  const current = fiscalYearNumber(fiscalYear);
  return [current - 1, current, current + 1].flatMap((year) =>
    (["Q1", "Q2", "Q3", "Q4"] as const).map((quarter): TargetPeriod => `${toTargetFiscalYear(year)} ${quarter}`)
  );
};

export const splitTargetPeriod = (value: string): { fiscalYear: TargetFiscalYear; quarter: Quarter } | null => {
  const match = /^(FY\d{2}) (Q[1-4])$/.exec(value);
  if (!match || !isTargetFiscalYear(match[1])) return null;
  return { fiscalYear: match[1], quarter: match[2] as Quarter };
};

export const joinTargetPeriod = (fiscalYear: TargetFiscalYear | "" | undefined, quarter: Quarter | ""): TargetPeriod | "" =>
  fiscalYear && quarter ? `${fiscalYear} ${quarter}` : "";
