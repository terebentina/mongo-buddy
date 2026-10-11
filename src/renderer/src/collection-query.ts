import type { StoreApi } from 'zustand';
import JSON5 from 'json5';
import type { ConnectionState, QueryHistoryEntry, QueryMode } from '../../shared/types';
import type { StoreState } from './store';
import { combineFilterValue, type FilterValueAction } from './lib/filter-value';
import { createRequestFreshness } from './lib/request-freshness';

function pushWindowTitle(db: string | null, collection: string | null): void {
  const location = db && collection ? `${db}.${collection}` : null;
  window.api.setWindowTitle({ location });
}

// Composed into the application store; ownership never leaves this module.
export function createCollectionQuery(set: StoreApi<StoreState>['setState'], get: StoreApi<StoreState>['getState']) {
  const resultRequests = createRequestFreshness();
  const selectionRequests = createRequestFreshness();

  const emptyResults = {
    docs: [],
    totalCount: 0,
    skip: 0,
    filter: {},
    projection: null,
    resultQueryMode: 'filter',
    fieldNames: [],
    sort: null,
    error: null,
    loading: false,
  } satisfies Partial<StoreState>;

  function reset(): void {
    selectionRequests.invalidate();
    resultRequests.invalidate();
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
    const selectionIsCurrent = selectionRequests.start();
    resultRequests.invalidate();
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

  async function executeQuery(
    db: string,
    collection: string,
    queryText: string,
    queryMode: QueryMode,
    requestIsCurrent: () => boolean,
    recordHistory: boolean
  ): Promise<string | null> {
    // All controls are captured synchronously, before transport I/O.
    const { limit, projection } = get();
    let parsed: unknown;
    try {
      parsed = JSON5.parse(queryText);
    } catch (e) {
      set({ loading: false });
      return e instanceof Error ? e.message : 'Invalid JSON';
    }
    if (recordHistory) recordAttempt(db, collection, queryMode, queryText);
    if (queryMode === 'aggregate') {
      if (!Array.isArray(parsed)) {
        set({ loading: false });
        return 'Aggregate pipeline must be a JSON array';
      }
      set({ loading: true, skip: 0, error: null, sort: null });
      const result = await window.api.aggregate(db, collection, parsed as Record<string, unknown>[]);
      if (!requestIsCurrent()) return null;
      if (!result.ok) {
        set({ loading: false, error: result.error });
        return result.error;
      }
      set({ loading: false, docs: result.data, totalCount: result.data.length, resultQueryMode: 'aggregate' });
      return null;
    }
    const filter = parsed as Record<string, unknown>;
    set({ loading: true, skip: 0, error: null, sort: null, filter });
    const result = await window.api.find(db, collection, {
      filter,
      ...(projection ? { projection } : {}),
      skip: 0,
      limit,
    });
    if (!requestIsCurrent()) return null;
    if (!result.ok) {
      set({ loading: false, error: result.error });
      return result.error;
    }
    set({ loading: false, docs: result.data.docs, totalCount: result.data.totalCount, resultQueryMode: 'filter' });
    return null;
  }

  const state = {
    selectedDb: null,
    selectedCollection: null,
    docs: [],
    totalCount: 0,
    skip: 0,
    limit: 20,
    filter: {},
    projection: null,
    resultQueryMode: 'filter',
    error: null,
    loading: false,
    queryMode: 'filter',
    fieldNames: [],
    sort: null,
    pendingFilterText: null,
    queryHistory: [],
    historyIndex: null,
    pendingQueryMode: null,

    selectDb: async (db: string) => {
      const selectionIsCurrent = selectionRequests.start();
      resultRequests.invalidate();
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
      const { selectedDb, selectedCollection, limit, filter, projection, sort } = get();
      if (!selectedDb || !selectedCollection) return;
      const requestIsCurrent = resultRequests.start();
      set({ loading: true, skip });
      const result = await window.api.find(selectedDb, selectedCollection, {
        filter,
        ...(projection ? { projection } : {}),
        skip,
        limit,
        sort: sort ?? undefined,
      });
      if (!requestIsCurrent()) return;
      if (!result.ok) {
        set({ loading: false, error: result.error });
        return;
      }
      set({ loading: false, docs: result.data.docs, totalCount: result.data.totalCount, resultQueryMode: 'filter' });
    },

    runQuery: async (queryText: string) => {
      const { selectedDb, selectedCollection, queryMode } = get();
      if (!selectedDb || !selectedCollection) return null;
      const requestIsCurrent = resultRequests.start();
      return executeQuery(selectedDb, selectedCollection, queryText, queryMode, requestIsCurrent, true);
    },

    runExplain: async (queryText: string) => {
      const { selectedDb, selectedCollection, queryMode } = get();
      if (!selectedDb || !selectedCollection) return null;

      let parsed: unknown;
      try {
        parsed = JSON5.parse(queryText);
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' };
      }

      if (queryMode === 'aggregate' && !Array.isArray(parsed)) {
        return { ok: false, error: 'Aggregate pipeline must be a JSON array' };
      }

      const requestIsCurrent = resultRequests.start();
      set({ loading: true });
      const result = await window.api.explain(
        selectedDb,
        selectedCollection,
        queryMode,
        parsed as Record<string, unknown> | Record<string, unknown>[]
      );
      if (!requestIsCurrent()) return null;
      set({ loading: false });
      return result;
    },

    applyProjection: async (projectionText: string) => {
      const { selectedDb, selectedCollection, filter, sort, skip, limit, queryMode } = get();
      if (!selectedDb || !selectedCollection) return 'No collection selected';
      if (queryMode === 'aggregate') return 'Projection is paused in Aggregate mode';

      let parsed: unknown;
      try {
        parsed = JSON5.parse(projectionText);
      } catch (e) {
        return e instanceof Error ? e.message : 'Invalid JSON';
      }
      if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
        return 'Projection must be a JSON object';
      }

      const nextProjection = Object.keys(parsed).length > 0 ? (parsed as Record<string, unknown>) : null;
      const requestIsCurrent = resultRequests.start();
      const result = await window.api.find(selectedDb, selectedCollection, {
        filter,
        ...(nextProjection ? { projection: nextProjection } : {}),
        ...(sort ? { sort } : {}),
        skip,
        limit,
      });
      if (!requestIsCurrent()) return null;
      if (!result.ok) return result.error;

      set({
        projection: nextProjection,
        docs: result.data.docs,
        totalCount: result.data.totalCount,
        resultQueryMode: 'filter',
        error: null,
      });
      return null;
    },

    clearProjection: async () => {
      const { selectedDb, selectedCollection, filter, sort, skip, limit, queryMode } = get();
      if (!selectedDb || !selectedCollection) return 'No collection selected';
      if (queryMode === 'aggregate') {
        set({ projection: null });
        return null;
      }

      const requestIsCurrent = resultRequests.start();
      const result = await window.api.find(selectedDb, selectedCollection, {
        filter,
        ...(sort ? { sort } : {}),
        skip,
        limit,
      });
      if (!requestIsCurrent()) return null;
      if (!result.ok) return result.error;

      set({
        projection: null,
        docs: result.data.docs,
        totalCount: result.data.totalCount,
        resultQueryMode: 'filter',
        error: null,
      });
      return null;
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

    setSort: (field: string) => {
      const { sort } = get();
      let newSort: Record<string, 1 | -1> | null;
      if (!sort || !(field in sort)) {
        newSort = { [field]: 1 };
      } else if (sort[field] === 1) {
        newSort = { [field]: -1 };
      } else {
        newSort = null;
      }
      set({ sort: newSort, skip: 0 });
      get().fetchPage(0);
    },

    setLimit: (newLimit: number) => {
      set({ limit: newLimit, skip: 0 });
      get().fetchPage(0);
    },

    refreshDocs: async () => {
      const { selectedDb, selectedCollection, skip, limit, filter, projection, sort } = get();
      if (!selectedDb || !selectedCollection) return;
      const requestIsCurrent = resultRequests.start();
      const result = await window.api.find(selectedDb, selectedCollection, {
        filter,
        ...(projection ? { projection } : {}),
        skip,
        limit,
        sort: sort ?? undefined,
      });
      if (!requestIsCurrent()) return;
      if (result.ok) {
        set({ docs: result.data.docs, totalCount: result.data.totalCount, resultQueryMode: 'filter' });
      }
    },

    restoreFromHistory: async (entry: QueryHistoryEntry) => {
      const { selectedDb, selectedCollection, queryHistory } = get();
      const { db, collection, query, queryMode } = entry;
      const idx = queryHistory.findIndex((e) => e.id === entry.id);
      const selectionIsCurrent =
        db !== selectedDb || collection !== selectedCollection ? selectTarget(db, collection) : null;
      const requestIsCurrent = resultRequests.start();
      set({
        filter: {},
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
      const { selectedDb, selectedCollection, filter } = get();
      if (!selectedDb || !selectedCollection) return;
      const newFilter = { ...filter, [column]: combineFilterValue(filter[column], value, action) };
      const query = JSON.stringify(newFilter, null, 2);
      set({ filter: newFilter, skip: 0, pendingFilterText: query, pendingQueryMode: 'filter', queryMode: 'filter' });
      get().fetchPage(0);
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

  return { state, reset, resetConnection, connectionChanged, hydrateHistory };
}
