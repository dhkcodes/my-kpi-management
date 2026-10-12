export type SingleFlightSwapController<T> = Readonly<{
  isBusy: () => boolean;
  run: (load: () => Promise<T>, apply: (value: T) => void) => Promise<boolean>;
  invalidate: () => void;
}>;

/**
 * Runs one replacement request at a time and applies only its current success.
 * Invalidated completions are ignored, including stale failures.
 */
export const createSingleFlightSwapController = <T>(): SingleFlightSwapController<T> => {
  let nextGeneration = 0;
  let activeGeneration: number | null = null;

  return {
    isBusy: () => activeGeneration !== null,
    run: async (load, apply) => {
      if (activeGeneration !== null) return false;
      const generation = ++nextGeneration;
      activeGeneration = generation;
      try {
        const value = await load();
        if (activeGeneration !== generation) return false;
        apply(value);
        return true;
      } catch (error) {
        if (activeGeneration !== generation) return false;
        throw error;
      } finally {
        if (activeGeneration === generation) activeGeneration = null;
      }
    },
    invalidate: () => {
      activeGeneration = null;
    },
  };
};
