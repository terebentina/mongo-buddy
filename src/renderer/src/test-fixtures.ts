import type { AcceptedResults, AppliedQuery } from './collection-query';

export type FilterAppliedQuery = Extract<AppliedQuery, { queryMode: 'filter' }>;

export function filterResults(
  query: Partial<Omit<FilterAppliedQuery, 'queryMode'>> = {},
  docs: Record<string, unknown>[] = [],
  totalCount = docs.length
): AcceptedResults {
  return {
    appliedQuery: {
      db: query.db ?? 'testdb',
      collection: query.collection ?? 'users',
      filter: query.filter ?? {},
      projection: query.projection ?? null,
      sort: query.sort ?? null,
      skip: query.skip ?? 0,
      limit: query.limit ?? 20,
      queryMode: 'filter',
    },
    docs,
    totalCount,
  };
}

export function aggregateResults(
  query: Partial<Omit<Extract<AppliedQuery, { queryMode: 'aggregate' }>, 'queryMode'>> = {},
  docs: Record<string, unknown>[] = []
): AcceptedResults {
  return {
    appliedQuery: {
      db: query.db ?? 'testdb',
      collection: query.collection ?? 'users',
      queryMode: 'aggregate',
      pipeline: query.pipeline ?? [],
    },
    docs,
    totalCount: docs.length,
  };
}
