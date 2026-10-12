export type ConsumptionImportFlowResult<T> =
  | Readonly<{ state: "COMPLETE"; receipt: T | null; reconciled: boolean }>
  | Readonly<{ state: "REFRESH_FAILED"; receipt: T | null; reconciled: boolean; refreshError: unknown }>
  | Readonly<{ state: "UNCONFIRMED"; error: unknown }>
  | Readonly<{ state: "STORAGE_FAILED"; error: unknown }>;

export type ConsumptionImportFlowActions<T> = Readonly<{
  apply: () => Promise<T>;
  reconcile: () => Promise<boolean>;
  refresh: () => Promise<void>;
  isConfirmedStorageFailure: (error: unknown) => boolean;
}>;

/**
 * Executes Apply exactly once. Ambiguous outcomes are reconciled read-only and
 * are never promoted to success unless every expected fingerprint is APPLIED.
 */
export async function runConsumptionImportFlow<T>(
  actions: ConsumptionImportFlowActions<T>
): Promise<ConsumptionImportFlowResult<T>> {
  let receipt: T | null=null;
  let reconciled=false;
  try {
    receipt=await actions.apply();
  } catch (error) {
    if(actions.isConfirmedStorageFailure(error))return {state:"STORAGE_FAILED",error};
    try {
      if(!await actions.reconcile())return {state:"UNCONFIRMED",error};
      reconciled=true;
    } catch (reconciliationError) {
      return {state:"UNCONFIRMED",error:reconciliationError};
    }
  }
  try {
    await actions.refresh();
    return {state:"COMPLETE",receipt,reconciled};
  } catch (refreshError) {
    return {state:"REFRESH_FAILED",receipt,reconciled,refreshError};
  }
}
