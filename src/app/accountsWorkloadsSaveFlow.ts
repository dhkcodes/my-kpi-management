import { beginAppBusy } from "./appBusy";

type AccountsWorkloadsSaveFlow = Readonly<{
  saveAwDrafts: () => Promise<boolean>;
  saveDealDrafts: () => Promise<boolean>;
  prepareDealSave?: () => () => Promise<boolean>;
  reload: () => Promise<void>;
}>;

export type AccountsWorkloadsOpportunitySaveFlow = Readonly<{
  saveDealDrafts: () => Promise<boolean>;
}>;

/** Keep the global busy scope continuous across Opportunity POST and confirmation GET. */
export const runAccountsWorkloadsOpportunitySaveFlow = async ({
  saveDealDrafts,
}: AccountsWorkloadsOpportunitySaveFlow): Promise<boolean> => {
  const finishBusy = beginAppBusy();
  try {
    return await saveDealDrafts();
  } finally {
    finishBusy();
  }
};

/**
 * Keeps the application busy for one complete user save transaction while
 * preserving the existing AW save -> Opportunity save -> authoritative reload
 * sequence. Individual API calls may also contribute nested busy scopes.
 */
export const runAccountsWorkloadsSaveFlow = async ({
  saveAwDrafts,
  saveDealDrafts,
  prepareDealSave,
  reload,
}: AccountsWorkloadsSaveFlow): Promise<boolean> => {
  const finishBusy = beginAppBusy();
  try {
    // Capture the current Opportunity submission before AW save state updates can
    // re-render the page or invalidate the event handler's render closure.
    const savePreparedDeals = prepareDealSave?.() ?? saveDealDrafts;
    const awSaved = await saveAwDrafts();
    if (!awSaved) return false;
    const dealsSaved = await savePreparedDeals();
    if (!dealsSaved) return false;
    await reload();
    return true;
  } finally {
    finishBusy();
  }
};
