/**
 * @license
 * Copyright (c) 2014, 2026, Oracle and/or its affiliates.
 * Licensed under The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { registerCustomElement } from "ojs/ojvcomponent";
import { h } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import Context = require("ojs/ojcontext");
import { Footer } from "./footer";
import { Header } from "./header";
import { Content } from "./content/index";
import {
  getNavigationPath,
  getNavigationRoute,
  getNavigationRouteFromPath,
  NavigationRouteDefinition
} from "./navigationRoutes";
import { fiscalYearData, fiscalYears, FiscalYear, getLatestFiscalYear, navItems, NavigationItem } from "../data/kpiMockData";
import { AccountWorkloadMetadata, AccountWorkloadRow, getAccountWorkloadMetadata } from "../data/accountsWorkloadsMockData";
import {
  AccountsWorkloadsDataSource,
  loadAccountWorkloadStateSeed
} from "../data/accountsWorkloadsDataSource";
import {
  AccountsWorkloadsListQuery,
  canUseDevelopmentDataFallback,
  fetchAccountsWorkloads,
  saveAccountsWorkloadsBatch
} from "../data/accountsWorkloadsApi";
import { getBusinessAsOfDate } from "../data/accountsWorkloadsPulseV2";
import {
  fetchFxRate,
  fetchKpiGuides,
  FxRateRecord,
  KpiGuideRecord,
  updateKpiGuide
} from "../data/kpiConfigurationApi";
import "ojs/ojnavigationlist";

type Props = Readonly<{
  appName?: string;
  userLogin?: string;
}>;

const defaultAccountWorkloadMetadata = getAccountWorkloadMetadata();

type NavigationEntryProps = Readonly<{
  item: NavigationItem;
  onNavigate: (item: NavigationItem) => void;
}>;

function NavigationEntry({ item, onNavigate }: NavigationEntryProps) {
  const handleItemClick = item.children
    ? undefined
    : (event: MouseEvent) => {
        event.preventDefault();
        onNavigate(item);
      };

  return (
    <li id={item.id}>
      <a href={item.href} onClick={handleItemClick}>
        {item.icon && <span class={`kpi-navigation-icon ${item.icon}`} aria-hidden="true"></span>}
        {item.code && item.codePlacement === "before" && <span class="kpi-navigation-code-badge kpi-navigation-code-badge--green kpi-navigation-code-badge--before">{item.code}</span>}
        <span
          class="kpi-navigation-label"
          title={item.label}
          tabIndex={0}
          aria-describedby={`${item.id}-full-name`}>
          <span class="kpi-navigation-label__text">{item.label}</span>
          <span id={`${item.id}-full-name`} class="kpi-navigation-full-name" role="tooltip">{item.label}</span>
        </span>
        {item.code && item.codePlacement !== "before" && <span class="kpi-navigation-code-badge kpi-navigation-code-badge--green">{item.code}</span>}
      </a>
      {item.children && (
        <ul>
          {item.children.map((child) => (
            <NavigationEntry item={child} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </li>
  );
}

export const App = registerCustomElement(
  "app-root",
  ({ appName = "KPI Management", userLogin = "donghu.kim@oracle.com" }: Props) => {
    const initialRoute = typeof window === "undefined"
      ? getNavigationRoute("home")
      : getNavigationRouteFromPath(window.location.pathname);
    const [isDesktopNavigation, setIsDesktopNavigation] = useState(() =>
      typeof window === "undefined" ? true : window.matchMedia("(min-width: 1025px)").matches
    );
    const [navigationOpen, setNavigationOpen] = useState(isDesktopNavigation);
    const [fiscalYear, setFiscalYear] = useState<FiscalYear>(getLatestFiscalYear());
    const fiscalYearRef = useRef(fiscalYear);
    const [selectedNavigationId, setSelectedNavigationId] = useState(initialRoute.id);
    const [activeRoute, setActiveRoute] = useState<NavigationRouteDefinition>(initialRoute);
    const [guideOpen, setGuideOpen] = useState(false);
    const [kpiGuides, setKpiGuides] = useState<KpiGuideRecord[]>([]);
    const [guideLoading, setGuideLoading] = useState(false);
    const [guideSaving, setGuideSaving] = useState(false);
    const [guideError, setGuideError] = useState("");
    const [fxRate, setFxRate] = useState<FxRateRecord | null>(null);
    const [fxLoading, setFxLoading] = useState(false);

    const [fxError, setFxError] = useState("");
    const [accountsWorkloadsAsOf] = useState(() => getBusinessAsOfDate());
    const [accountWorkloadMetadata, setAccountWorkloadMetadata] = useState<AccountWorkloadMetadata>(defaultAccountWorkloadMetadata);
    const [accountsWorkloadsDataSource, setAccountsWorkloadsDataSource] = useState<AccountsWorkloadsDataSource>("synthetic-fallback");
    const [accountsWorkloadsLoading, setAccountsWorkloadsLoading] = useState(true);
    const [accountsWorkloadsLoadError, setAccountsWorkloadsLoadError] = useState("");
    const [accountsWorkloadsDraftActive, setAccountsWorkloadsDraftActive] = useState(false);
    const [accountsWorkloadsRefreshing, setAccountsWorkloadsRefreshing] = useState(false);
    const [accountsWorkloadsQuery, setAccountsWorkloadsQuery] = useState<Omit<AccountsWorkloadsListQuery, "fiscalYear">>({
      search: "",
      includeDeleted: false,
      sort: "account",
      direction: "asc"
    });
    const [accountsWorkloadsRows, setAccountsWorkloadsRows] = useState<Record<FiscalYear, AccountWorkloadRow[]>>(() =>
      Object.fromEntries(fiscalYears.map((year) => [year, [] as AccountWorkloadRow[]])) as Record<FiscalYear, AccountWorkloadRow[]>
    );

    useEffect(() => {
      Context.getPageContext().getBusyContext().applicationBootstrapComplete();
    }, []);

    useEffect(() => {
      if (!guideOpen) return;
      let active = true;
      setKpiGuides([]);
      setGuideLoading(true);
      setGuideError("");
      void fetchKpiGuides(fiscalYear)
        .then((guides) => { if (active) setKpiGuides(guides); })
        .catch((error) => { if (active) setGuideError(error instanceof Error ? error.message : "KPI Guide API request failed."); })
        .finally(() => { if (active) setGuideLoading(false); });
      return () => { active = false; };
    }, [fiscalYear, guideOpen]);

    useEffect(() => {
      let active = true;
      setFxRate(null);
      setFxLoading(true);
      setFxError("");
      void fetchFxRate(fiscalYear)
        .then((rate) => { if (active) setFxRate(rate); })
        .catch((error) => { if (active) setFxError(error instanceof Error ? error.message : "FX Rate API request failed."); })
        .finally(() => { if (active) setFxLoading(false); });
      return () => { active = false; };
    }, [fiscalYear]);

    useEffect(() => {
      let active = true;
      const tableRoute = activeRoute.module === "accountsWorkloads";
      const query: AccountsWorkloadsListQuery = tableRoute
        ? { fiscalYear, ...accountsWorkloadsQuery }
        : { fiscalYear, search: "", includeDeleted: true, sort: "account", direction: "asc" };
      const load = async () => {
        setAccountsWorkloadsLoading(true);
        setAccountsWorkloadsLoadError("");
        try {
          const result = await fetchAccountsWorkloads(query);
          if (!active) return;
          setAccountWorkloadMetadata((current) => ({
            ...current,
            sourceWorkbook: "Accounts & Workloads API",
            parsedRowCount: result.total
          }));
          setAccountsWorkloadsDataSource("api");
          setAccountsWorkloadsRows((current) => ({ ...current, [fiscalYear]: result.items }));
        } catch (error) {
          if (!canUseDevelopmentDataFallback(error)) {
            if (!active) return;
            setAccountsWorkloadsLoadError(error instanceof Error ? error.message : "Accounts & Workloads API request failed.");
            return;
          }
          try {
            const { seed, source } = await loadAccountWorkloadStateSeed();
            if (!active) return;
            setAccountWorkloadMetadata(seed.metadata);
            setAccountsWorkloadsDataSource(source);
            setAccountsWorkloadsRows((current) => ({ ...current, [fiscalYear]: seed.metadata.fiscalYear === fiscalYear ? seed.rows : [] }));
          } catch (fallbackError) {
            if (!active) return;
            setAccountsWorkloadsLoadError(fallbackError instanceof Error ? fallbackError.message : "Development data could not be loaded.");
          }
        } finally {
          if (active) setAccountsWorkloadsLoading(false);
        }
      };
      const delay = tableRoute && (accountsWorkloadsQuery.search ?? "") !== "" ? 250 : 0;
      const timer = window.setTimeout(() => void load(), delay);
      return () => {
        active = false;
        window.clearTimeout(timer);
      };
    }, [activeRoute.module, accountsWorkloadsQuery, fiscalYear]);

    useEffect(() => {
      const handlePopState = () => {
        const route = getNavigationRouteFromPath(window.location.pathname);
        setSelectedNavigationId(route.id);
        setActiveRoute(route);
      };
      window.addEventListener("popstate", handlePopState);
      return () => window.removeEventListener("popstate", handlePopState);
    }, []);

    useEffect(() => {
      const mediaQuery = window.matchMedia("(min-width: 1025px)");
      const syncNavigationMode = (event: MediaQueryListEvent | MediaQueryList) => {
        setIsDesktopNavigation(event.matches);
        setNavigationOpen(event.matches);
      };

      syncNavigationMode(mediaQuery);
      mediaQuery.addEventListener("change", syncNavigationMode);
      return () => mediaQuery.removeEventListener("change", syncNavigationMode);
    }, []);

    const closeNavigation = () => {
      if (!isDesktopNavigation) {
        setNavigationOpen(false);
      }
    };
    const handleNavigate = (item: NavigationItem) => {
      const route = getNavigationRoute(item.id);
      setSelectedNavigationId(item.id);
      setActiveRoute(route);
      window.history.pushState({ routeId: route.id }, "", getNavigationPath(route));
      window.requestAnimationFrame(() => {
        document.getElementById("cockpit")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };

    const handleFiscalYearChange = (nextFiscalYear: FiscalYear) => {
      fiscalYearRef.current = nextFiscalYear;
      setFiscalYear(nextFiscalYear);
    };

    const saveKpiGuide = async (draft: KpiGuideRecord) => {
      if (draft.fiscalYear !== fiscalYearRef.current) {
        throw new Error("Fiscal year changed. Reload the KPI Guide before saving.");
      }
      setGuideSaving(true);
      setGuideError("");
      try {
        const authoritative = await updateKpiGuide(draft);
        if (fiscalYearRef.current !== authoritative.fiscalYear) {
          throw new Error("Fiscal year changed while saving. The stale response was ignored.");
        }
        setKpiGuides((current) => current.map((guide) => guide.kpiCode === authoritative.kpiCode ? authoritative : guide));
        return authoritative;
      } catch (error) {
        setGuideError(error instanceof Error ? error.message : "KPI Guide could not be saved.");
        throw error;
      } finally {
        setGuideSaving(false);
      }
    };

    const handleAccountsWorkloadsRefresh = async () => {
      setAccountsWorkloadsRefreshing(true);
      setAccountsWorkloadsLoadError("");
      try {
        const refreshed = await fetchAccountsWorkloads({ fiscalYear, ...accountsWorkloadsQuery });
        setAccountsWorkloadsRows((current) => ({ ...current, [fiscalYear]: refreshed.items }));
        setAccountWorkloadMetadata((current) => ({ ...current, parsedRowCount: refreshed.total }));
        setAccountsWorkloadsDataSource("api");
      } catch (error) {
        setAccountsWorkloadsLoadError(error instanceof Error ? error.message : "Accounts & Workloads refresh failed.");
      } finally {
        setAccountsWorkloadsRefreshing(false);
      }
    };


    return (
      <div id="appContainer" class="oj-web-applayout-page kpi-shell">
        <Header
          appName={appName}
          userLogin={userLogin}
          navigationOpen={navigationOpen}
          onToggleNavigation={() => setNavigationOpen((value) => !value)}
        />
        <div class={navigationOpen ? "kpi-mobile-scrim is-open" : "kpi-mobile-scrim"} onClick={closeNavigation}></div>
        <div class="kpi-shell__body">
          <aside id="kpiSideNavigation" class={navigationOpen ? "kpi-side-nav oj-bg-neutral-170 oj-color-invert is-open" : "kpi-side-nav oj-bg-neutral-170 oj-color-invert is-closed"} aria-label="KPI workspace navigation">
            <oj-navigation-list
              class="kpi-navigation-list"
              drillMode="sliding"
              rootLabel="Home"
              selection={selectedNavigationId}
              aria-label="KPI navigation">
              <ul>
                {navItems.map((item) => (
                  <NavigationEntry item={item} onNavigate={handleNavigate} />
                ))}
              </ul>
            </oj-navigation-list>
          </aside>
          <Content
            activeRoute={activeRoute}
            accountsWorkloadsRows={accountsWorkloadsRows[fiscalYear]}
            accountsWorkloadsAsOf={accountsWorkloadsAsOf}
            accountsWorkloadsDataSource={accountsWorkloadsDataSource}
            accountsWorkloadsLoadError={accountsWorkloadsLoadError}
            accountsWorkloadsQuery={accountsWorkloadsQuery}
            accountsWorkloadsDraftActive={accountsWorkloadsDraftActive}
            accountsWorkloadsDatasetAvailable={!accountsWorkloadsLoading && !accountsWorkloadsLoadError && (fiscalYear === accountWorkloadMetadata.fiscalYear || accountsWorkloadsRows[fiscalYear].length > 0)}
            accountsWorkloadsLoading={accountsWorkloadsLoading}
            accountsWorkloadsRefreshing={accountsWorkloadsRefreshing}
            onAccountsWorkloadsRefresh={() => void handleAccountsWorkloadsRefresh()}
            accountWorkloadMetadata={accountWorkloadMetadata}
            dataset={fiscalYearData[fiscalYear]}
            fiscalYear={fiscalYear}
            fiscalYears={fiscalYears}
            guideOpen={guideOpen}
            guideRecords={kpiGuides}
            guideLoading={guideLoading}
            guideSaving={guideSaving}
            guideError={guideError}
            fxRate={fxRate}
            fxLoading={fxLoading}
            fxError={fxError}
            onSaveGuide={saveKpiGuide}

            onCloseGuide={() => setGuideOpen(false)}
            onOpenGuide={() => setGuideOpen(true)}
            onAccountsWorkloadsRowsChange={async (rows, permanentDeleteIds, draftFxRate) => {
              const savedRows = accountsWorkloadsRows[fiscalYear];
              if (accountsWorkloadsDataSource !== "api") {
                const localResult = { items: rows, total: rows.length, ...(draftFxRate ? { fxRate: draftFxRate } : {}) };
                setAccountsWorkloadsRows((current) => ({ ...current, [fiscalYear]: rows }));
                if (draftFxRate) setFxRate(draftFxRate);
                return localResult;
              }
              const committedQuery: AccountsWorkloadsListQuery = { fiscalYear, ...accountsWorkloadsQuery };
              const authoritative = await saveAccountsWorkloadsBatch(
                savedRows,
                rows,
                committedQuery,
                draftFxRate,
                fetch,
                permanentDeleteIds
              );
              setAccountsWorkloadsRows((current) => ({ ...current, [fiscalYear]: authoritative.items }));
              setAccountWorkloadMetadata((current) => ({ ...current, parsedRowCount: authoritative.total }));
              if (authoritative.fxRate) setFxRate(authoritative.fxRate);
              return authoritative;
            }}
            onAccountsWorkloadsQueryChange={setAccountsWorkloadsQuery}
            onAccountsWorkloadsDraftStateChange={setAccountsWorkloadsDraftActive}
            onFiscalYearChange={handleFiscalYearChange}
          />
        </div>
        <Footer />
      </div>
    );
  }
);
