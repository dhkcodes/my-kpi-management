/**
 * @license
 * Copyright (c) 2014, 2026, Oracle and/or its affiliates.
 * Licensed under The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { registerCustomElement } from "ojs/ojvcomponent";
import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import Context = require("ojs/ojcontext");
import { Footer } from "./footer";
import { Header } from "./header";
import { Content } from "./content/index";
import { getNavigationRoute, NavigationRouteDefinition } from "./navigationRoutes";
import { fiscalYearData, fiscalYears, FiscalYear, getLatestFiscalYear, navItems, NavigationItem } from "../data/kpiMockData";
import { AccountWorkloadMetadata, AccountWorkloadRow, getAccountWorkloadMetadata } from "../data/accountsWorkloadsMockData";
import {
  AccountsWorkloadsDataSource,
  loadAccountWorkloadStateSeed
} from "../data/accountsWorkloadsDataSource";
import {
  AccountsWorkloadsListQuery,
  AccountsWorkloadsPersistenceError,
  canUseDevelopmentDataFallback,
  fetchAccountsWorkloads,
  persistAndReconcileAccountWorkloadChanges
} from "../data/accountsWorkloadsApi";
import { getBusinessAsOfDate } from "../data/accountsWorkloadsPulseV2";
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
        <span class="kpi-navigation-label">{item.label}</span>
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
    const [isDesktopNavigation, setIsDesktopNavigation] = useState(() =>
      typeof window === "undefined" ? true : window.matchMedia("(min-width: 1025px)").matches
    );
    const [navigationOpen, setNavigationOpen] = useState(isDesktopNavigation);
    const [fiscalYear, setFiscalYear] = useState<FiscalYear>(getLatestFiscalYear());
    const [selectedNavigationId, setSelectedNavigationId] = useState("home");
    const [activeRoute, setActiveRoute] = useState<NavigationRouteDefinition>(() => getNavigationRoute("home"));
    const [guideOpen, setGuideOpen] = useState(false);
    const [accountsWorkloadsAsOf] = useState(() => getBusinessAsOfDate());
    const [accountWorkloadMetadata, setAccountWorkloadMetadata] = useState<AccountWorkloadMetadata>(defaultAccountWorkloadMetadata);
    const [accountsWorkloadsDataSource, setAccountsWorkloadsDataSource] = useState<AccountsWorkloadsDataSource>("synthetic-fallback");
    const [accountsWorkloadsLoading, setAccountsWorkloadsLoading] = useState(true);
    const [accountsWorkloadsLoadError, setAccountsWorkloadsLoadError] = useState("");
    const [accountsWorkloadsDraftActive, setAccountsWorkloadsDraftActive] = useState(false);
    const [accountsWorkloadsRefreshVersion, setAccountsWorkloadsRefreshVersion] = useState(0);
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
    }, [activeRoute.module, accountsWorkloadsQuery, accountsWorkloadsRefreshVersion, fiscalYear]);

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
      window.requestAnimationFrame(() => {
        document.getElementById("cockpit")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
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
            onAccountsWorkloadsRefresh={() => setAccountsWorkloadsRefreshVersion((version) => version + 1)}
            accountWorkloadMetadata={accountWorkloadMetadata}
            dataset={fiscalYearData[fiscalYear]}
            fiscalYear={fiscalYear}
            fiscalYears={fiscalYears}
            guideOpen={guideOpen}
            onCloseGuide={() => setGuideOpen(false)}
            onOpenGuide={() => setGuideOpen(true)}
            onAccountsWorkloadsRowsChange={async (rows, permanentDeleteIds = []) => {
              const savedRows = accountsWorkloadsRows[fiscalYear];
              if (accountsWorkloadsDataSource !== "api") {
                setAccountsWorkloadsRows((current) => ({ ...current, [fiscalYear]: rows }));
                return;
              }
              const refreshQuery: AccountsWorkloadsListQuery = { fiscalYear, ...accountsWorkloadsQuery };
              try {
                const refreshed = await persistAndReconcileAccountWorkloadChanges(savedRows, rows, fiscalYear, refreshQuery, fetch, permanentDeleteIds);
                setAccountsWorkloadsRows((current) => ({ ...current, [fiscalYear]: refreshed.items }));
                setAccountWorkloadMetadata((current) => ({ ...current, parsedRowCount: refreshed.total }));
              } catch (error) {
                if (error instanceof AccountsWorkloadsPersistenceError) {
                  setAccountsWorkloadsRows((current) => ({ ...current, [fiscalYear]: error.authoritative.items }));
                  setAccountWorkloadMetadata((current) => ({ ...current, parsedRowCount: error.authoritative.total }));
                }
                throw error;
              }
            }}
            onAccountsWorkloadsQueryChange={setAccountsWorkloadsQuery}
            onAccountsWorkloadsDraftStateChange={setAccountsWorkloadsDraftActive}
            onFiscalYearChange={(year) => {
              setFiscalYear(year);
              setSelectedNavigationId("home");
              setActiveRoute(getNavigationRoute("home"));
            }}
          />
        </div>
        <Footer />
      </div>
    );
  }
);
