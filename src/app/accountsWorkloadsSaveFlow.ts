import { beginAppBusy } from "./appBusy";

type AccountsWorkloadsSaveFlow = Readonly<{
  saveAwDrafts: () => Promise<boolean>;
  saveDealDrafts: () => Promise<boolean>;
  reload: () => Promise<void>;
}>;

/**
 * Keeps the application busy for one complete user save transaction while
 * preserving the existing AW save -> Opportunity save -> authoritative reload
 * sequence. Individual API calls may also contribute nested busy scopes.
 */
export const runAccountsWorkloadsSaveFlow = async ({
  saveAwDrafts,
  saveDealDrafts,
  reload,
}: AccountsWorkloadsSaveFlow): Promise<boolean> => {
  const finishBusy = beginAppBusy();
  try {
    const awSaved = await saveAwDrafts();
    if (!awSaved) return false;
    const dealsSaved = await saveDealDrafts();
    if (!dealsSaved) return false;
    await reload();
    return true;
  } finally {
    finishBusy();
  }
};
