/*
 * @license
 * Copyright (c) 2014, 2026, Oracle and/or its affiliates.
 * Licensed under The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { FiscalYear, FiscalYearDataset, GuideSection, KpiStatus, WorkloadStage } from "../../data/kpiMockData";
import { formatAmountK } from "../../data/kpiCalculations";
import { isKpiActivitiesRoute, NavigationRouteDefinition } from "../navigationRoutes";
import { AccountsWorkloadsPage } from "./AccountsWorkloadsPage";
import { AccountsWorkloadsPulseV2 } from "./AccountsWorkloadsPulseV2";
import { MyCustomers360Page } from "./MyCustomers360Page";
import { WeeklyActivitiesPage } from "./WeeklyActivitiesPage";
import { AccountWorkloadMetadata, AccountWorkloadRow } from "../../data/accountsWorkloadsMockData";
import { AccountsWorkloadsDataSource } from "../../data/accountsWorkloadsDataSource";
import { AccountsWorkloadsBatchSaveResponse, AccountsWorkloadsListQuery } from "../../data/accountsWorkloadsApi";
import { FxRateRecord, KpiGuideRecord } from "../../data/kpiConfigurationApi";
import { KpiNavigationGuard, KpiSpreadsheetPage } from "./KpiSpreadsheetPage";
import { ConsumptionPage } from "./ConsumptionPage";
import "ojs/ojbutton";
import "ojs/ojprogress-circle";

type Props = Readonly<{
  activeRoute: NavigationRouteDefinition;
  accountsWorkloadsRows: AccountWorkloadRow[];
  accountsWorkloadsAsOf: string;
  accountsWorkloadsDataSource: AccountsWorkloadsDataSource;
  accountsWorkloadsLoadError: string;
  accountsWorkloadsQuery: Omit<AccountsWorkloadsListQuery, "fiscalYear">;
  accountsWorkloadsDraftActive: boolean;
  weeklyActivitiesDraftActive: boolean;
  kpiWriteActive: boolean;
  accountsWorkloadsDatasetAvailable: boolean;
  accountsWorkloadsLoading: boolean;
  accountsWorkloadsRefreshing: boolean;
  accountWorkloadMetadata: AccountWorkloadMetadata;
  onAccountsWorkloadsRefresh: () => void;
  dataset: FiscalYearDataset;
  kpiDataset: FiscalYearDataset | null;
  kpiDatasetLoading: boolean;
  kpiDatasetError: string;
  fiscalYear: FiscalYear;
  fiscalYears: FiscalYear[];
  guideOpen: boolean;
  guideDataFiscalYear: FiscalYear | null;
  guideRecords: KpiGuideRecord[];
  guideLoading: boolean;
  guideSaving: boolean;
  guideError: string;
  fxRate: FxRateRecord | null;
  fxLoading: boolean;
  fxError: string;
  onFiscalYearChange: (fiscalYear: FiscalYear) => void;
  onNavigate: (routeId: string) => void;
  onCloseGuide: () => void;
  onOpenGuide: () => void;
  onSaveGuide: (draft: KpiGuideRecord) => Promise<KpiGuideRecord>;
  onAccountsWorkloadsRowsChange: (rows: AccountWorkloadRow[], permanentDeleteIds: string[], fxRate?: FxRateRecord) => Promise<AccountsWorkloadsBatchSaveResponse>;
  onAccountsWorkloadsQueryChange: (query: Omit<AccountsWorkloadsListQuery, "fiscalYear">) => void;
  onAccountsWorkloadsDraftStateChange: (active: boolean) => void;
  onWeeklyActivitiesDraftStateChange: (active: boolean) => void;
  onKpiNavigationGuardChange: (guard: KpiNavigationGuard | null, hasUnsavedChanges: boolean) => void;
  onKpiWriteStateChange: (active: boolean) => void;
}>;

type GuideDetails = Readonly<{
  srType: string;
  businessSrType: string;
  combinedSrType?: string;
  targetPerQuarter: string;
  activity: string;
  taskType: string;
  measuring: string;
  details: string;
  notes: string;
}>;

const guideDetailsByCode: Partial<Record<GuideSection["code"], GuideDetails>> = {
  A: {
    srType: "Independent SR",
    businessSrType: "Business Planning & Development",
    targetPerQuarter: "1 session / Quarter",
    activity: "Customer Workshop or Cloud Day",
    taskType: "Delivery",
    measuring: "# of Sessions",
    details: "A measures delivered market-awareness sessions such as customer workshops or Cloud Days.",
    notes: ""
  },
  B: {
    srType: "Account Level SR",
    businessSrType: "Account Development",
    targetPerQuarter: "12 / Quarter",
    activity: "Discovery",
    taskType: "Delivery",
    measuring: "# of Sessions",
    details: "B captures early customer discovery sessions that identify needs, clarify workloads, and create qualified account-development evidence.",
    notes: ""
  },
  C1: {
    srType: "Account Level SR",
    businessSrType: "Account Development",
    targetPerQuarter: "C1 + C2 combined target >= 6 activities",
    activity: "Customer Workshop or Cloud Day",
    taskType: "Delivery",
    measuring: "# of Workshops",
    details: "C1 measures customer-facing workshops that explain solutions, discover requirements, and produce workshop completion evidence.",
    notes: ""
  },
  C2: {
    srType: "Account Level SR",
    businessSrType: "Account Development",
    targetPerQuarter: "C1 + C2 combined target >= 6 activities",
    activity: "Proof of Concept",
    taskType: "Delivery",
    measuring: "# of POCs",
    details: "C2 measures proof-of-concept work completed in customer tenancy to validate technical feasibility and customer fit.",
    notes: ""
  },
  D1: {
    srType: "Opportunity Level SR",
    businessSrType: "Opportunity Pursuit",
    targetPerQuarter: "Onboarded $500K / Quarter (WON); Validated $1M / Quarter (40%~50%); Identified $2M / Quarter (30%)",
    activity: "Onboarded = Solution Deployment; Validated = Solution Proposal; Identified = Solution Design",
    taskType: "Delivery",
    measuring: "$ ACR WON\nOR $ ACR 40–50%\nOR $ ACR 30% with Sol Demo + functional fit",
    details: "D1 measures new workload progress across identified, validated, and onboarded stages so pipeline creation and conversion are visible by quarter.",
    notes: ""
  },
  F: {
    srType: "Account Level SR",
    businessSrType: "Account Development",
    targetPerQuarter: "1 / Quarter",
    activity: "Customer questionnaire",
    taskType: "Delivery",
    measuring: "# Internal win story / published case study",
    details: "F measures customer-reference evidence such as internal win stories or published case studies that can be reused for account development.",
    notes: ""
  },
  H: {
    srType: "Non-SR activity managed by CEs in the time entry system",
    businessSrType: "Non-SR activity managed by CEs in the time entry system",
    combinedSrType: "This is non SR activity to be managed by CEs in time entry system",
    targetPerQuarter: "1 / Quarter",
    activity: "Content Creation",
    taskType: "Delivery",
    measuring: "# of content created",
    details: "H measures technical content creation managed outside SR activity, ensuring CE knowledge assets are captured through time entry evidence.",
    notes: ""
  }
};

const defaultGuideDetails = (guide: GuideSection): GuideDetails => ({
  srType: "SR evidence item",
  businessSrType: "KPI activity evidence",
  targetPerQuarter: guide.criteria,
  activity: guide.name,
  taskType: "KPI task",
  measuring: "KPI achievement evidence",
  details: guide.criteria,
  notes: ""
});

const getGuideDetails = (guide: GuideSection): GuideDetails => guideDetailsByCode[guide.code] ?? defaultGuideDetails(guide);

const recordToGuideDetails = (record: KpiGuideRecord): GuideDetails => ({
  srType: record.srType,
  businessSrType: record.businessSrType,
  combinedSrType: record.combinedSrType ?? undefined,
  targetPerQuarter: record.targetPerQuarter,
  activity: record.activity,
  taskType: record.taskType,
  measuring: record.measuring,
  details: record.details,
  notes: record.notes
});

type GuideDetailsField = keyof GuideDetails;

const statusToneClassName = (status: KpiStatus) =>
  status === "Achieved" ? "kpi-status-badge kpi-status-badge--success" : "kpi-status-badge kpi-status-badge--danger";

const workloadRateTone = (rate: number) => {
  if (rate >= 100) return "green";
  if (rate >= 91) return "light-green";
  if (rate >= 61) return "blue";
  if (rate >= 31) return "yellow";
  return "red";
};

const metricToneClass = (rate: number) => `kpi-new-workload-metric__bar-fill kpi-new-workload-metric__bar-fill--${workloadRateTone(rate)}`;

const metricClass = (stage: WorkloadStage, rate: number) => `kpi-new-workload-metric kpi-new-workload-metric--${stage} kpi-new-workload-metric--${workloadRateTone(rate)}`;

const workloadStatusToneClassName = (metrics: FiscalYearDataset["newWorkload"][number]["metrics"]) => {
  const bestRate = Math.max(...metrics.map((metric) => metric.rate));
  return `kpi-status-badge kpi-status-badge--rate-${workloadRateTone(bestRate)}`;
};

const guideListSelectionClass = (code: string, selectedCode: string) =>
  code === selectedCode ? "kpi-guide-list-item is-selected" : "kpi-guide-list-item";

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

const isHomeRoute = (route: NavigationRouteDefinition) => route.module === "home";

function EmptyRoutePage({ route }: Readonly<{ route: NavigationRouteDefinition }>) {
  return (
    <section id="routePage" class="kpi-panel kpi-route-page" aria-labelledby="routePageTitle" data-route-id={route.id}>
      <span class="kpi-eyebrow">Page</span>
      <h2 id="routePageTitle">{route.pageTitle}</h2>
    </section>
  );
}

function ReadOnlyDetails({ details }: Readonly<{ details: GuideDetails }>) {
  return (
    <>
      <table class="kpi-guide-criteria-table" aria-label="Selected KPI details table">
        <tbody>
          {details.combinedSrType ? (
            <tr><th>SR / Business SR Type</th><td>{details.combinedSrType}</td></tr>
          ) : (
            <>
              <tr><th>SR Type</th><td>{details.srType}</td></tr>
              <tr><th>Business SR Type</th><td>{details.businessSrType}</td></tr>
            </>
          )}
          <tr><th>Target</th><td>{details.targetPerQuarter}</td></tr>
          <tr><th>Activity</th><td>{details.activity}</td></tr>
          <tr><th>Task Type</th><td>{details.taskType}</td></tr>
          <tr><th>What are we measuring?</th><td>{details.measuring}</td></tr>

        </tbody>
      </table>
      <section class="kpi-guide-notes-readonly" aria-label="KPI notes">
        <h3>Notes</h3>
        <p>{details.notes}</p>
      </section>
    </>
  );
}

function EditableDetails({ details, onChange }: Readonly<{
  details: GuideDetails;
  onChange: (field: GuideDetailsField, value: string) => void;
}>) {
  const handleInput = (field: GuideDetailsField) => (event: Event) => {
    onChange(field, (event.currentTarget as HTMLInputElement | HTMLTextAreaElement).value);
  };

  return (
    <div class="kpi-guide-edit-grid" aria-label="Editable KPI details">
      {details.combinedSrType ? (
        <label class="kpi-guide-edit-grid__wide">SR / Business SR Type<input value={details.combinedSrType} onInput={handleInput("combinedSrType")} /></label>
      ) : (
        <>
          <label>SR Type<input value={details.srType} onInput={handleInput("srType")} /></label>
          <label>Business SR Type<input value={details.businessSrType} onInput={handleInput("businessSrType")} /></label>
        </>
      )}
      <label>Target<input readOnly aria-readonly="true" value={details.targetPerQuarter} title="Authoritative KPI target managed by Backend policy" /></label>
      <label>Activity<input value={details.activity} onInput={handleInput("activity")} /></label>
      <label>Task Type<input value={details.taskType} onInput={handleInput("taskType")} /></label>
      <label>What are we measuring?<input value={details.measuring} onInput={handleInput("measuring")} /></label>
      <label class="kpi-guide-edit-grid__wide">KPI description<textarea value={details.details} onInput={handleInput("details")}></textarea></label>
      <label class="kpi-guide-edit-grid__wide">Notes<textarea value={details.notes} onInput={handleInput("notes")}></textarea></label>
    </div>
  );
}

export function Content({
  activeRoute,
  accountWorkloadMetadata,
  accountsWorkloadsRows,
  accountsWorkloadsAsOf,
  accountsWorkloadsDataSource,
  accountsWorkloadsLoadError,
  accountsWorkloadsQuery,
  accountsWorkloadsDraftActive,
  weeklyActivitiesDraftActive,
  kpiWriteActive,
  accountsWorkloadsDatasetAvailable,
  accountsWorkloadsLoading,
  accountsWorkloadsRefreshing,
  onAccountsWorkloadsRefresh,
  dataset,
  kpiDataset,
  kpiDatasetLoading,
  kpiDatasetError,
  fiscalYear,
  fiscalYears,
  guideOpen,
  guideDataFiscalYear,
  guideRecords,
  guideLoading,
  guideSaving,
  guideError,
  fxRate,
  fxLoading,
  fxError,
  onFiscalYearChange,
  onNavigate,
  onCloseGuide,
  onOpenGuide,
  onSaveGuide,

  onAccountsWorkloadsRowsChange,
  onAccountsWorkloadsQueryChange,
  onAccountsWorkloadsDraftStateChange,
  onWeeklyActivitiesDraftStateChange,
  onKpiNavigationGuardChange,
  onKpiWriteStateChange
}: Props) {
  const showHome = isHomeRoute(activeRoute);
  const guideItems = dataset.guides;
  const [savedGuideDetails, setSavedGuideDetails] = useState<Record<string, GuideDetails>>(() =>
    Object.fromEntries(dataset.guides.map((guide) => [guide.code, getGuideDetails(guide)])) as Record<string, GuideDetails>
  );
  const [draftGuideDetails, setDraftGuideDetails] = useState<Record<string, GuideDetails>>(() => ({ ...savedGuideDetails }));
  const [selectedGuideCode, setSelectedGuideCode] = useState<GuideSection["code"]>("A");
  const [guideEditMode, setGuideEditMode] = useState(false);
  const [guideSaveError, setGuideSaveError] = useState("");
  const selectedGuide = guideItems.find((guide) => guide.code === selectedGuideCode) ?? guideItems[0];
  const selectedGuideDetails = guideEditMode
    ? draftGuideDetails[selectedGuide.code]
    : savedGuideDetails[selectedGuide.code];
  const updateDraftGuideDetails = (field: GuideDetailsField, value: string) => {
    setDraftGuideDetails((current) => ({
      ...current,
      [selectedGuide.code]: {
        ...current[selectedGuide.code],
        [field]: value
      }
    }));
  };
  const startGuideEdit = () => {
    setDraftGuideDetails((current) => ({
      ...current,
      [selectedGuide.code]: { ...savedGuideDetails[selectedGuide.code] }
    }));
    setGuideEditMode(true);
  };
  useEffect(() => {
    if (guideRecords.length === 0) {
      const authoritative = Object.fromEntries(
        guideItems.map((guide) => [guide.code, getGuideDetails(guide)])
      ) as Record<string, GuideDetails>;
      setSavedGuideDetails(authoritative);
      setDraftGuideDetails(authoritative);
      setSelectedGuideCode("A");
      setGuideEditMode(false);
      setGuideSaveError("");
      return;
    }
    const authoritative = Object.fromEntries(
      guideItems.map((guide) => {
        const record = guideRecords.find((item) => item.kpiCode === guide.code);
        return [guide.code, record ? recordToGuideDetails(record) : getGuideDetails(guide)];
      })
    ) as Record<string, GuideDetails>;
    setSavedGuideDetails(authoritative);
    setDraftGuideDetails(authoritative);
    setGuideEditMode(false);
  }, [guideRecords, fiscalYear]);
  const saveGuideEdit = async () => {
    const record = guideRecords.find((item) => item.kpiCode === selectedGuide.code);
    if (!record) {
      setGuideSaveError("The selected KPI Guide record is not available from the database.");
      return;
    }
    setGuideSaveError("");
    try {
      const details = draftGuideDetails[selectedGuide.code];
      const authoritative = await onSaveGuide({
        ...record,
        ...details,
        combinedSrType: details.combinedSrType ?? null
      });
      const saved = recordToGuideDetails(authoritative);
      setSavedGuideDetails((current) => ({ ...current, [selectedGuide.code]: saved }));
      setDraftGuideDetails((current) => ({ ...current, [selectedGuide.code]: saved }));
      setGuideEditMode(false);
    } catch (error) {
      setGuideSaveError(error instanceof Error ? error.message : "KPI Guide could not be saved.");
    }
  };
  const cancelGuideEdit = () => {
    setDraftGuideDetails((current) => ({
      ...current,
      [selectedGuide.code]: { ...savedGuideDetails[selectedGuide.code] }
    }));
    setGuideEditMode(false);
  };
  const selectGuide = (code: GuideSection["code"]) => {
    setGuideEditMode(false);
    setSelectedGuideCode(code);
  };

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
                disabled={(activeRoute.module === "accountsWorkloads" && accountsWorkloadsDraftActive && year !== fiscalYear)
                  || (activeRoute.module === "weeklyActivities" && weeklyActivitiesDraftActive && year !== fiscalYear)
                  || (activeRoute.module === "kpiPage" && kpiWriteActive && year !== fiscalYear)
                  || (guideSaving && year !== fiscalYear)}
                title={activeRoute.module === "accountsWorkloads" && accountsWorkloadsDraftActive && year !== fiscalYear
                  ? "Save or cancel table changes before changing fiscal year."
                  : activeRoute.module === "weeklyActivities" && weeklyActivitiesDraftActive && year !== fiscalYear
                    ? "Save or cancel Weekly Activity changes before changing fiscal year."
                    : activeRoute.module === "kpiPage" && kpiWriteActive && year !== fiscalYear
                      ? "Wait for the KPI activity save to finish before changing fiscal year."
                      : guideSaving && year !== fiscalYear
                      ? "Wait for the KPI Guide save to finish before changing fiscal year."
                      : undefined}
                onClick={() => onFiscalYearChange(year)}>
                {year}
              </button>
            ))}
          </div>
        </div>
        {isKpiActivitiesRoute(activeRoute) && <button
          type="button"
          class="kpi-guide-entry-button"
          aria-label="Open KPI Guide"
          title="KPI Guide"
          onClick={onOpenGuide}>
          <span class="oj-ux-ico-book" aria-hidden="true"></span>
          <span class="kpi-guide-entry-button__label">KPI Guide</span>
        </button>}
      </section>

      {activeRoute.module !== "weeklyActivities" && accountsWorkloadsLoadError && (
        <div class="accounts-workloads-source-status accounts-workloads-source-status--error" role="alert">
          <strong>Accounts &amp; Workloads API error.</strong> {accountsWorkloadsLoadError}
        </div>
      )}
      {activeRoute.module !== "weeklyActivities" && !accountsWorkloadsLoadError && !accountsWorkloadsLoading && accountsWorkloadsDataSource !== "api" && (
        <div class="accounts-workloads-source-status accounts-workloads-source-status--fallback" role="status">
          <strong>Development fallback data.</strong> The Accounts &amp; Workloads API is unavailable; changes are local only.
        </div>
      )}

      {showHome ? (
        <>
          <AccountsWorkloadsPulseV2
            fiscalYear={fiscalYear}
            rows={accountsWorkloadsRows}
            asOf={accountsWorkloadsAsOf}
            dataAvailable={accountsWorkloadsDatasetAvailable}
            loading={accountsWorkloadsLoading}
            dataSource={accountsWorkloadsDataSource}
          />
          {kpiDatasetLoading ? <section class="kpi-panel" role="status">Loading KPI Overview data…</section>
          : kpiDatasetError ? <section class="kpi-panel" role="alert">KPI Overview data is unavailable. {kpiDatasetError}</section>
          : kpiDataset && <section id="activities" class="kpi-panel kpi-dashboard-section" aria-labelledby="kpiOverviewTitle">
            <div class="kpi-panel__header">
              <div>
                <h2 id="kpiOverviewTitle">KPI Overview</h2>
                <p class="kpi-panel__description">KPI Overview summarizes quarterly achievement status across each KPI so progress and gaps are visible at a glance.</p>
              </div>

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
                  {kpiDataset.overviewRows.map((row) => (
                    <tr id={`activity-${row.code.toLowerCase().replace("+", "-")}`}>
                      <td>
                        <div class="kpi-name-cell">
                          <span class={row.code === "D1" ? "kpi-code-badge kpi-code-badge--priority" : "kpi-code-badge"}>{row.codeBadge}</span>
                          <span>{row.name}</span>
                        </div>
                      </td>
                      {row.quarters.map((quarter) => {
                        const tooltip = overviewTooltip(kpiDataset, row.code, quarter.quarter, quarter.displayActual, quarter.displayTarget);
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
          </section>}

          {kpiDataset && <section id="pipeline" class="kpi-panel kpi-dashboard-section kpi-new-workload-section" aria-labelledby="newWorkloadTitle">
            <div class="kpi-panel__header">
              <div>
                <h2 id="newWorkloadTitle">New Workload</h2>
                <p class="kpi-panel__description">New Workload tracks how identified opportunities progress into validated pipeline and onboarded revenue against quarterly targets.</p>
              </div>
            </div>
            <div class="kpi-new-workload-grid">
              {kpiDataset.newWorkload.map((quarter) => (
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
          </section>}
        </>
      ) : activeRoute.module === "kpiPage" ? (
        <KpiSpreadsheetPage fiscalYear={fiscalYear} routeId={activeRoute.id}
          guideDataFiscalYear={guideDataFiscalYear} guideRecords={guideRecords} guideLoading={guideLoading} guideError={guideError}
          onNavigate={onNavigate} onNavigationGuardChange={onKpiNavigationGuardChange}
          onWriteStateChange={onKpiWriteStateChange} />
      ) : activeRoute.module === "myCustomers360" ? (
        <MyCustomers360Page
          fiscalYear={fiscalYear}
          rows={accountsWorkloadsRows}
          dataAvailable={accountsWorkloadsDatasetAvailable}
        />
      ) : activeRoute.module === "accountsWorkloads" ? (
        accountsWorkloadsLoading ? (
          <section class="accounts-workloads-page accounts-workloads-loading" role="status" aria-busy="true" aria-describedby="accountsWorkloadsLoadingText">
            <oj-progress-circle value={-1} size="md" aria-label="Loading Accounts and Workloads"></oj-progress-circle>
            <span id="accountsWorkloadsLoadingText">Loading Accounts &amp; Workloads data…</span>
          </section>
        ) : (
          <AccountsWorkloadsPage
            key={fiscalYear}
            fiscalYear={fiscalYear}
            rows={accountsWorkloadsRows}
            metadata={accountWorkloadMetadata}
            query={accountsWorkloadsQuery}
            dataSource={accountsWorkloadsDataSource}
            fxRate={fxRate}
            fxLoading={fxLoading}
            fxError={fxError}
            accountsWorkloadsRefreshing={accountsWorkloadsRefreshing}
            onQueryChange={onAccountsWorkloadsQueryChange}
            onRefresh={onAccountsWorkloadsRefresh}
            onDraftStateChange={onAccountsWorkloadsDraftStateChange}
            onRowsChange={onAccountsWorkloadsRowsChange}
          />
        )
      ) : activeRoute.module === "weeklyActivities" ? (
        <WeeklyActivitiesPage key={fiscalYear} fiscalYear={fiscalYear} onDirtyStateChange={onWeeklyActivitiesDraftStateChange} />
      ) : activeRoute.module === "consumption" ? (
        <ConsumptionPage
          key={fiscalYear}
          fiscalYear={fiscalYear}
          onNavigationGuardChange={onKpiNavigationGuardChange}
        />
      ) : (
        <EmptyRoutePage route={activeRoute} />
      )}

      {guideOpen && isKpiActivitiesRoute(activeRoute) && (
        <div class="kpi-guide-overlay" role="presentation">
          <section class="kpi-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="kpiGuideTitle">
            <div class="kpi-guide-dialog__header">
              <div>
                <h2 id="kpiGuideTitle">KPI Guide</h2>
                <p class="kpi-panel__description">Use KPI Guide to understand each KPI target, required evidence, and how each activity is measured before updating details.</p>
              </div>
              <div class="kpi-guide-dialog__actions">
                {guideEditMode ? (
                  <>
                    <button type="button" id="kpiGuideSaveButton" class="kpi-guide-edit-button is-active" disabled={guideSaving} onClick={() => void saveGuideEdit()}>{guideSaving ? "Saving…" : "Save"}</button>
                    <button type="button" id="kpiGuideCancelButton" class="kpi-guide-edit-button" disabled={guideSaving} onClick={cancelGuideEdit}>Cancel</button>
                  </>
                ) : (
                  <button type="button" id="kpiGuideEditButton" class="kpi-guide-edit-button" disabled={guideLoading || guideRecords.length === 0} onClick={startGuideEdit}>Edit</button>
                )}
                <oj-button chroming="borderless" display="icons" aria-label="Close KPI Guide" onojAction={onCloseGuide}>
                  <span slot="startIcon" class="oj-ux-ico-close"></span>
                  Close
                </oj-button>
              </div>
            </div>

            <div class="kpi-guide-dialog__body">
              {guideLoading && <div id="kpiGuideLoading" role="status" aria-busy="true"><oj-progress-circle value={-1} size="sm"></oj-progress-circle> Loading KPI Guide…</div>}
              {(guideError || guideSaveError) && <div id="kpiGuideError" role="alert">{guideSaveError || guideError}</div>}

              {!guideLoading && <div class="kpi-guide-layout kpi-guide-layout--unified">
              <aside class="kpi-guide-list" aria-label="KPI guide list">
                {guideItems.map((guide) => (
                  <button
                    type="button"
                    class={guideListSelectionClass(guide.code, selectedGuide.code)}
                    aria-current={guide.code === selectedGuide.code ? "true" : undefined}
                    onClick={() => selectGuide(guide.code)}>
                    <span class={guide.code === "D1" ? "kpi-code-badge kpi-code-badge--priority" : "kpi-code-badge"}>{guide.code}</span>
                    <span>{guide.name}</span>
                  </button>
                ))}
              </aside>

              <div class="kpi-guide-main kpi-guide-main--details">
                <div class="kpi-guide-details-heading">
                  <div>
                    <h3><span class={selectedGuide.code === "D1" ? "kpi-code-badge kpi-code-badge--priority" : "kpi-code-badge"}>{selectedGuide.code}</span> {selectedGuide.name}</h3>
                    <p class="kpi-guide-kpi-description">{selectedGuideDetails.details}</p>
                  </div>
                </div>
                {guideEditMode
                  ? <EditableDetails details={selectedGuideDetails} onChange={updateDraftGuideDetails} />
                  : <ReadOnlyDetails details={selectedGuideDetails} />}
              </div>
              </div>}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
