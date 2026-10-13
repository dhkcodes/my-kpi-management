# KPI Activities common design 2 / Records Summary

## Scope and recovery
- Base: production VERSION `9aa7e42da7dde417a49a19bc6e57dffab7b48790`.
- Production original: `/home/opc/.local/share/my-kpi-management/releases/20261013T145622Z-consumption-three-refinements`.
- Isolated worktree: `kap-kpi-common-design-2`; existing other worktrees/untracked evidence left untouched.
- Recovery bundle: `/home/opc/engineering-git-workspace/backups/kap-kpi-common-design-2-prechange.bundle`.
- No backend, database, import, aggregate, formula, MTD calculation or shared global CSS edits.

## JET element selection (20.1.3 installed)
Requirements are grouped by shared documented component/pattern; existing supported components are retained.

| Requirement | Candidates and selection | API/state/accessibility |
|---|---|---|
| Breadcrumb alignment, toolbar gaps, compact rows and radius | Retain PageShell + native semantic layout; isolate KPI-owned CSS. Changing global theme rejected because Consumption must stay identical. | Existing navigation landmark; measured bounding rectangles vs Analysis. |
| FY/reload loading | Core Pack progress vs existing legacy oj-progress-bar / oj-progress-circle. Retain existing supported JET composition; no new incompatible component dependency. | `value=-1`, circle `size=sm`; request generation guard, maintain last successful data; live busy state and accessible label. |
| Button size/type and save progress | Core Pack button vs existing oj-button/native toolbar buttons. Retain existing functional elements; documented public CSS custom properties only. | Button disabled/busy, synchronous duplicate-write lock; no JET internal-class override. |
| Workload loading/empty/error | Existing editable cell and semantic option list, rather than replacing DataProvider/editor contract. | State-specific loading vs completed empty result; errors preserve entered values. |
| Success notification policy | Scoped KPI message decision instead of global banner change. | Keep error/warning; empty results in table. |
| Guide/Quarter/Stage panels | Existing independent buttons and semantic sections/tables; scoped domain layouts rather than global panel/theme override. | Existing collapsed defaults, aria-expanded, quarter selection, live values retained. |
| Radial cards | oj-chart gauge vs two compact CSS domain rings and two numeric semantic cards. Existing live metric values remain source; illustration-only sample values prohibited. | Accessible progress labels, clamp visual arc only, mobile adaptive grid. |
| Quarter badge center | Semantic table cell alignment scoped to KPI overview. | Measure cell and badge centers; header consistency. |
| Consumption Summary | Existing semantic table/expand control; domain-specific comparison styling only under Records Summary. | Existing Forecast vs mixed composition; preserve QoQ, source values, filtered order, MTD; horizontal overflow remains contained. |

Official API references (validate installed type definitions for actual 20.1 props):
- https://www.oracle.com/webfolder/technetwork/jet/jsdocs/oj.ojProgressCircle.html
- https://www.oracle.com/webfolder/technetwork/jet/jsdocs/oj.ojProgressBar.html
- https://www.oracle.com/webfolder/technetwork/jet/jsdocs/oj.ojButton.html
- Installed `node_modules/@oracle/oraclejet/dist/types/ojprogress-circle`, `ojprogress-bar`, `ojbutton`.

## Design originals
- Original 7 thread images: cached PNGs `0fee55b5ea0c`, `2c87ae743ab9`, `8f16000eb7d5`, `f1882c52f8d6`, `ae487a60b80d`, `c6ac4031af9b`, `9a9a0728e77b` (visually reviewed, last = 03 Radial Focus).
- `doc_27165c62c6ee_04-B.html`, `doc_48d97a72dd1d_04-D1.html`, `doc_d753bc4b057b_comparison.html` in cache/documents.

## Latest executable checks
- `npx ojet build --release` and `git diff --check`: passed.
- `MODE=local node /home/opc/tmp/kap-kpi-common2-verify.cjs`: latest authenticated real-GET run covered 11 routes on desktop and iPhone16; page/asset errors 0, API failures 0, application mutations 0. Evidence: `kap-kpi-common2-local/report.json`.
- `node /home/opc/tmp/kap-kpi-common2-states.cjs`: all 8 device-state checks passed. FY input blocked while loading, blocked input discarded, previous contents retained, late responses stable; real workload GET delayed; intercepted save failure preserves draft and warning, synchronous duplicate-save block, no Saving modal. Two batch POSTs were intercepted (one per device); real production data writes 0. Error-message check uses a shadow-DOM-aware Playwright text locator (document.body.innerText cannot see JET message text).
- Mobile cancellation: focused stabilized native-touch checks passed for all seven tabs (A/B/C1/C2/D1/F/H) on both unchanged production and final local candidate: 14/14; no writes/page errors. Prior click/BusyContext close timeouts did not reproduce after waiting for readiness and completing native touch/overlay closure. No dialog source fix was made.
- Final dimensions: KPI buttons/Guide/Reload 36px; text 11.84px equals Records Import/Export. Breadcrumb right edges equal Analysis on both viewports (1393px desktop / 368.8125px mobile); Overview badge center delta <=0.008px; Reload-containing toolbar top/bottom padding 6px.
- Non-Summary Records and Forecast-vs-Actual text hashes and control styles unchanged on both viewports. Analysis control styles unchanged; desktop text differs only in two transient JET chart Loaded announcements. Final desktop/mobile images reviewed against 04-B/04-D1/comparison; no demonstration amounts injected. Evidence: `kap-kpi-common2-local/preservation.json`, `spacing.json`, `kap-kpi-common2-cancel-isolation/report.json`.

## Verification boundary
Fresh desktop 1440x1000 and iPhone 16 393x852 captures of 8 KPI + 3 Consumption routes; real authenticated production GET APIs. Local candidate static asset interception does not replace API results. Browser save/empty/error controlled scenarios must be separately labelled; operational data writes are blocked. UAT visual preference is representative's final judgment, not a substitute for functional evidence.
