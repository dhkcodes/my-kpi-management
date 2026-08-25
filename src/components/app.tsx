/**
 * @license
 * Copyright (c) 2014, 2026, Oracle and/or its affiliates.
 * Licensed under The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { registerCustomElement } from "ojs/ojvcomponent";
import { h } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import Context = require("ojs/ojcontext");
import { Footer } from "./footer";
import { Header } from "./header";
import { LoginPage } from "./LoginPage";
import { Content } from "./content/index";
import type { KpiNavigationGuard } from "./content/KpiSpreadsheetPage";
import {
  getNavigationPath,
  getNavigationRoute,
  getNavigationRouteFromPath,
  isKpiActivitiesRoute,
  NavigationRouteDefinition
} from "./navigationRoutes";
import { fiscalYearData, fiscalYears, FiscalYear, getLatestFiscalYear, navItems, NavigationItem } from "../data/kpiMockData";
import { AccountWorkloadMetadata, AccountWorkloadRow, getAccountWorkloadMetadata } from "../data/accountsWorkloadsMockData";
import {
  AccountsWorkloadsDataSource,
  createApiAccountWorkloadMetadata,
  loadAccountWorkloadStateSeed
} from "../data/accountsWorkloadsDataSource";
import {
  AccountsWorkloadsListQuery,
  canUseDevelopmentDataFallback,
  fetchAccountsWorkloads,
  saveAccountsWorkloadsBatch
} from "../data/accountsWorkloadsApi";
import {
  getHistoryIndex,
  getRejectedPopstateDelta,
  hasNavigationDestinationChanged,
  isCurrentContextAnchorNavigation,
  isDialogPlaceholderControlAnchor,
  isSameDocumentNavigation,
  shouldReleaseWeeklyActivityDraft,
  withHistoryIndex
} from "./weeklyActivityNavigationGuard";
import { getBusinessAsOfDate } from "../data/accountsWorkloadsPulseV2";
import { applyPermanentDeletesLocally } from "../data/accountsWorkloadsSelection";
import { listKpiSummary } from "../data/kpiSpreadsheetApi";
import { buildLiveFiscalYearDataset } from "../data/kpiLiveDashboard";
import { FiscalYearDataset } from "../data/kpiCalculations";
import {
  fetchFxRate,
  fetchKpiGuides,
  FxRateRecord,
  KpiGuideRecord,
  updateKpiGuide
} from "../data/kpiConfigurationApi";
import "ojs/ojnavigationlist";
import ArrayTreeDataProvider = require("ojs/ojarraytreedataprovider");
import { KeySet, KeySetImpl } from "ojs/ojkeyset";
import type { AuthSession } from "../auth/authSession";
import { getAuthenticatedSession, logoutUser } from "../auth/authApi";

type Props = Readonly<{
  appName?: string;
}>;

type AuthenticatedAppProps = Readonly<{
  appName: string;
  userLogin: string;
  onLogout: () => void;
}>;

const defaultAccountWorkloadMetadata = getAccountWorkloadMetadata();
const UNSAVED_WEEKLY_ACTIVITY_MESSAGE = "Discard the unsaved Weekly Activity changes?";

type NavigationItemTemplateContext = Readonly<{
  data: NavigationItem;
  key: string;
  leaf: boolean;
}>;

const navigationDataProvider = new ArrayTreeDataProvider<string, NavigationItem>(navItems, {
  keyAttributes: "id",
  childrenAttribute: "children"
});

const navigationItemsById = new Map<string, NavigationItem>();
const navigationParentByLeafId = new Map<string, string>();
for (const item of navItems) {
  navigationItemsById.set(item.id, item);
  for (const child of item.children ?? []) {
    navigationItemsById.set(child.id, child);
    navigationParentByLeafId.set(child.id, item.id);
  }
}

const getExpandedNavigationKeys = (navigationId: string): KeySetImpl<string> => {
  const parentId = navigationParentByLeafId.get(navigationId);
  return new KeySetImpl(parentId ? [parentId] : []);
};

const isLeafNavigationId = (navigationId: string): boolean => {
  const item = navigationItemsById.get(navigationId);
  return Boolean(item && !item.children);
};

function renderNavigationItem(context: NavigationItemTemplateContext) {
  const { data: item, leaf } = context;
  return (
    <a
      data-app-navigation={leaf ? "true" : undefined}
      data-navigation-id={leaf ? item.id : undefined}
      data-navigation-parent-id={leaf ? undefined : item.id}
      title={item.label}>
      <span class="kpi-navigation-row">
        {item.icon && <span class={`kpi-navigation-icon ${item.icon}`} aria-hidden="true"></span>}
        {item.code && item.codePlacement === "before" && <span class="kpi-navigation-code-badge kpi-navigation-code-badge--green kpi-navigation-code-badge--before">{item.code}</span>}
        <span class="kpi-navigation-label" title={item.label} tabIndex={0}>
          <span class="kpi-navigation-label__text">{item.label}</span>
        </span>
        {item.code && item.codePlacement !== "before" && <span class="kpi-navigation-code-badge kpi-navigation-code-badge--green">{item.code}</span>}
      </span>
    </a>
  );
}

function AuthenticatedApp({ appName, userLogin, onLogout }: AuthenticatedAppProps) {
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
    const [expandedNavigationKeys, setExpandedNavigationKeys] = useState<KeySet<string>>(() => getExpandedNavigationKeys(initialRoute.id));
    const [activeRoute, setActiveRoute] = useState<NavigationRouteDefinition>(initialRoute);
    const activeRouteRef = useRef(initialRoute);
    const activeRouteModuleRef = useRef(initialRoute.module);
    const activeLocationHrefRef = useRef(typeof window === "undefined" ? getNavigationPath(initialRoute) : window.location.href);
    const historyIndexRef = useRef(typeof window === "undefined" ? 0 : getHistoryIndex(window.history.state) ?? 0);
    const restoringHistoryRef = useRef(false);
    const kpiNavigationGuardRef = useRef<KpiNavigationGuard | null>(null);
    const kpiUnsavedChangesRef = useRef(false);
    const pendingKpiPopstatePromptRef = useRef<null | { label: string; retry: () => void }>(null);
    const confirmedKpiPopstateRetryRef = useRef<null | { historyIndex: number | null; href: string }>(null);
    const [guideOpen, setGuideOpen] = useState(false);
    const [kpiGuides, setKpiGuides] = useState<KpiGuideRecord[]>([]);
    const [guideDataFiscalYear, setGuideDataFiscalYear] = useState<FiscalYear | null>(null);
    const [guideLoading, setGuideLoading] = useState(false);
    const [guideSaving, setGuideSaving] = useState(false);
    const [guideError, setGuideError] = useState("");
    const [fxRate, setFxRate] = useState<FxRateRecord | null>(null);
    const [fxLoading, setFxLoading] = useState(false);

    const [fxError, setFxError] = useState("");
    const [liveKpiDataset, setLiveKpiDataset] = useState<FiscalYearDataset | null>(null);
    const [kpiDatasetLoading, setKpiDatasetLoading] = useState(false);
    const [kpiDatasetError, setKpiDatasetError] = useState("");
    const [accountsWorkloadsAsOf] = useState(() => getBusinessAsOfDate());
    const [accountWorkloadMetadata, setAccountWorkloadMetadata] = useState<AccountWorkloadMetadata>(defaultAccountWorkloadMetadata);
    const [accountsWorkloadsDataSource, setAccountsWorkloadsDataSource] = useState<AccountsWorkloadsDataSource>("synthetic-fallback");
    const [accountsWorkloadsLoading, setAccountsWorkloadsLoading] = useState(true);
    const [accountsWorkloadsLoadError, setAccountsWorkloadsLoadError] = useState("");
    const [accountsWorkloadsDraftActive, setAccountsWorkloadsDraftActive] = useState(false);
    const [weeklyActivitiesDraftActive, setWeeklyActivitiesDraftActive] = useState(false);
    const weeklyActivitiesDraftActiveRef = useRef(false);
    const [kpiWriteActive, setKpiWriteActive] = useState(false);
    const kpiWriteActiveRef = useRef(false);

    const [accountsWorkloadsRefreshing, setAccountsWorkloadsRefreshing] = useState(false);
    const accountsWorkloadsRequestIdRef = useRef(0);
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
      const currentHistoryIndex = historyIndexRef.current;
      window.history.replaceState(withHistoryIndex(window.history.state, currentHistoryIndex), "", window.location.href);
    }, []);

    useEffect(() => {
      if (!isKpiActivitiesRoute(activeRoute)) setGuideOpen(false);
    }, [activeRoute.id]);

    useEffect(() => {
      const handleBeforeUnload = (event: BeforeUnloadEvent) => {
        if (!kpiUnsavedChangesRef.current) return;
        event.preventDefault();
        event.returnValue = "";
      };
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, []);

    const handleKpiNavigationGuardChange = useCallback((guard: KpiNavigationGuard | null, hasUnsavedChanges: boolean) => {
      kpiNavigationGuardRef.current = guard;
      kpiUnsavedChangesRef.current = hasUnsavedChanges;
    }, []);

    useEffect(() => {
      if (!(guideOpen || activeRoute.module === "kpiPage")) return;
      let active = true;
      setGuideDataFiscalYear(fiscalYear);
      setKpiGuides([]);
      setGuideLoading(true);
      setGuideError("");
      void fetchKpiGuides(fiscalYear)
        .then((guides) => { if (active) setKpiGuides(guides); })
        .catch((error) => { if (active) setGuideError(error instanceof Error ? error.message : "KPI Guide API request failed."); })
        .finally(() => { if (active) setGuideLoading(false); });
      return () => { active = false; };
    }, [activeRoute.module, fiscalYear, guideOpen]);

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
      if (activeRoute.module !== "home") return;
      let active = true;
      setLiveKpiDataset(null);
      setKpiDatasetLoading(true);
      setKpiDatasetError("");
      void listKpiSummary(fiscalYear)
        .then((summary) => { if (active) setLiveKpiDataset(buildLiveFiscalYearDataset(summary, fiscalYearData[fiscalYear])); })
        .catch((error) => { if (active) setKpiDatasetError(error instanceof Error ? error.message : "KPI Overview API request failed."); })
        .finally(() => { if (active) setKpiDatasetLoading(false); });
      return () => { active = false; };
    }, [activeRoute.module, fiscalYear]);

    useEffect(() => {
      let active = true;
      const requestId = ++accountsWorkloadsRequestIdRef.current;
      const tableRoute = activeRoute.module === "accountsWorkloads";
      const query: AccountsWorkloadsListQuery = tableRoute
        ? { fiscalYear, ...accountsWorkloadsQuery }
        : { fiscalYear, search: "", includeDeleted: true, sort: "account", direction: "asc" };
      const load = async () => {
        setAccountsWorkloadsRefreshing(false);
        setAccountsWorkloadsLoading(true);
        setAccountsWorkloadsLoadError("");
        try {
          const result = await fetchAccountsWorkloads(query);
          if (!active || requestId !== accountsWorkloadsRequestIdRef.current) return;
          setAccountWorkloadMetadata((current) =>
            createApiAccountWorkloadMetadata(fiscalYear, result.total, current)
          );
          setAccountsWorkloadsDataSource("api");
          setAccountsWorkloadsRows((current) => ({ ...current, [fiscalYear]: result.items }));
        } catch (error) {
          if (!canUseDevelopmentDataFallback(error)) {
            if (!active || requestId !== accountsWorkloadsRequestIdRef.current) return;
            setAccountsWorkloadsLoadError(error instanceof Error ? error.message : "Accounts & Workloads API request failed.");
            return;
          }
          try {
            const { seed, source } = await loadAccountWorkloadStateSeed();
            if (!active || requestId !== accountsWorkloadsRequestIdRef.current) return;
            setAccountWorkloadMetadata(seed.metadata);
            setAccountsWorkloadsDataSource(source);
            setAccountsWorkloadsRows((current) => ({ ...current, [fiscalYear]: seed.metadata.fiscalYear === fiscalYear ? seed.rows : [] }));
          } catch (fallbackError) {
            if (!active || requestId !== accountsWorkloadsRequestIdRef.current) return;
            setAccountsWorkloadsLoadError(fallbackError instanceof Error ? fallbackError.message : "Development data could not be loaded.");
          }
        } finally {
          if (active && requestId === accountsWorkloadsRequestIdRef.current) setAccountsWorkloadsLoading(false);
        }
      };
      const delay = tableRoute && (accountsWorkloadsQuery.search ?? "") !== "" ? 250 : 0;
      const timer = window.setTimeout(() => void load(), delay);
      return () => {
        active = false;
        window.clearTimeout(timer);
      };
    }, [activeRoute.module, fiscalYear]);

    const confirmWeeklyActivitiesNavigation = (
      route: NavigationRouteDefinition,
      destinationHref = new URL(getNavigationPath(route), window.location.href).href
    ) => {
      const previousRoute = activeRouteRef.current;
      const previousHref = activeLocationHrefRef.current;
      if (hasNavigationDestinationChanged(previousRoute.id, route.id, previousHref, destinationHref) && kpiWriteActiveRef.current) {
        return false;
      }
      if (hasNavigationDestinationChanged(previousRoute.id, route.id, previousHref, destinationHref) && weeklyActivitiesDraftActiveRef.current && !window.confirm(UNSAVED_WEEKLY_ACTIVITY_MESSAGE)) {
        return false;
      }
      if (shouldReleaseWeeklyActivityDraft(previousRoute.id, route.id)) {
        weeklyActivitiesDraftActiveRef.current = false;
        setWeeklyActivitiesDraftActive(false);
      }
      activeLocationHrefRef.current = destinationHref;
      return true;
    };

    useEffect(() => {
      const handleDocumentNavigationClick = (event: MouseEvent) => {
        if (!(event.target instanceof Element)) return;
        const anchor = event.target.closest("a[href]") as HTMLAnchorElement | null;
        if (!anchor) return;
        if (isDialogPlaceholderControlAnchor(anchor.getAttribute("href"), Boolean(anchor.closest("[role=\"dialog\"] [role=\"grid\"]")))) return;
        if (anchor.closest("oj-navigation-list")) return;
        if (!isCurrentContextAnchorNavigation(event, {
          href: anchor.href,
          target: anchor.getAttribute("target"),
          download: anchor.hasAttribute("download")
        }, window.location.href)) return;
        const destinationHref = anchor.href;
        const sameDocumentNavigation = isSameDocumentNavigation(window.location.href, destinationHref);
        if (kpiWriteActiveRef.current && !sameDocumentNavigation) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        if (!weeklyActivitiesDraftActiveRef.current && !sameDocumentNavigation) return;
        if (weeklyActivitiesDraftActiveRef.current && !window.confirm(UNSAVED_WEEKLY_ACTIVITY_MESSAGE)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        const destinationRoute = getNavigationRouteFromPath(new URL(destinationHref).pathname);
        if (sameDocumentNavigation) {
          event.preventDefault();
          event.stopImmediatePropagation();
          historyIndexRef.current += 1;
          window.history.pushState(withHistoryIndex({ routeId: destinationRoute.id }, historyIndexRef.current), "", destinationHref);
          activeLocationHrefRef.current = destinationHref;
          const targetId = new URL(destinationHref).hash.slice(1);
          if (targetId) window.requestAnimationFrame(() => document.getElementById(decodeURIComponent(targetId))?.scrollIntoView());
          return;
        }
        if (shouldReleaseWeeklyActivityDraft(activeRouteRef.current.id, destinationRoute.id)) {
          weeklyActivitiesDraftActiveRef.current = false;
        }
        activeLocationHrefRef.current = destinationHref;
      };
      document.addEventListener("click", handleDocumentNavigationClick, true);
      return () => document.removeEventListener("click", handleDocumentNavigationClick, true);
    }, []);

    useEffect(() => {
      const handlePopState = (event: PopStateEvent) => {
        if (restoringHistoryRef.current) {
          restoringHistoryRef.current = false;
          const pendingPrompt = pendingKpiPopstatePromptRef.current;
          pendingKpiPopstatePromptRef.current = null;
          if (pendingPrompt) {
            const guard = kpiNavigationGuardRef.current;
            if (guard) guard(pendingPrompt.label, pendingPrompt.retry);
            else pendingPrompt.retry();
          }
          return;
        }
        const route = getNavigationRouteFromPath(window.location.pathname);
        const destinationHref = window.location.href;
        const destinationIndex = getHistoryIndex(event.state);
        const confirmedRetry = confirmedKpiPopstateRetryRef.current;
        const isConfirmedKpiRetry = Boolean(confirmedRetry
          && confirmedRetry.href === destinationHref
          && confirmedRetry.historyIndex === destinationIndex);
        if (confirmedRetry) confirmedKpiPopstateRetryRef.current = null;

        const destinationChanged = hasNavigationDestinationChanged(
          activeRouteRef.current.id,
          route.id,
          activeLocationHrefRef.current,
          destinationHref
        );
        const applyDestination = (historyIndex: number | null) => {
          if (historyIndex !== null) historyIndexRef.current = historyIndex;
          if (route.module !== activeRouteModuleRef.current) {
            accountsWorkloadsRequestIdRef.current += 1;
            setAccountsWorkloadsRefreshing(false);
          }
          activeRouteRef.current = route;
          activeRouteModuleRef.current = route.module;
          setSelectedNavigationId(route.id);
          setExpandedNavigationKeys(getExpandedNavigationKeys(route.id));
          setActiveRoute(route);
        };
        if (!isConfirmedKpiRetry && destinationChanged && kpiNavigationGuardRef.current) {
          const restorationDelta = getRejectedPopstateDelta(historyIndexRef.current, event.state);
          if (restorationDelta !== null && restorationDelta !== 0) {
            pendingKpiPopstatePromptRef.current = {
              label: route.pageTitle,
              retry: () => {
                confirmedKpiPopstateRetryRef.current = { historyIndex: destinationIndex, href: destinationHref };
                window.history.go(-restorationDelta);
              }
            };
            restoringHistoryRef.current = true;
            window.history.go(restorationDelta);
            return;
          }
          const currentHref = activeLocationHrefRef.current;
          const currentRoute = activeRouteRef.current;
          window.history.replaceState(withHistoryIndex({ routeId: currentRoute.id }, historyIndexRef.current), "", currentHref);
          kpiNavigationGuardRef.current(route.pageTitle, () => {
            historyIndexRef.current += 1;
            window.history.pushState(withHistoryIndex({ routeId: route.id }, historyIndexRef.current), "", destinationHref);
            activeLocationHrefRef.current = destinationHref;
            applyDestination(historyIndexRef.current);
          });
          return;
        }
        if (!confirmWeeklyActivitiesNavigation(route, destinationHref)) {
          const restorationDelta = getRejectedPopstateDelta(historyIndexRef.current, event.state);
          if (restorationDelta !== null && restorationDelta !== 0) {
            restoringHistoryRef.current = true;
            window.history.go(restorationDelta);
          }
          return;
        }
        applyDestination(destinationIndex);

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
    const handleNavigate = (navigationId: string) => {
      const route = getNavigationRoute(navigationId);
      const destinationHref = new URL(getNavigationPath(route), window.location.href).href;
      const destinationChanged = hasNavigationDestinationChanged(
        activeRouteRef.current.id,
        route.id,
        activeLocationHrefRef.current,
        destinationHref
      );
      if (!destinationChanged) return;
      const navigate = () => {
        if (!confirmWeeklyActivitiesNavigation(route, destinationHref)) return;
        if (route.module !== activeRouteModuleRef.current) {
          accountsWorkloadsRequestIdRef.current += 1;
          setAccountsWorkloadsRefreshing(false);
        }
        activeRouteRef.current = route;
        activeRouteModuleRef.current = route.module;
        setSelectedNavigationId(navigationId);
        setExpandedNavigationKeys(getExpandedNavigationKeys(navigationId));
        setActiveRoute(route);
        historyIndexRef.current += 1;
        window.history.pushState(withHistoryIndex({ routeId: route.id }, historyIndexRef.current), "", getNavigationPath(route));
        requestAnimationFrame(() => {
          document.getElementById("cockpit")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      };
      const kpiGuard = kpiNavigationGuardRef.current;
      if (kpiGuard) kpiGuard(route.pageTitle, navigate);
      else navigate();
    };
    const handleNavigationSelectionAction = (event: CustomEvent<{ value: unknown }>) => {
      const navigationId = typeof event.detail.value === "string" ? event.detail.value : "";
      if (!navigationId || !isLeafNavigationId(navigationId)) return;
      handleNavigate(navigationId);
    };
    const handleExpandedNavigationChanged = (event: CustomEvent<{ value: KeySet<string> }>) => {
      setExpandedNavigationKeys(event.detail.value);
    };

    const handleFiscalYearChange = (nextFiscalYear: FiscalYear) => {
      if (activeRouteRef.current.module === "kpiPage" && kpiWriteActiveRef.current && nextFiscalYear !== fiscalYearRef.current) return;
      if (nextFiscalYear === fiscalYearRef.current) return;
      if (activeRouteRef.current.module === "weeklyActivities" && weeklyActivitiesDraftActiveRef.current) return;
      const changeFiscalYear = () => {
        accountsWorkloadsRequestIdRef.current += 1;
        setAccountsWorkloadsRefreshing(false);
        fiscalYearRef.current = nextFiscalYear;
        setFiscalYear(nextFiscalYear);
      };
      const kpiGuard = kpiNavigationGuardRef.current;
      if (kpiGuard) kpiGuard(nextFiscalYear, changeFiscalYear);
      else changeFiscalYear();
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
      const requestId = ++accountsWorkloadsRequestIdRef.current;
      setAccountsWorkloadsRefreshing(true);
      setAccountsWorkloadsLoadError("");
      try {
        const refreshed = await fetchAccountsWorkloads({ fiscalYear, ...accountsWorkloadsQuery });
        if (requestId !== accountsWorkloadsRequestIdRef.current) return;
        setAccountsWorkloadsRows((current) => ({ ...current, [fiscalYear]: refreshed.items }));
        setAccountWorkloadMetadata((current) => ({ ...current, parsedRowCount: refreshed.total }));
        setAccountsWorkloadsDataSource("api");
      } catch (error) {
        if (requestId !== accountsWorkloadsRequestIdRef.current) return;
        setAccountsWorkloadsLoadError(error instanceof Error ? error.message : "Accounts & Workloads refresh failed.");
      } finally {
        if (requestId === accountsWorkloadsRequestIdRef.current) setAccountsWorkloadsRefreshing(false);
      }
    };

    const handleAccountsWorkloadsQueryChange = async (nextQuery: Omit<AccountsWorkloadsListQuery, "fiscalYear">) => {
      const requestId = ++accountsWorkloadsRequestIdRef.current;
      setAccountsWorkloadsRefreshing(true);
      setAccountsWorkloadsLoadError("");
      try {
        const refreshed = await fetchAccountsWorkloads({ fiscalYear, ...nextQuery });
        if (requestId !== accountsWorkloadsRequestIdRef.current) return;
        setAccountsWorkloadsQuery(nextQuery);
        setAccountsWorkloadsRows((current) => ({ ...current, [fiscalYear]: refreshed.items }));
        setAccountWorkloadMetadata((current) => ({ ...current, parsedRowCount: refreshed.total }));
        setAccountsWorkloadsDataSource("api");
      } catch (error) {
        if (requestId !== accountsWorkloadsRequestIdRef.current) return;
        setAccountsWorkloadsLoadError(error instanceof Error ? error.message : "Accounts & Workloads query failed.");
      } finally {
        if (requestId === accountsWorkloadsRequestIdRef.current) setAccountsWorkloadsRefreshing(false);
      }
    };


    return (
      <div id="appContainer" class="oj-web-applayout-page kpi-shell">
        <Header
          appName={appName}
          userLogin={userLogin}
          navigationOpen={navigationOpen}
          onToggleNavigation={() => setNavigationOpen((value) => !value)}
          onLogout={onLogout}
        />
        <div class={navigationOpen ? "kpi-mobile-scrim is-open" : "kpi-mobile-scrim"} onClick={closeNavigation}></div>
        <div class="kpi-shell__body">
          <aside id="kpiSideNavigation" class={navigationOpen ? "kpi-side-nav oj-bg-neutral-170 oj-color-invert is-open" : "kpi-side-nav oj-bg-neutral-170 oj-color-invert is-closed"} aria-label="KPI workspace navigation">
            <oj-navigation-list
              class="kpi-navigation-list"
              data={navigationDataProvider}
              drillMode="sliding"
              expanded={expandedNavigationKeys}
              item={{ selectable: (context) => !context.data.children }}
              rootLabel="Home"
              selection={selectedNavigationId}
              onexpandedChanged={handleExpandedNavigationChanged}
              onojSelectionAction={handleNavigationSelectionAction}
              aria-label="KPI navigation">
              <template slot="itemTemplate" render={renderNavigationItem}></template>
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
            weeklyActivitiesDraftActive={weeklyActivitiesDraftActive}
            kpiWriteActive={kpiWriteActive}
            accountsWorkloadsDatasetAvailable={!accountsWorkloadsLoading && !accountsWorkloadsLoadError && (fiscalYear === accountWorkloadMetadata.fiscalYear || accountsWorkloadsRows[fiscalYear].length > 0)}
            accountsWorkloadsLoading={accountsWorkloadsLoading}
            accountsWorkloadsRefreshing={accountsWorkloadsRefreshing}
            onAccountsWorkloadsRefresh={() => void handleAccountsWorkloadsRefresh()}
            accountWorkloadMetadata={accountWorkloadMetadata}
            dataset={fiscalYearData[fiscalYear]}
            kpiDataset={liveKpiDataset}
            kpiDatasetLoading={kpiDatasetLoading}
            kpiDatasetError={kpiDatasetError}
            fiscalYear={fiscalYear}
            fiscalYears={fiscalYears}
            guideOpen={guideOpen}
            guideDataFiscalYear={guideDataFiscalYear}
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
                const localRows = applyPermanentDeletesLocally(rows, permanentDeleteIds);
                const localResult = { items: localRows, total: localRows.length, ...(draftFxRate ? { fxRate: draftFxRate } : {}) };
                setAccountsWorkloadsRows((current) => ({ ...current, [fiscalYear]: localRows }));
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
            onAccountsWorkloadsQueryChange={(nextQuery) => void handleAccountsWorkloadsQueryChange(nextQuery)}
            onAccountsWorkloadsDraftStateChange={setAccountsWorkloadsDraftActive}
            onWeeklyActivitiesDraftStateChange={(active) => {
              weeklyActivitiesDraftActiveRef.current = active;
              setWeeklyActivitiesDraftActive(active);
            }}
            onKpiNavigationGuardChange={handleKpiNavigationGuardChange}
            onKpiWriteStateChange={(active) => {
              kpiWriteActiveRef.current = active;
              setKpiWriteActive(active);
            }}
            onFiscalYearChange={handleFiscalYearChange}
            onNavigate={handleNavigate}
          />
        </div>
        <Footer />
      </div>
    );
}

export const App = registerCustomElement(
  "app-root",
  ({ appName = "My KPI & Account Planner" }: Props) => {
    const [session, setSession] = useState<AuthSession | null>(null);
    const [authChecking, setAuthChecking] = useState(true);

    useEffect(() => {
      Context.getPageContext().getBusyContext().applicationBootstrapComplete();
    }, []);

    useEffect(() => {
      let active = true;
      void getAuthenticatedSession()
        .then((verifiedSession) => {
          if (active) setSession(verifiedSession);
        })
        .catch(() => {
          if (active) setSession(null);
        })
        .finally(() => {
          if (active) setAuthChecking(false);
        });
      return () => {
        active = false;
      };
    }, []);

    useEffect(() => {
      if (authChecking || session || typeof window === "undefined") return undefined;

      const keepLoginAtHomePath = () => {
        if (window.location.pathname !== "/" || window.location.search || window.location.hash) {
          window.history.replaceState(null, "", "/");
        }
      };

      keepLoginAtHomePath();
      window.addEventListener("popstate", keepLoginAtHomePath);
      return () => window.removeEventListener("popstate", keepLoginAtHomePath);
    }, [authChecking, session]);

    const handleAuthenticated = useCallback((authenticatedSession: AuthSession) => {
      window.history.replaceState(null, "", "/");
      setSession(authenticatedSession);
    }, []);

    const handleLogout = useCallback(() => {
      void logoutUser()
        .then(() => {
          window.history.replaceState(null, "", "/");
          window.scrollTo({ top: 0, left: 0 });
          setSession(null);
        })
        .catch(() => undefined);
    }, []);

    if (authChecking) {
      return <main class="kap-login" aria-label="Checking sign-in session" />;
    }
    return session
      ? <AuthenticatedApp appName={appName} userLogin={session.userId} onLogout={handleLogout} />
      : <LoginPage appName={appName} onAuthenticated={handleAuthenticated} />;
  }
);
