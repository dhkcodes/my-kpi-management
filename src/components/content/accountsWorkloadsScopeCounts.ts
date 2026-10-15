import { AccountsWorkloadsHierarchy } from "../../data/accountsWorkloadsApi";

/** The hierarchy is already filtered by the server's search / archived query.
 * Match visible opportunity rows: deleted deals stay hidden even with archived AWs.
 * Record IDs (not optional opportunity numbers) identify distinct opportunities.
 */
export function accountsWorkloadsScopeCounts(hierarchy: AccountsWorkloadsHierarchy) {
  const accounts = new Set<number>();
  const opportunities = new Set<number>();
  for (const account of hierarchy.accounts) {
    accounts.add(account.id);
    for (const workload of account.workloads) {
      for (const deal of workload.deals) if (!deal.deleted) opportunities.add(deal.id);
    }
  }
  return { accounts: accounts.size, opportunities: opportunities.size };
}
