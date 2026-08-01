export type FiscalYear = "FY26" | "FY27" | "FY28";
export type Quarter = "Q1" | "Q2" | "Q3" | "Q4";
export type WorkloadStage = "onboarded" | "validated" | "identified";

export type ExcelKpiCode = "A" | "B" | "C1" | "C2" | "D1" | "F" | "H";

export type ParsedKpiActivityRow = {
  id: string;
  fiscalYear: FiscalYear;
  quarter: Quarter;
  kpiCode: ExcelKpiCode;
  kpiName: string;
  description: string;
  workload?: string;
  srNumber?: string;
  deliveryDate?: string;
  stage?: WorkloadStage;
  amountK?: number;
};

export type ParsedWorkbook = {
  fiscalYear: FiscalYear;
  sourceWorkbook: string;
  rows: ParsedKpiActivityRow[];
};

export type WorkbookSeed = {
  fiscalYear: FiscalYear;
  sourceWorkbook: string;
  rows: ParsedKpiActivityRow[];
};

/**
 * Adapter seam for the current Excel-backed mock source.
 *
 * The Slack attachment is represented as normalized workbook seed rows for now.
 * When database integration is added, the UI and KPI calculation layers should keep
 * consuming ParsedWorkbook instead of coupling to Excel parsing details.
 */
export function parseWorkbookSeed(seed: WorkbookSeed): ParsedWorkbook {
  return {
    fiscalYear: seed.fiscalYear,
    sourceWorkbook: seed.sourceWorkbook,
    rows: seed.rows.map((row) => ({ ...row }))
  };
}
