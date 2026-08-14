export interface RequestFreshness {
  start: () => () => boolean;
  invalidate: () => void;
}

export function createRequestFreshness(): RequestFreshness {
  let generation = 0;

  return {
    start: () => {
      const requestGeneration = ++generation;
      return () => requestGeneration === generation;
    },
    invalidate: () => {
      generation += 1;
    },
  };
}
