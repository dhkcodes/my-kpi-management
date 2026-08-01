/*
 * @license
 * Copyright (c) 2014, 2026, Oracle and/or its affiliates.
 * Licensed under The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { h } from "preact";
import { FiscalYear, FiscalYearDataset, KpiStatus, WorkloadStage } from "../../data/kpiMockData";
import { formatAmountK } from "../../data/kpiCalculations";
import "ojs/ojbutton";

type Props = Readonly<{
  dataset: FiscalYearDataset;
  fiscalYear: FiscalYear;
  fiscalYears: FiscalYear[];
  guideOpen: boolean;
  selectedKpiId?: string;
  onFiscalYearChange: (fiscalYear: FiscalYear) => void;
  onCloseGuide: () => void;
  onOpenGuide: () => void;
}>;

const statusToneClassName = (status: KpiStatus) =>
  status === "Achieved" ? "kpi-status-badge kpi-status-badge--success" : "kpi-status-badge kpi-status-badge--danger";

const workloadRateTone = (rate: number) => {
  if (rate >= 100) return "green";
  if (rate >= 80) return "amber";
  if (rate >= 50) return "orange";
  return "red";
};

const metricToneClass = (rate: number) => `kpi-new-workload-metric__bar-fill kpi-new-workload-metric__bar-fill--${workloadRateTone(rate)}`;

const metricClass = (stage: WorkloadStage, rate: number) => `kpi-new-workload-metric kpi-new-workload-metric--${stage} kpi-new-workload-metric--${workloadRateTone(rate)}`;

const workloadStatusToneClassName = (metrics: FiscalYearDataset["newWorkload"][number]["metrics"]) => {
  const bestRate = Math.max(...metrics.map((metric) => metric.rate));
  return `kpi-status-badge kpi-status-badge--rate-${workloadRateTone(bestRate)}`;
};

const guideListSelectionClass = (code: string) =>
  code === "B" ? "kpi-guide-list-item is-selected" : "kpi-guide-list-item";

const overviewTooltip = (dataset: FiscalYearDataset, rowCode: string, quarter: string, displayActual: string, displayTarget: string) => {
  if (rowCode === "D1") {
    const workload = dataset.newWorkload.find((item) => item.quarter === quarter);
    const preferredOrder: WorkloadStage[] = ["identified", "validated", "onboarded"];
    return preferredOrder
      .map((stage) => workload?.metrics.find((metric) => metric.stage === stage))
      .filter((metric): metric is NonNullable<typeof metric> => Boolean(metric))
      .map((metric) => `${metric.label}: ${formatAmountK(metric.actualK)} / ${formatAmountK(metric.targetK)}`)
      .join("\n");
  }
  return `Achieved count / Target count: ${displayActual} / ${displayTarget}`;
};

export function Content({ dataset, fiscalYear, fiscalYears, guideOpen, selectedKpiId, onFiscalYearChange, onCloseGuide, onOpenGuide }: Props) {
  const selectedRow = selectedKpiId
    ? dataset.overviewRows.find((row) => row.code === selectedKpiId || (row.code === "C1+C2" && (selectedKpiId === "C1" || selectedKpiId === "C2")))
    : undefined;

  return (
    <main id="cockpit" role="main" class="oj-web-applayout-content kpi-content">
      <section class="kpi-fiscal-year-panel" aria-label="Fiscal year and guide actions">
        <div class="kpi-fiscal-year-panel__start">
          <span class="kpi-section-label">Fiscal Year</span>
          <div class="kpi-fiscal-year-options">
            {fiscalYears.map((year) => (
              <button
                type="button"
                class={year === fiscalYear ? "kpi-fiscal-year-option is-selected" : "kpi-fiscal-year-option"}
                aria-pressed={year === fiscalYear ? "true" : "false"}
                onClick={() => onFiscalYearChange(year)}>
                {year}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          class="kpi-guide-entry-button"
          aria-label="View criteria and SR guide"
          title="View criteria & SR guide"
          onClick={onOpenGuide}>
          <span class="oj-ux-ico-book" aria-hidden="true"></span>
          <span class="kpi-guide-entry-button__label">View criteria &amp; SR guide</span>
        </button>
      </section>

      <section id="activities" class="kpi-panel kpi-dashboard-section" aria-labelledby="kpiOverviewTitle">
        <div class="kpi-panel__header">
          <div>
            <h2 id="kpiOverviewTitle">KPI Overview</h2>
            <p class="kpi-panel__description">Quarter status is shown first; details are available on hover or keyboard focus.</p>
          </div>
          <span class="kpi-source-note">Source: {dataset.sourceWorkbook}</span>
        </div>

        <div class="kpi-overview-table-wrap">
          <table class="kpi-overview-table">
            <thead>
              <tr>
                <th>KPI</th>
                <th>Q1</th>
                <th>Q2</th>
                <th>Q3</th>
                <th>Q4</th>
              </tr>
            </thead>
            <tbody>
              {dataset.overviewRows.map((row) => (
                <tr id={`activity-${row.code.toLowerCase().replace("+", "-")}`} class={selectedRow?.code === row.code ? "is-selected" : undefined}>
                  <td>
                    <div class="kpi-name-cell">
                      <span class={row.code === "D1" ? "kpi-code-badge kpi-code-badge--priority" : "kpi-code-badge"}>{row.codeBadge}</span>
                      <span>{row.name}</span>
                    </div>
                  </td>
                  {row.quarters.map((quarter) => {
                    const tooltip = overviewTooltip(dataset, row.code, quarter.quarter, quarter.displayActual, quarter.displayTarget);
                    return (
                      <td>
                        <span class="kpi-tooltip-trigger" tabIndex={0} aria-label={tooltip.replace(/\n/g, "; ")}>
                          <span class={statusToneClassName(quarter.status)}>
                            <span>{quarter.status}</span>
                          </span>
                          <span class="kpi-tooltip" role="tooltip">{tooltip}</span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p class="kpi-helper-note">Workshops and POCs are consolidated in one overview row with the combined target of 6 qualified activities.</p>
      </section>

      {selectedRow && (
        <section class="kpi-panel kpi-selected-summary" aria-labelledby="selectedKpiTitle">
          <div class="kpi-panel__header">
            <div>
              <span class="kpi-eyebrow">Selected KPI</span>
              <h3 id="selectedKpiTitle">{selectedRow.name}</h3>
            </div>
            <span class={selectedRow.code === "D1" ? "kpi-code-badge kpi-code-badge--priority" : "kpi-code-badge"}>{selectedRow.codeBadge}</span>
          </div>
          <p class="kpi-panel__description">Left navigation selection highlights the matching KPI row only; the existing left navigation item structure remains unchanged.</p>
        </section>
      )}

      <section id="pipeline" class="kpi-panel kpi-dashboard-section kpi-new-workload-section" aria-labelledby="newWorkloadTitle">
        <div class="kpi-panel__header">
          <div>
            <h2 id="newWorkloadTitle">New Workload</h2>
            <p class="kpi-panel__description">Quarterly Onboarded / Validated / Identified achievement rate, actual amount, and target amount.</p>
          </div>
        </div>
        <div class="kpi-new-workload-grid">
          {dataset.newWorkload.map((quarter) => (
            <article class="kpi-new-workload-card">
              <div class="kpi-new-workload-card__header">
                <strong>{quarter.quarter}</strong>
                <span class={workloadStatusToneClassName(quarter.metrics)}>
                  <span>{quarter.status}</span>
                </span>
              </div>
              {quarter.metrics.map((metric) => (
                <div class={metricClass(metric.stage, metric.rate)}>
                  <div class="kpi-new-workload-metric__row">
                    <span>{metric.label}</span>
                    <strong>{metric.rate}%</strong>
                  </div>
                  <div class="kpi-new-workload-metric__amounts">
                    <span>{formatAmountK(metric.actualK)}</span>
                    <span>/ {formatAmountK(metric.targetK)}</span>
                  </div>
                  <div class="kpi-new-workload-metric__bar" aria-hidden="true">
                    <span class={metricToneClass(metric.rate)} style={`width: ${Math.min(100, metric.rate)}%`}></span>
                  </div>
                </div>
              ))}
            </article>
          ))}
        </div>
      </section>

      {guideOpen && (
        <div class="kpi-guide-overlay" role="presentation">
          <section class="kpi-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="criteriaGuideTitle">
            <div class="kpi-guide-dialog__header">
              <div>
                <h2 id="criteriaGuideTitle">View criteria &amp; SR guide</h2>
                <p class="kpi-panel__description">Select a KPI on the left, then review criteria, SR creation, or time card entry guidance.</p>
              </div>
              <oj-button chroming="borderless" display="icons" aria-label="Close criteria guide" onojAction={onCloseGuide}>
                <span slot="startIcon" class="oj-ux-ico-close"></span>
                Close
              </oj-button>
            </div>

            <div class="kpi-guide-layout">
              <aside class="kpi-guide-list" aria-label="KPI guide list">
                {dataset.guides.map((guide) => (
                  <button type="button" class={guideListSelectionClass(guide.code)} aria-current={guide.code === "B" ? "true" : undefined}>
                    <span class={guide.code === "D1" ? "kpi-code-badge kpi-code-badge--priority" : "kpi-code-badge"}>{guide.code}</span>
                    <span>{guide.name}</span>
                  </button>
                ))}
              </aside>

              <div class="kpi-guide-main">
                <div class="kpi-guide-tabs" role="tablist" aria-label="Guide sections">
                  <button type="button" class="kpi-guide-tab is-selected">Criteria</button>
                  <button type="button" class="kpi-guide-tab">SR Creation Guide</button>
                  <button type="button" class="kpi-guide-tab">Time Card Entry Guide</button>
                </div>

                <div class="kpi-guide-criteria-panel">
                  <h3>Criteria</h3>
                  <table class="kpi-guide-criteria-table" aria-label="Selected KPI criteria table">
                    <tbody>
                      <tr>
                        <th>KPI</th>
                        <td><span class="kpi-code-badge">B</span> Early Discovery with Customers</td>
                      </tr>
                      <tr>
                        <th>Quarterly target</th>
                        <td>12 qualified discovery activities per quarter</td>
                      </tr>
                      <tr>
                        <th>Evidence</th>
                        <td>Customer workload, SR number, SR description, and delivery date from the Excel workbook</td>
                      </tr>
                      <tr>
                        <th>Achievement logic</th>
                        <td>Achieved when the quarter reaches or exceeds the target count. Otherwise Not achieved.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div class="kpi-guide-card-row">
                  <article class="kpi-guide-info-card">
                    <h3>SR Creation Guide</h3>
                    <p>Create one SR record per qualifying activity or evidence item. Map the SR to fiscal year, quarter, activity, KPI, and customer/workload evidence.</p>
                  </article>
                  <article class="kpi-guide-info-card">
                    <h3>Time Card Entry Guide</h3>
                    <p>Select the matching activity category, use the same fiscal quarter as the KPI evidence, and include the customer, workload, or content reference in the notes.</p>
                  </article>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
