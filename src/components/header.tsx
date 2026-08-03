/*
 * @license
 * Copyright (c) 2014, 2026, Oracle and/or its affiliates.
 * Licensed under The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { h } from "preact";
import "ojs/ojbutton";
import "ojs/ojtoolbar";
import "ojs/ojmenu";

type Props = Readonly<{
  appName: string;
  userLogin: string;
  navigationOpen: boolean;
  onToggleNavigation: () => void;
}>;

export function Header({ appName, userLogin, navigationOpen, onToggleNavigation }: Props) {
  return (
    <header role="banner" class="oj-web-applayout-header kpi-header">
      <div class="oj-flex-bar oj-sm-align-items-center kpi-header__bar">
        <div class="oj-flex-bar-start oj-sm-align-items-center kpi-header__start">
          <oj-button
            id="navigationToggle"
            chroming="borderless"
            display="icons"
            aria-label="Toggle navigation"
            aria-controls="kpiSideNavigation"
            aria-expanded={navigationOpen ? "true" : "false"}
            onojAction={onToggleNavigation}>
            <span slot="startIcon" class="oj-ux-ico-menu"></span>
            Menu
          </oj-button>
          <div class="kpi-brand-lockup" aria-label="Oracle KPI cockpit">
            <img class="oj-icon demo-oracle-icon" title="Oracle Logo" alt="Oracle Logo" />
          </div>
          <div class="kpi-title-block">
            <h1 class="oj-web-applayout-header-title" title={appName}>{appName}</h1>
          </div>
        </div>
        <div class="oj-flex-bar-end kpi-header__end">
          <oj-toolbar aria-label="User actions">
            <oj-menu-button id="userMenu" display="all" chroming="borderless">
              <span class="oj-ux-ico-user kpi-profile-icon" aria-hidden="true"></span>
              <span class="kpi-profile-email">{userLogin}</span>
              <span slot="endIcon" class="oj-component-icon oj-button-menu-dropdown-icon"></span>
              <oj-menu id="menu1" slot="menu">
                <oj-option id="pref" value="pref">Preferences</oj-option>
                <oj-option id="help" value="help">Help</oj-option>
                <oj-option id="about" value="about">About</oj-option>
              </oj-menu>
            </oj-menu-button>
          </oj-toolbar>
        </div>
      </div>
    </header>
  );
}
