import { ComponentChildren, h } from "preact";
import "ojs/ojbutton";

type Props = Readonly<{
  breadcrumb?: ComponentChildren;
  onNavigate: (routeId: string) => void;
}>;

export function AccountManagementOverviewPage({ breadcrumb, onNavigate }: Props) {
  return (
    <section class="accounts-workloads-page account-management-overview" aria-labelledby="accountManagementOverviewTitle">
      <div class="accounts-workloads-title-row">
        <div>
          {breadcrumb}
          <h1 id="accountManagementOverviewTitle">Account Management</h1>
          <p>Account, workload, and deal management in one fiscal-year-independent workspace.</p>
        </div>
      </div>
      <article class="kap-empty-state account-management-overview__ready-soon">
        <span class="oj-ux-ico-clock" aria-hidden="true"></span>
        <h2>Overview coming soon</h2>
        <p>The management workspace is ready now. The overview will add portfolio signals and summaries in a future release.</p>
        <oj-button chroming="callToAction" onojAction={() => onNavigate("accounts-workloads")}>
          Open Accounts &amp; Workloads
        </oj-button>
      </article>
    </section>
  );
}
