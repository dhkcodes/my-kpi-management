export type SubmittedOpportunityWrite = Readonly<{
  workloadId: number;
  originalId: number | null;
  deleted: boolean;
}>;

export type ConfirmedOpportunityWorkload = Readonly<{
  id: number;
  deals: ReadonlyArray<Readonly<{ id: number }>>;
}>;

/**
 * The hierarchy returned from a successful save is authoritative. Validate only
 * stable identities here: the backend may normalize text, nulls, currencies, or
 * generated values, so exact draft-value comparison would turn a committed save
 * into a false client-side failure.
 *
 * New rows cannot be paired one-by-one because the response contract does not
 * echo deal clientIds. Instead, confirm the number of newly assigned server IDs
 * per workload relative to the pre-save baseline; response order is irrelevant.
 */
export const validateConfirmedOpportunityWrites = (
  submissions: ReadonlyArray<SubmittedOpportunityWrite>,
  workloads: ReadonlyArray<ConfirmedOpportunityWorkload>,
  baselineWorkloads: ReadonlyArray<ConfirmedOpportunityWorkload>,
) => {
  const dealsByWorkload = new Map(
    workloads.map((workload) => [workload.id, workload.deals] as const),
  );
  const baselineIdsByWorkload = new Map(
    baselineWorkloads.map(
      (workload) => [workload.id, new Set(workload.deals.map((deal) => deal.id))] as const,
    ),
  );

  for (const submission of submissions) {
    const confirmedDeals = dealsByWorkload.get(submission.workloadId);
    if (!confirmedDeals) {
      throw new Error("Saved Opportunity workload was not returned.");
    }

    if (submission.originalId === null) continue;
    const returned = confirmedDeals.some(
      (deal) => deal.id === submission.originalId,
    );
    if (submission.deleted && returned) {
      throw new Error("Deleted Opportunity was still returned.");
    }
    if (!submission.deleted && !returned) {
      throw new Error("Saved Opportunity was not returned.");
    }
  }

  const newSubmissionsByWorkload = new Map<number, number>();
  for (const submission of submissions) {
    if (submission.originalId !== null || submission.deleted) continue;
    newSubmissionsByWorkload.set(
      submission.workloadId,
      (newSubmissionsByWorkload.get(submission.workloadId) ?? 0) + 1,
    );
  }
  for (const [workloadId, submittedCount] of Array.from(newSubmissionsByWorkload)) {
    const confirmedDeals = dealsByWorkload.get(workloadId) ?? [];
    const baselineIds = baselineIdsByWorkload.get(workloadId) ?? new Set<number>();
    const returnedNewIds = new Set(
      confirmedDeals
        .map((deal) => deal.id)
        .filter((id) => id > 0 && !baselineIds.has(id)),
    );
    if (returnedNewIds.size < submittedCount) {
      throw new Error(
        "Opportunity save succeeded, but the returned result was incomplete. Reload before retrying.",
      );
    }
  }
};
