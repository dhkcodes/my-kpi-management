import { h } from "preact";
import { useMemo } from "preact/hooks";
import { AccountWorkloadRow } from "../../data/accountsWorkloadsMockData";
import { FiscalYear } from "../../data/kpiMockData";
import { summarizeAccountsWorkloadsByAccount } from "../../data/accountsWorkloadsPulseV2";

const compactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

type Props = Readonly<{
  fiscalYear: FiscalYear;
  rows: AccountWorkloadRow[];
  dataAvailable: boolean;
}>;

export function MyCustomers360Page({ fiscalYear, rows, dataAvailable }: Props) {
  const accounts = useMemo(() => summarizeAccountsWorkloadsByAccount(rows), [rows]);

  return (
    <section class="my-customers-360-page" aria-labelledby="myCustomers360Title">
      <div class="my-customers-360-page__header">
        <div>
          <span class="kpi-eyebrow">My Customers 360</span>
          <h2 id="myCustomers360Title">Account Portfolio</h2>
          <p class="kpi-panel__description">
            {fiscalYear} account totals use the same saved Accounts &amp; Workloads rows as Home and the detail grid.
          </p>
        </div>
        {dataAvailable && (
          <div class="my-customers-360-page__total" aria-label={`${accounts.length} active accounts`}>
            <strong>{accounts.length}</strong>
            <span>Active accounts</span>
          </div>
        )}
      </div>

      {!dataAvailable ? (
        <div class="accounts-pulse-v2__unavailable" role="status">
          <strong>Accounts &amp; Workloads data is not available for {fiscalYear}</strong>
          <span>Select a fiscal year with a loaded or saved dataset.</span>
        </div>
      ) : (
        <div class="my-customers-360-table-wrap">
          <table class="my-customers-360-table">
            <thead>
              <tr>
                <th>Account</th>
                <th class="is-numeric">Workloads</th>
                <th class="is-numeric">ARR</th>
                <th class="is-numeric">ACR</th>
                <th class="is-numeric">Targeted</th>
                <th class="is-numeric">Important</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.account}>
                  <th scope="row">{account.account}</th>
                  <td class="is-numeric">{account.workloads}</td>
                  <td class="is-numeric">{compactCurrency.format(account.arrUsd)}</td>
                  <td class="is-numeric">{compactCurrency.format(account.acrUsd)}</td>
                  <td class="is-numeric">{account.targetCoverageWorkloads} / {account.workloads}</td>
                  <td class="is-numeric">{account.importantWorkloads}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
