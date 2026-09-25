export type OpportunitySaveLock = Readonly<{
  isLocked: () => boolean;
  tryStart: <T>(drafts: Iterable<T>) => readonly T[] | null;
  tryMutation: (mutation: () => void) => boolean;
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

  return {
    isLocked: () => locked,
    tryStart: <T>(drafts: Iterable<T>) => {
      if (locked) return null;
      locked = true;
      return Object.freeze(Array.from(drafts));
    },
    tryMutation: (mutation: () => void) => {
      if (locked) return false;
      mutation();
      return true;
    },
    release: () => {
      locked = false;
    },
  };
};
