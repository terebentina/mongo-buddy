import type { StoreApi } from 'zustand';
import JSON5 from 'json5';
import type {
  ConnectionState,
  QueryHistoryEntry,
  QueryMode,
  Result,
  UpdateManyInput,
  UpdateManyOptions,
} from '../../shared/types';
import { collectionPreferencesKey } from '../../shared/collection-preferences';
import type { StoreState } from './store';
import { combineFilterValue, type FilterValueAction } from './lib/filter-value';
import { createRequestFreshness } from './lib/request-freshness';

export type AppliedQuery =
  | {
      queryMode: 'filter';
      db: string;
      collection: string;
      filter: Record<string, unknown>;
      projection: Record<string, unknown> | null;
      sort: Record<string, 1 | -1> | null;
      skip: number;
      limit: number;
    }
  | { queryMode: 'aggregate'; db: string; collection: string; pipeline: Record<string, unknown>[] };

export interface AcceptedResults {
  appliedQuery: AppliedQuery;
  docs: Record<string, unknown>[];
  totalCount: number;
}

function pushWindowTitle(db: string | null, collection: string | null): void {
  const location = db && collection ? `${db}.${collection}` : null;
  window.api.setWindowTitle({ location });
}

// Composed into the application store; ownership never leaves this module.
export function createCollectionQuery(set: StoreApi<StoreState>['setState'], get: StoreApi<StoreState>['getState']) {
  const resultRequests = createRequestFreshness();
  // Automatic reads supersede replies, but only explicit row intent supersedes pending writes.
  const rowIntents = createRequestFreshness();
  const selectionRequests = createRequestFreshness();
  const explainRequests = createRequestFreshness();
  let workingFilter: { db: string; collection: string; filter: Record<string, unknown> } | null = null;
  let automaticReadIsCurrent: (() => boolean) | null = null;
  let latestQuery: {
    appliedQuery: AppliedQuery;
    requestIsCurrent: () => boolean;
    preferences: Partial<Pick<StoreState, 'projection' | 'limit'>>;
  } | null = null;

  function startAutomaticRead(): () => boolean {
    automaticReadIsCurrent = resultRequests.start();
    return automaticReadIsCurrent;
  }

  const emptyResults = {
    acceptedResults: null,
    projection: null,
    fieldNames: [],
    error: null,
    loading: false,
    explainLoading: false,
    explainOutput: null,
  } satisfies Partial<StoreState>;

  function reset(): void {
    workingFilter = null;
    latestQuery = null;
    selectionRequests.invalidate();
    rowIntents.invalidate();
    resultRequests.invalidate();
    explainRequests.invalidate();
    set({
      ...emptyResults,
      selectedDb: null,
      selectedCollection: null,
      expandedDb: null,
      collections: [],
      queryMode: 'filter',
      pendingFilterText: null,
      pendingQueryMode: null,
      historyIndex: null,
    });
    pushWindowTitle(null, null);
  }

  function resetConnection(): void {
    reset();
    set({ queryHistory: [] });
  }

  function connectionChanged(previous: ConnectionState, next: ConnectionState): void {
    if (
      next.status !== 'connected' ||
      (previous.status === 'connected' && previous.connectionKey !== next.connectionKey)
    ) {
      resetConnection();
    }
  }

  function selectTarget(db: string, collection: string): () => boolean {
    workingFilter = null;
    const selectionIsCurrent = selectionRequests.start();
    rowIntents.invalidate();
    resultRequests.invalidate();
    explainRequests.invalidate();
    set({ ...emptyResults, expandedDb: db, selectedDb: db, selectedCollection: collection, historyIndex: null });
    pushWindowTitle(db, collection);
    return selectionIsCurrent;
  }

  async function discoverFields(db: string, collection: string, selectionIsCurrent: () => boolean): Promise<void> {
    const result = await window.api.sampleFields(db, collection);
    if (selectionIsCurrent()) set({ fieldNames: result.ok ? result.data : [] });
  }

  function sameHistoryQuery(first: QueryHistoryEntry, second: QueryHistoryEntry): boolean {
    return (
      first.query === second.query &&
      first.db === second.db &&
      first.collection === second.collection &&
      first.queryMode === second.queryMode
    );
  }

  function hydrateHistory(persisted: QueryHistoryEntry[]): void {
    const { queryHistory } = get();
    if (queryHistory.length === 0) {
      set({ queryHistory: persisted.slice(0, 50) });
      return;
    }

    // New connection attempts precede its older snapshot; never replace their cursor.
    const localIds = new Set(queryHistory.map((entry) => entry.id));
    const older = persisted.filter((entry) => !localIds.has(entry.id));
    const oldestAttempt = queryHistory[queryHistory.length - 1];
    if (older[0] && sameHistoryQuery(oldestAttempt, older[0])) older.shift();
    const merged = [...queryHistory, ...older].slice(0, 50);
    set({ queryHistory: merged });
    window.api.saveHistory(merged);
  }

  function addToHistory(entry: QueryHistoryEntry): void {
    const { queryHistory } = get();
    const top = queryHistory[0];
    if (top && sameHistoryQuery(top, entry)) {
      set({ historyIndex: 0 });
      return;
    }
    const updated = [entry, ...queryHistory].slice(0, 50);
    set({ queryHistory: updated, historyIndex: 0 });
    window.api.saveHistory(updated);
  }

  function recordAttempt(db: string, collection: string, queryMode: QueryMode, query: string): void {
    addToHistory({ id: crypto.randomUUID(), queryMode, query, db, collection, timestamp: Date.now() });
  }

  function acceptedFilter(): Extract<AppliedQuery, { queryMode: 'filter' }> | null {
    const { acceptedResults, selectedDb, selectedCollection } = get();
    const query = acceptedResults?.appliedQuery;
    return query?.queryMode === 'filter' && query.db === selectedDb && query.collection === selectedCollection
      ? query
      : null;
  }

  function savedSort(db: string, collection: string): Extract<AppliedQuery, { queryMode: 'filter' }>['sort'] {
    return get().collectionSorts[collectionPreferencesKey(db, collection)] ?? null;
  }

  function submittedFilter(db: string, collection: string): Record<string, unknown> {
    if (workingFilter?.db === db && workingFilter.collection === collection) return workingFilter.filter;
    return acceptedFilter()?.filter ?? {};
  }

  function acceptedMutationFilter(
    expectedResults?: AcceptedResults
  ): Result<Extract<AppliedQuery, { queryMode: 'filter' }>> {
    const { selectedDb, selectedCollection, acceptedResults, queryMode, loading } = get();
    if (!selectedDb || !selectedCollection) return { ok: false, error: 'No collection selected' };
    const query = acceptedFilter();
    if (!query || queryMode !== 'filter' || loading || (expectedResults && expectedResults !== acceptedResults)) {
      return { ok: false, error: 'No current accepted filter results' };
    }
    return { ok: true, data: query };
  }

  async function mutate<T>(
    db: string,
    collection: string,
    write: (db: string, collection: string) => Promise<Result<T>>,
    refresh: { firstPage?: boolean; collections?: boolean } = {}
  ): Promise<Result<T>> {
    const { acceptedResults, selectedDb, selectedCollection } = get();
    const rowIntentIsCurrent = rowIntents.capture();
    const selectionIsCurrent = selectionRequests.capture();
    const contextIsCurrent = (): boolean => {
      const current = get();
      return (
        rowIntentIsCurrent() &&
        selectionIsCurrent() &&
        current.selectedDb === selectedDb &&
        current.selectedCollection === selectedCollection
      );
    };
    const query = acceptedResults?.appliedQuery;
    const refreshQuery =
      (!get().loading || automaticReadIsCurrent?.() === true) &&
      query?.queryMode === 'filter' &&
      query.db === db &&
      query.collection === collection
        ? { ...query, skip: refresh.firstPage ? 0 : query.skip }
        : null;

    const result = await write(db, collection);
    if (!result.ok) return result;
    if (refresh.collections && selectedDb === db && contextIsCurrent()) {
      // Collection counts are separate from rows; a listing failure cannot undo the write.
      try {
        const listed = await window.api.listCollections(db);
        if (listed.ok && contextIsCurrent()) set({ collections: listed.data });
      } catch {
        // Retain the existing sidebar metadata if transport fails.
      }
    }
    if (refreshQuery && contextIsCurrent()) {
      await executeAppliedQuery(refreshQuery, startAutomaticRead());
    }
    return result;
  }

  async function executeAppliedQuery(
    appliedQuery: AppliedQuery,
    requestIsCurrent: () => boolean,
    preferences: Partial<Pick<StoreState, 'projection' | 'limit'>> = {}
  ): Promise<string | null> {
    latestQuery = { appliedQuery, requestIsCurrent, preferences };
    set({ loading: true, error: null });
    const { db, collection } = appliedQuery;
    let result;
    try {
      result =
        appliedQuery.queryMode === 'aggregate'
          ? await window.api.aggregate(db, collection, appliedQuery.pipeline)
          : await window.api.find(db, collection, {
              filter: appliedQuery.filter,
              ...(appliedQuery.projection ? { projection: appliedQuery.projection } : {}),
              ...(appliedQuery.sort ? { sort: appliedQuery.sort } : {}),
              skip: appliedQuery.skip,
              limit: appliedQuery.limit,
            });
    } catch (e) {
      if (!requestIsCurrent()) return null;
      latestQuery = null;
      const error = e instanceof Error ? e.message : 'Query failed';
      set({ loading: false, error });
      return error;
    }
    if (!requestIsCurrent()) return null;
    if (!result.ok) {
      latestQuery = null;
      set({ loading: false, error: result.error });
      return result.error;
    }
    const data = result.data;
    const acceptedResults: AcceptedResults = Array.isArray(data)
      ? { appliedQuery, docs: data, totalCount: data.length }
      : { appliedQuery, ...data };
    set({ acceptedResults, loading: false, error: null, ...preferences });
    return null;
  }

  async function restoreHydratedSort(): Promise<void> {
    if (!latestQuery?.requestIsCurrent()) return;
    const { appliedQuery, preferences } = latestQuery;
    if (appliedQuery.queryMode !== 'filter' || appliedQuery.sort !== null) return;
    const sort = savedSort(appliedQuery.db, appliedQuery.collection);
    if (!sort) return;
    // Navigation may start after the connected broadcast but before its preferences arrive.
    await executeAppliedQuery({ ...appliedQuery, sort }, resultRequests.start(), preferences);
  }

  async function executeQuery(
    db: string,
    collection: string,
    queryText: string,
    queryMode: QueryMode,
    requestIsCurrent: () => boolean,
    recordHistory: boolean
  ): Promise<string | null> {
    const { limit, projection } = get();
    let parsed: unknown;
    try {
      parsed = JSON5.parse(queryText);
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Invalid JSON';
      set({ loading: false, error });
      return error;
    }
    if (recordHistory) recordAttempt(db, collection, queryMode, queryText);
    if (queryMode === 'aggregate') {
      if (!Array.isArray(parsed)) {
        const error = 'Aggregate pipeline must be a JSON array';
        set({ loading: false, error });
        return error;
      }
      return executeAppliedQuery(
        { db, collection, queryMode, pipeline: parsed as Record<string, unknown>[] },
        requestIsCurrent
      );
    }
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
      const error = 'Filter must be a JSON object';
      set({ loading: false, error });
      return error;
    }
    const filter = parsed as Record<string, unknown>;
    workingFilter = { db, collection, filter };
    return executeAppliedQuery(
      { db, collection, queryMode, filter, projection, sort: savedSort(db, collection), skip: 0, limit },
      requestIsCurrent
    );
  }

  const state = {
    selectedDb: null,
    selectedCollection: null,
    acceptedResults: null,
    limit: 20,
    projection: null,
    error: null,
    loading: false,
    explainLoading: false,
    explainOutput: null,
    queryMode: 'filter',
    fieldNames: [],
    pendingFilterText: null,
    queryHistory: [],
    historyIndex: null,
    pendingQueryMode: null,

    selectDb: async (db: string) => {
      workingFilter = null;
      const selectionIsCurrent = selectionRequests.start();
      rowIntents.invalidate();
      resultRequests.invalidate();
      explainRequests.invalidate();
      set({
        ...emptyResults,
        loading: true,
        expandedDb: db,
        selectedDb: db,
        selectedCollection: null,
        collections: [],
        pendingFilterText: null,
        pendingQueryMode: null,
        historyIndex: null,
      });
      pushWindowTitle(null, null);
      const result = await window.api.listCollections(db);
      if (!selectionIsCurrent()) return;
      if (!result.ok) {
        set({ loading: false, error: result.error });
        return;
      }
      set({ loading: false, collections: result.data });
    },

    selectCollection: async (db: string, collection: string) => {
      const selectionIsCurrent = selectTarget(db, collection);
      const requestIsCurrent = resultRequests.start();
      set({ queryMode: 'filter', pendingFilterText: '{}', pendingQueryMode: 'filter' });
      await Promise.all([
        executeQuery(db, collection, '{}', 'filter', requestIsCurrent, true),
        discoverFields(db, collection, selectionIsCurrent),
      ]);
    },

    fetchPage: async (skip: number) => {
      rowIntents.invalidate();
      const query = acceptedFilter();
      if (!query) return;
      await executeAppliedQuery({ ...query, skip }, resultRequests.start());
    },

    runQuery: async (queryText: string) => {
      rowIntents.invalidate();
      const { selectedDb, selectedCollection, queryMode } = get();
      if (!selectedDb || !selectedCollection) return null;
      const requestIsCurrent = resultRequests.start();
      return executeQuery(selectedDb, selectedCollection, queryText, queryMode, requestIsCurrent, true);
    },

    runExplain: async (queryText: string): Promise<Result<Record<string, unknown>> | null> => {
      const { selectedDb, selectedCollection, queryMode } = get();
      if (!selectedDb || !selectedCollection) return null;

      const explainIsCurrent = explainRequests.start();
      const selectionIsCurrent = selectionRequests.capture();
      const requestIsCurrent = (): boolean => explainIsCurrent() && selectionIsCurrent();
      set({ explainLoading: true, explainOutput: null });
      let result: Result<Record<string, unknown>>;
      try {
        const parsed: unknown = JSON5.parse(queryText);
        if (queryMode === 'aggregate' && !Array.isArray(parsed)) {
          result = { ok: false, error: 'Aggregate pipeline must be a JSON array' };
        } else {
          result = await window.api.explain(
            selectedDb,
            selectedCollection,
            queryMode,
            parsed as Record<string, unknown> | Record<string, unknown>[]
          );
        }
      } catch (e) {
        result = { ok: false, error: e instanceof Error ? e.message : 'Explain failed' };
      }
      if (!requestIsCurrent()) return null;
      set({ explainLoading: false, explainOutput: result.ok ? result.data : null });
      return result;
    },

    clearExplainOutput: () => set({ explainOutput: null }),

    applyProjection: async (projectionText: string) => {
      rowIntents.invalidate();
      const { selectedDb, selectedCollection, limit, queryMode } = get();
      if (!selectedDb || !selectedCollection) return 'No collection selected';
      if (queryMode === 'aggregate') return 'Projection is paused in Aggregate mode';

      const requestIsCurrent = resultRequests.start();
      let parsed: unknown;
      try {
        parsed = JSON5.parse(projectionText);
      } catch (e) {
        set({ loading: false });
        return e instanceof Error ? e.message : 'Invalid JSON';
      }
      if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
        set({ loading: false });
        return 'Projection must be a JSON object';
      }

      const projection = Object.keys(parsed).length > 0 ? (parsed as Record<string, unknown>) : null;
      const accepted = acceptedFilter();
      return executeAppliedQuery(
        {
          db: selectedDb,
          collection: selectedCollection,
          queryMode: 'filter',
          filter: submittedFilter(selectedDb, selectedCollection),
          projection,
          sort: accepted ? accepted.sort : savedSort(selectedDb, selectedCollection),
          skip: accepted?.skip ?? 0,
          limit: accepted?.limit ?? limit,
        },
        requestIsCurrent,
        { projection }
      );
    },

    clearProjection: async () => {
      const { selectedDb, selectedCollection, queryMode } = get();
      if (!selectedDb || !selectedCollection) return 'No collection selected';
      if (queryMode === 'aggregate') {
        // This only clears the collection preference; retained rows keep their metadata.
        set({ projection: null });
        return null;
      }
      return get().applyProjection('{}');
    },

    loadDocument: async (id: unknown) => {
      const { selectedDb, selectedCollection } = get();
      if (!selectedDb || !selectedCollection) return { ok: false, error: 'No collection selected' };

      const result = await window.api.find(selectedDb, selectedCollection, {
        filter: { _id: id },
        skip: 0,
        limit: 1,
      });
      if (!result.ok) return result;
      const document = result.data.docs[0];
      if (!document) return { ok: false, error: 'Document not found' };
      return { ok: true, data: document };
    },

    setQueryMode: (mode: QueryMode) => {
      set({ queryMode: mode });
    },

    setSort: async (field: string) => {
      rowIntents.invalidate();
      const query = acceptedFilter();
      if (!query) return;
      const { sort } = query;
      const { status } = get();
      const nextSort =
        !sort || !Object.hasOwn(sort, field)
          ? { [field]: 1 as const }
          : sort[field] === 1
            ? { [field]: -1 as const }
            : null;
      const requestIsCurrent = resultRequests.start();
      const error = await executeAppliedQuery({ ...query, sort: nextSort, skip: 0 }, requestIsCurrent);
      if (error === null && requestIsCurrent() && status.status === 'connected') {
        await get().saveCollectionSort({
          connectionKey: status.connectionKey,
          db: query.db,
          collection: query.collection,
          sort: nextSort,
        });
      }
    },

    setLimit: async (limit: number) => {
      rowIntents.invalidate();
      const query = acceptedFilter();
      if (!query) {
        set({ limit });
        return;
      }
      await executeAppliedQuery({ ...query, limit, skip: 0 }, resultRequests.start(), { limit });
    },

    insertDoc: async (doc: Record<string, unknown>) => {
      const { selectedDb, selectedCollection } = get();
      if (!selectedDb || !selectedCollection) return 'No collection selected';
      const result = await mutate(selectedDb, selectedCollection, (db, collection) =>
        window.api.insertOne(db, collection, doc)
      );
      return result.ok ? null : result.error;
    },

    updateDoc: async (id: unknown, doc: Record<string, unknown>) => {
      const { selectedDb, selectedCollection } = get();
      if (!selectedDb || !selectedCollection) return 'No collection selected';
      const result = await mutate(selectedDb, selectedCollection, (db, collection) =>
        window.api.updateOne(db, collection, id, doc)
      );
      return result.ok ? null : result.error;
    },

    updateManyDocs: async (update: UpdateManyInput, options: UpdateManyOptions, expectedResults?: AcceptedResults) => {
      const accepted = acceptedMutationFilter(expectedResults);
      if (!accepted.ok) return accepted;
      const { db, collection, filter } = accepted.data;
      return mutate(db, collection, (db, collection) => window.api.updateMany(db, collection, filter, update, options));
    },

    deleteResults: async (expectedResults?: AcceptedResults) => {
      const accepted = acceptedMutationFilter(expectedResults);
      if (!accepted.ok) return accepted;
      const { db, collection, filter } = accepted.data;
      return mutate(db, collection, (db, collection) => window.api.deleteMany(db, collection, filter), {
        firstPage: true,
      });
    },

    deleteDoc: async (id: unknown) => {
      const { selectedDb, selectedCollection } = get();
      if (!selectedDb || !selectedCollection) return 'No collection selected';
      const result = await mutate(selectedDb, selectedCollection, (db, collection) =>
        window.api.deleteOne(db, collection, id)
      );
      return result.ok ? null : result.error;
    },

    emptyCollection: async (db: string, collection: string) =>
      mutate(db, collection, (db, collection) => window.api.emptyCollection(db, collection), { collections: true }),

    refreshDocs: async () => {
      const query = acceptedFilter();
      if (!query || (get().loading && automaticReadIsCurrent?.() !== true)) return;
      await executeAppliedQuery(query, startAutomaticRead());
    },

    restoreFromHistory: async (entry: QueryHistoryEntry) => {
      rowIntents.invalidate();
      const { selectedDb, selectedCollection, queryHistory } = get();
      const { db, collection, query, queryMode } = entry;
      const idx = queryHistory.findIndex((e) => e.id === entry.id);
      const selectionIsCurrent =
        db !== selectedDb || collection !== selectedCollection ? selectTarget(db, collection) : null;
      const requestIsCurrent = resultRequests.start();
      workingFilter = { db, collection, filter: {} };
      set({
        pendingFilterText: query,
        pendingQueryMode: queryMode,
        queryMode,
        historyIndex: idx >= 0 ? idx : null,
      });
      await Promise.all([
        executeQuery(db, collection, query, queryMode, requestIsCurrent, false),
        selectionIsCurrent ? discoverFields(db, collection, selectionIsCurrent) : Promise.resolve(),
      ]);
    },

    navigateHistory: async (direction: -1 | 1) => {
      const { queryHistory, historyIndex } = get();
      if (queryHistory.length === 0) return;
      const current = historyIndex === null ? (direction === 1 ? -1 : 0) : historyIndex;
      const target = Math.min(Math.max(current + direction, 0), queryHistory.length - 1);
      if (target === historyIndex) return;
      await get().restoreFromHistory(queryHistory[target]);
    },

    applyFilterValue: (column: string, value: unknown, action: FilterValueAction) => {
      rowIntents.invalidate();
      const { selectedDb, selectedCollection, projection, limit } = get();
      if (!selectedDb || !selectedCollection) return;
      const filter = submittedFilter(selectedDb, selectedCollection);
      const nextFilter = { ...filter, [column]: combineFilterValue(filter[column], value, action) };
      workingFilter = { db: selectedDb, collection: selectedCollection, filter: nextFilter };
      const query = JSON.stringify(nextFilter, null, 2);
      set({ pendingFilterText: query, pendingQueryMode: 'filter', queryMode: 'filter' });
      const accepted = acceptedFilter();
      void executeAppliedQuery(
        {
          db: selectedDb,
          collection: selectedCollection,
          queryMode: 'filter',
          filter: nextFilter,
          projection,
          sort: accepted ? accepted.sort : savedSort(selectedDb, selectedCollection),
          skip: 0,
          limit: accepted?.limit ?? limit,
        },
        resultRequests.start()
      );
      recordAttempt(selectedDb, selectedCollection, 'filter', query);
    },

    clearPendingFilterText: () => {
      set({ pendingFilterText: null, pendingQueryMode: null });
    },

    fetchDistinct: async (field: string, filter?: Record<string, unknown>) => {
      const { selectedDb, selectedCollection } = get();
      if (!selectedDb || !selectedCollection) return null;
      return window.api.distinct(selectedDb, selectedCollection, field, filter);
    },
  } satisfies Partial<StoreState>;

  return { state, reset, resetConnection, connectionChanged, hydrateHistory, restoreHydratedSort };
}
