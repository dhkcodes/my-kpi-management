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
import "ojs/ojnavigationlist";

type Props = Readonly<{
  appName?: string;
  userLogin?: string;
}>;

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

    useEffect(() => {
      Context.getPageContext().getBusyContext().applicationBootstrapComplete();
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
            dataset={fiscalYearData[fiscalYear]}
            fiscalYear={fiscalYear}
            fiscalYears={fiscalYears}
            guideOpen={guideOpen}
            onCloseGuide={() => setGuideOpen(false)}
            onOpenGuide={() => setGuideOpen(true)}
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
