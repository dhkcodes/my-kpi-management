export type OpportunitySaveLock = Readonly<{
  isLocked: () => boolean;
  isAwaitingConfirmation: () => boolean;
  tryStart: <T>(drafts: Iterable<T>) => readonly T[] | null;
  tryMutation: (mutation: () => void) => boolean;
  markAwaitingConfirmation: () => void;
  pendingSnapshot: () => readonly unknown[] | null;
  confirmReconciled: () => void;
  release: () => void;
}>;

/**
 * Synchronous gate for opportunity draft saves.
 *
 * React state alone is not sufficient because another event can run before the
 * saving state is rendered. This gate locks in the same call stack that takes
 * the submission snapshot and remains locked until response processing ends.
 */
export const createOpportunitySaveLock = (): OpportunitySaveLock => {
  let locked = false;
  let awaitingConfirmation = false;
  let snapshot: readonly unknown[] | null = null;

  return {
    isLocked: () => locked,
    isAwaitingConfirmation: () => awaitingConfirmation,
    tryStart: <T>(drafts: Iterable<T>) => {
      if (locked) return null;
      locked = true;
      snapshot = Object.freeze(Array.from(drafts));
      return snapshot as readonly T[];
    },
    tryMutation: (mutation: () => void) => {
      if (locked) return false;
      mutation();
      return true;
    },
    markAwaitingConfirmation: () => {
      if (!locked || !snapshot) {
        throw new Error("An Opportunity save must be active before confirmation can be pending.");
      }
      awaitingConfirmation = true;
    },
    pendingSnapshot: () => snapshot,
    confirmReconciled: () => {
      awaitingConfirmation = false;
      snapshot = null;
      locked = false;
    },
    release: () => {
      if (awaitingConfirmation) return;
      snapshot = null;
      locked = false;
    },
  };
};
