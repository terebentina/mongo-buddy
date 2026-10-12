export interface RequestFreshness {
  start: () => () => boolean;
  // Observe freshness without superseding an in-flight request.
  capture: () => () => boolean;
  invalidate: () => void;
}

export function createRequestFreshness(): RequestFreshness {
  let generation = 0;

  function capture(): () => boolean {
    const requestGeneration = generation;
    return () => requestGeneration === generation;
  }

  return {
    start: () => {
      generation += 1;
      return capture();
    },
    capture,
    invalidate: () => {
      generation += 1;
    },
  };
}
