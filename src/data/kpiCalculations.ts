import { ExcelKpiCode, FiscalYear, ParsedWorkbook, Quarter, WorkloadStage } from "./kpiExcelParser";

export type KpiStatus = "Achieved" | "Not achieved";
export type KpiUnit = "count" | "amount";

export type KpiDefinition = {
  code: ExcelKpiCode;
  name: string;
  unit: KpiUnit;
  quarterlyTargetCount?: number;
  combinedTargetGroup?: "workshops-pocs";
};

export type KpiOverviewQuarter = {
  quarter: Quarter;
  status: KpiStatus;
  actual: number;
  target: number;
  unit: KpiUnit;
  displayActual: string;
  displayTarget: string;
};

export type KpiOverviewRow = {
  code: ExcelKpiCode | "C1+C2";
  codeBadge: string;
  name: string;
  unit: KpiUnit;
  quarters: KpiOverviewQuarter[];
  fyActualDisplay: string;
  fyTargetDisplay: string;
};

export type NewWorkloadMetric = {
  stage: WorkloadStage;
  label: string;
  rate: number;
  actualK: number;
  targetK: number;
  achieved: boolean;
};

export type NewWorkloadQuarter = {
  quarter: Quarter;
  status: KpiStatus;
  metrics: NewWorkloadMetric[];
};

export type GuideSection = {
  code: ExcelKpiCode;
  name: string;
  criteria: string;
  srGuide: string;
  timeCardGuide: string;
};

export type FiscalYearDataset = {
  fiscalYear: FiscalYear;
  sourceWorkbook: string;
  definitions: KpiDefinition[];
  overviewRows: KpiOverviewRow[];
  newWorkload: NewWorkloadQuarter[];
  guides: GuideSection[];
};

export const quarters: Quarter[] = ["Q1", "Q2", "Q3", "Q4"];

export const kpiDefinitions: KpiDefinition[] = [
  { code: "A", name: "Market Awareness", unit: "count", quarterlyTargetCount: 1 },
  { code: "B", name: "Early Discovery with Customers", unit: "count", quarterlyTargetCount: 12 },
  { code: "C1", name: "Show and discover workshops", unit: "count", quarterlyTargetCount: 6, combinedTargetGroup: "workshops-pocs" },
  { code: "C2", name: "POCs", unit: "count", quarterlyTargetCount: 6, combinedTargetGroup: "workshops-pocs" },
  { code: "D1", name: "New Workload", unit: "amount" },
  { code: "F", name: "Customer References", unit: "count", quarterlyTargetCount: 1 },
  { code: "H", name: "Technical Blogs / Articles", unit: "count", quarterlyTargetCount: 1 }
];

const workloadTargets: Record<WorkloadStage, number> = {
  onboarded: 500,
  validated: 1000,
  identified: 2000
};

const stageLabels: Record<WorkloadStage, string> = {
  onboarded: "Onboarded",
  validated: "Validated",
  identified: "Identified"
};

const formatAmountK = (value: number) => {
  if (value >= 1000) {
    const millions = value / 1000;
    return `${millions.toFixed(millions >= 10 ? 1 : 2)}M`;
  }
  return `${Math.round(value)}K`;
};

const countRows = (workbook: ParsedWorkbook, code: ExcelKpiCode, quarter: Quarter) =>
  workbook.rows.filter((row) => row.kpiCode === code && row.quarter === quarter).length;

const amountFor = (workbook: ParsedWorkbook, quarter: Quarter, stage: WorkloadStage) =>
  workbook.rows
    .filter((row) => row.kpiCode === "D1" && row.quarter === quarter && row.stage === stage)
    .reduce((total, row) => total + (row.amountK ?? 0), 0);

const buildNewWorkload = (workbook: ParsedWorkbook): NewWorkloadQuarter[] =>
  quarters.map((quarter) => {
    const metrics = (Object.keys(workloadTargets) as WorkloadStage[]).map((stage) => {
      const actualK = amountFor(workbook, quarter, stage);
      const targetK = workloadTargets[stage];
      const rate = targetK === 0 ? 0 : Math.round((actualK / targetK) * 100);
      return {
        stage,
        label: stageLabels[stage],
        rate,
        actualK,
        targetK,
        achieved: actualK >= targetK
      };
    });

    return {
      quarter,
      status: metrics.some((metric) => metric.achieved) ? "Achieved" : "Not achieved",
      metrics
    };
  });

const buildCountQuarter = (workbook: ParsedWorkbook, definition: KpiDefinition, quarter: Quarter): KpiOverviewQuarter => {
  const target = definition.quarterlyTargetCount ?? 1;
  const actual = countRows(workbook, definition.code, quarter);
  const combinedActual = definition.combinedTargetGroup === "workshops-pocs"
    ? countRows(workbook, "C1", quarter) + countRows(workbook, "C2", quarter)
    : actual;

  return {
    quarter,
    status: combinedActual >= target ? "Achieved" : "Not achieved",
    actual,
    target,
    unit: "count",
    displayActual: `${actual}`,
    displayTarget: `${target}`
  };
};

const buildCombinedC1C2Quarter = (workbook: ParsedWorkbook, quarter: Quarter): KpiOverviewQuarter => {
  const actual = countRows(workbook, "C1", quarter) + countRows(workbook, "C2", quarter);
  const target = 6;
  return {
    quarter,
    status: actual >= target ? "Achieved" : "Not achieved",
    actual,
    target,
    unit: "count",
    displayActual: `${actual}`,
    displayTarget: `${target}`
  };
};

const buildD1Quarter = (newWorkload: NewWorkloadQuarter, quarter: Quarter): KpiOverviewQuarter => {
  const bestMetric = [...newWorkload.metrics].sort((left, right) => right.rate - left.rate)[0];
  return {
    quarter,
    status: newWorkload.status,
    actual: bestMetric.actualK,
    target: bestMetric.targetK,
    unit: "amount",
    displayActual: formatAmountK(bestMetric.actualK),
    displayTarget: formatAmountK(bestMetric.targetK)
  };
};

export function calculateFiscalYearDataset(workbook: ParsedWorkbook): FiscalYearDataset {
  const newWorkload = buildNewWorkload(workbook);
  const overviewDefinitions = kpiDefinitions.filter((definition) => definition.code !== "C2");
  const overviewRows = overviewDefinitions.map((definition) => {
    const quarterRows = quarters.map((quarter) => {
      if (definition.code === "D1") {
        return buildD1Quarter(newWorkload.find((item) => item.quarter === quarter)!, quarter);
      }
      if (definition.code === "C1") {
        return buildCombinedC1C2Quarter(workbook, quarter);
      }
      return buildCountQuarter(workbook, definition, quarter);
    });
    const fyActual = quarterRows.reduce((total, item) => total + item.actual, 0);
    const fyTarget = quarterRows.reduce((total, item) => total + item.target, 0);

    return {
      code: definition.code === "C1" ? "C1+C2" as const : definition.code,
      codeBadge: definition.code,
      name: definition.code === "C1" ? "Show and discover workshops" : definition.name,
      unit: definition.unit,
      quarters: quarterRows,
      fyActualDisplay: definition.unit === "amount" ? formatAmountK(fyActual) : `${fyActual}`,
      fyTargetDisplay: definition.unit === "amount" ? formatAmountK(fyTarget) : `${fyTarget}`
    };
  });

  return {
    fiscalYear: workbook.fiscalYear,
    sourceWorkbook: workbook.sourceWorkbook,
    definitions: kpiDefinitions,
    overviewRows,
    newWorkload,
    guides: buildGuides()
  };
}

export function buildGuides(): GuideSection[] {
  return kpiDefinitions.map((definition) => ({
    code: definition.code,
    name: definition.name,
    criteria:
      definition.code === "D1"
        ? "A quarter is achieved when at least one New Workload component reaches its target: Onboarded >= 500K, Validated > 1M, or Identified > 2M."
        : definition.combinedTargetGroup
          ? "Workshops and POCs share the combined target of 6 qualified activities per quarter."
          : `The KPI is achieved when the quarterly activity count reaches ${definition.quarterlyTargetCount ?? 1}.`,
    srGuide: "Create one SR record per qualifying activity or evidence item. Map the SR to the fiscal year, quarter, activity, KPI, and customer/workload evidence.",
    timeCardGuide: "Select the matching activity category, use the same fiscal quarter as the KPI evidence, and include the customer, workload, or content reference in the notes."
  }));
}

export { formatAmountK };
