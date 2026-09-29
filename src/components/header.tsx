/** @license UPL-1.0 */
import { h } from "preact";
import "ojs/ojbutton";
import "ojs/ojtoolbar";
import "ojs/ojmenu";
import "ojs/ojavatar";
import { getProfileInitials, type AuthSession } from "../auth/authSession";

const KAP_HEADER_LOGOS = [
  { variant: "gold", src: "styles/images/kap-header-gold.png", iconSrc: "styles/images/kap-header-gold-icon.png" },
  { variant: "purple", src: "styles/images/kap-header-purple.png", iconSrc: "styles/images/kap-header-purple-icon.png" },
  { variant: "blue", src: "styles/images/kap-header-blue.png", iconSrc: "styles/images/kap-header-blue-icon.png" },
  { variant: "coral", src: "styles/images/kap-header-coral.png", iconSrc: "styles/images/kap-header-coral-icon.png" }
] as const;

export const selectKapHeaderLogo = (randomValue = Math.random()) =>
  KAP_HEADER_LOGOS[Math.min(KAP_HEADER_LOGOS.length - 1, Math.floor(Math.max(0, randomValue) * KAP_HEADER_LOGOS.length))];

// Module scope keeps one variant stable throughout SPA navigation; a full reload evaluates it again.
const selectedKapHeaderLogo = selectKapHeaderLogo();


type Props = Readonly<{
  appName: string;
  profile: AuthSession;
  navigationOpen: boolean;
  onToggleNavigation: () => void;
  onNavigate: (routeId: string) => void;
  onLogout: () => void;
}>;

export function Header({ profile, navigationOpen, onToggleNavigation, onNavigate, onLogout }: Props) {
  return (
    <header role="banner" class="oj-web-applayout-header kpi-header">
      <div class="oj-flex-bar oj-sm-align-items-center kpi-header__bar">
        <div class="oj-flex-bar-start oj-sm-align-items-center kpi-header__start">
          <span class="kpi-header__toggle">
            <oj-button id="navigationToggle" chroming="borderless" display="icons" aria-label={navigationOpen ? "Close menu" : "Open menu"} aria-controls="kpiNavigationPopup" aria-expanded={navigationOpen ? "true" : "false"} onojAction={onToggleNavigation}>
              <span slot="startIcon" class={navigationOpen ? "oj-ux-ico-close" : "oj-ux-ico-menu"}></span>
            </oj-button>
          </span>
          <div class="kpi-header__brand" aria-label="KAP">
            <picture class="kap-header-picture">
              <source media="(max-width: 720px)" srcSet={selectedKapHeaderLogo.iconSrc} />
              <img class="kap-header-wordmark" src={selectedKapHeaderLogo.src} alt="KAP" data-variant={selectedKapHeaderLogo.variant} />
            </picture>
          </div>
        </div>
        <div class="oj-flex-bar-end kpi-header__end">
          <oj-toolbar aria-label="User actions">
            <oj-menu-button id="userMenu" display="all" chroming="borderless" aria-label="User profile menu">
              <oj-avatar slot="startIcon" initials={getProfileInitials(profile.displayName)} size="2xs" shape="circle"></oj-avatar>
              <span class="kpi-profile-email">{profile.displayName}</span>
              <span slot="endIcon" class="oj-component-icon oj-button-menu-dropdown-icon"></span>
              <oj-menu id="profileMenuItems" slot="menu" onojMenuAction={(event) => {
                const value = event.detail.selectedValue;
                if (value === "logout") onLogout();
                else if (value === "profile" || (profile.access === "Admin" && value === "users")) onNavigate(String(value));
              }}>
                <oj-option id="signedInUser" value="identity" disabled>{profile.loginId}</oj-option>
                <oj-option value="profile">Profile</oj-option>
                {profile.access === "Admin" && <oj-option value="users">Users</oj-option>}
                <oj-option id="logout" value="logout">Logout</oj-option>
              </oj-menu>
            </oj-menu-button>
          </oj-toolbar>
          <img class="kpi-header__oracle-logo" src="styles/images/oracle_logo.svg" alt="Oracle" />
        </div>
      </div>
    </header>
  );
}
