import { h } from "preact";
import type { AuthSession } from "../auth/authSession";
import { navItems, NavigationItem } from "../data/kpiMockData";
import type { NavigationRouteDefinition } from "./navigationRoutes";
import "ojs/ojbutton";
import "ojs/ojmenu";
import "ojs/ojoption";
import "ojs/ojtoolbar";

type Props = Readonly<{
  activeRoute: NavigationRouteDefinition;
  access: AuthSession["access"];
  onNavigate: (navigationId: string) => void;
}>;

type DirectRouteItem = Readonly<{
  id: "profile" | "users";
  label: string;
}>;

const accountRouteItems: readonly DirectRouteItem[] = [
  { id: "profile", label: "Profile" },
  { id: "users", label: "Users" }
];

function isGroupCurrent(item: NavigationItem, activeRouteId: string) {
  return item.children?.some((child) => child.id === activeRouteId) ?? false;
}

export function getVisibleAccountRouteItems(access: AuthSession["access"]) {
  return accountRouteItems.filter((item) => item.id !== "users" || access === "Admin");
}

export function PageNavigationToolbar({ activeRoute, access, onNavigate }: Props) {
  const activeRouteId = activeRoute.id;
  const visibleAccountRoutes = getVisibleAccountRouteItems(access);

  return (
    <nav class="kpi-page-menu" aria-label="Page navigation">
      <oj-toolbar chroming="borderless" aria-label="Application pages">
        {navItems.map((item) => {
          if (!item.children) {
            const isCurrent = item.id === activeRouteId;
            return (
              <span key={item.id} class={isCurrent ? "kpi-page-menu__item is-current" : "kpi-page-menu__item"}>
                <oj-button
                  chroming="borderless"
                  aria-current={isCurrent ? "page" : undefined}
                  onojAction={() => onNavigate(item.id)}>
                  {item.label}
                </oj-button>
              </span>
            );
          }

          const isCurrentGroup = isGroupCurrent(item, activeRouteId);
          return (
            <span key={item.id} class={isCurrentGroup ? "kpi-page-menu__item is-current" : "kpi-page-menu__item"}>
              <oj-menu-button
                chroming="borderless"
                aria-label={isCurrentGroup ? `${item.label}, current section` : `${item.label} pages`}>
                {item.label}
                <oj-menu
                  slot="menu"
                  aria-label={`${item.label} pages`}
                  onojMenuAction={(event) => onNavigate(String(event.detail.selectedValue))}>
                  {item.children.map((child) => (
                    <oj-option
                      key={child.id}
                      value={child.id}
                      aria-current={child.id === activeRouteId ? "page" : undefined}>
                      {child.label}
                    </oj-option>
                  ))}
                </oj-menu>
              </oj-menu-button>
            </span>
          );
        })}
        <span class="kpi-page-menu__separator" role="separator" aria-orientation="vertical"></span>
        {visibleAccountRoutes.map((item) => {
          const isCurrent = item.id === activeRouteId;
          return (
            <span key={item.id} class={isCurrent ? "kpi-page-menu__item is-current" : "kpi-page-menu__item"}>
              <oj-button
                chroming="borderless"
                aria-current={isCurrent ? "page" : undefined}
                onojAction={() => onNavigate(item.id)}>
                {item.label}
              </oj-button>
            </span>
          );
        })}
      </oj-toolbar>
    </nav>
  );
}
