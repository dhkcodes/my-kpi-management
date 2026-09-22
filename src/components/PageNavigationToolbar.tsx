import { h } from "preact";
import type { AuthSession } from "../auth/authSession";
import { filterNavigationItems } from "../auth/menuPermissions";
import { navItems, NavigationItem } from "../data/kpiMockData";
import type { NavigationRouteDefinition } from "./navigationRoutes";
import "ojs/ojbutton";
import "ojs/ojmenu";
import "ojs/ojoption";
import "ojs/ojtoolbar";

type Props = Readonly<{
  activeRoute: NavigationRouteDefinition;
  profile: AuthSession;
  onNavigate: (navigationId: string) => void;
}>;

type PagePath = Readonly<{
  parent: NavigationItem | null;
  current: NavigationItem;
}>;

export function getPagePath(activeRouteId: string, items: NavigationItem[] = navItems): PagePath | null {
  if (activeRouteId === "profile" || activeRouteId === "users") return null;
  for (const item of items) {
    if (item.id === activeRouteId) return { parent: null, current: item };
    const child = item.children?.find((candidate) => candidate.id === activeRouteId);
    if (child) return { parent: item, current: child };
  }
  return null;
}

export function PageNavigationToolbar({ activeRoute, profile, onNavigate }: Props) {
  const path = getPagePath(activeRoute.id, filterNavigationItems(navItems, profile));
  if (!path) return null;
  const isHome = path.current.id === "home";
  if (isHome) return null;

  return (
    <nav class="kpi-page-menu kpi-page-path" aria-label="Current page path">
      <oj-toolbar chroming="borderless" aria-label="Current page path">
        <span class="kpi-page-menu__item">
          <oj-button chroming="borderless" onojAction={() => onNavigate("home")}>
            Home
          </oj-button>
        </span>
        {path.parent && <>
          <span class="kpi-page-menu__chevron" aria-hidden="true">›</span>
          <span class="kpi-page-menu__item is-section">
            <oj-menu-button chroming="borderless" aria-label={`${path.parent.label} pages`}>
              {path.parent.label}
              <oj-menu slot="menu" aria-label={`${path.parent.label} pages`}
                onojMenuAction={(event) => onNavigate(String(event.detail.selectedValue))}>
                {path.parent.children?.map((child) => <oj-option key={child.id} value={child.id}
                  aria-current={child.id === activeRoute.id ? "page" : undefined}>{child.label}</oj-option>)}
              </oj-menu>
            </oj-menu-button>
          </span>
          <span class="kpi-page-menu__chevron" aria-hidden="true">›</span>
          <span class="kpi-page-menu__item is-current kpi-page-menu__current-label">
            <oj-button chroming="borderless" aria-current="page" onojAction={() => onNavigate(path.current.id)}>
              {path.current.label}
            </oj-button>
          </span>
        </>}
      </oj-toolbar>
    </nav>
  );
}
