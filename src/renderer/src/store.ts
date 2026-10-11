import { create } from 'zustand';
import type {
  DbInfo,
  CollectionInfo,
  SavedConnection,
  QueryHistoryEntry,
  QueryMode,
  DistinctResult,
  Result,
  ConnectionState,
  McpStatus,
  UpdateManyInput,
  UpdateManyOptions,
  UpdateManyResult,
  ConnectionColumnWidths,
  SaveColumnWidthInput,
} from '../../shared/types';
import type { FilterValueAction } from './lib/filter-value';
import { createCollectionQuery, type AcceptedResults } from './collection-query';
import { createRequestFreshness } from './lib/request-freshness';
import { collectionColumnWidthsKey } from '../../shared/collection-column-widths';
import { toast } from 'sonner';

export interface StoreState {
  status: ConnectionState;
  uri: string;
  databases: DbInfo[];
  ghostDatabases: string[];
  collections: CollectionInfo[];
  expandedDb: string | null;
  selectedDb: string | null;
  selectedCollection: string | null;
  acceptedResults: AcceptedResults | null;
  limit: number;
  projection: Record<string, unknown> | null;
  error: string | null;
  loading: boolean;
  savedConnections: SavedConnection[];
  queryMode: QueryMode;
  fieldNames: string[];
  pendingFilterText: string | null;
  queryHistory: QueryHistoryEntry[];
  collectionColumnWidths: ConnectionColumnWidths;
  historyIndex: number | null;
  pendingQueryMode: QueryMode | null;
  mcpStatus: McpStatus;

  connect: (uri: string) => Promise<void>;
  saveColumnWidth: (input: SaveColumnWidthInput) => Promise<void>;
  disconnect: () => Promise<void>;
  subscribeToConnectionState: () => () => void;
  initMcpStatus: () => () => void;
  toggleDb: (db: string) => Promise<void>;
  selectDb: (db: string) => Promise<void>;
  selectCollection: (db: string, collection: string) => Promise<void>;
  fetchPage: (skip: number) => Promise<void>;
  runQuery: (queryText: string) => Promise<string | null>;
  runExplain: (queryText: string) => Promise<Result<Record<string, unknown>> | null>;
  applyProjection: (projectionText: string) => Promise<string | null>;
  clearProjection: () => Promise<string | null>;
  loadDocument: (id: unknown) => Promise<Result<Record<string, unknown>>>;
  setQueryMode: (mode: QueryMode) => void;
  setSort: (field: string) => Promise<void>;
  setLimit: (newLimit: number) => Promise<void>;
  insertDoc: (doc: Record<string, unknown>) => Promise<string | null>;
  updateDoc: (id: unknown, doc: Record<string, unknown>) => Promise<string | null>;
  updateManyDocs: (
    update: UpdateManyInput,
    options: UpdateManyOptions,
    expectedResults?: AcceptedResults
  ) => Promise<Result<UpdateManyResult>>;
  deleteResults: (expectedResults?: AcceptedResults) => Promise<Result<number>>;
  deleteDoc: (id: unknown) => Promise<string | null>;
  refreshDocs: () => Promise<void>;
  loadSavedConnections: () => Promise<void>;
  saveConnection: (name: string, uri: string) => Promise<void>;
  deleteConnection: (name: string) => Promise<void>;
  restoreFromHistory: (entry: QueryHistoryEntry) => Promise<void>;
  navigateHistory: (direction: -1 | 1) => Promise<void>;
  applyFilterValue: (column: string, value: unknown, action: FilterValueAction) => void;
  clearPendingFilterText: () => void;
  autoReconnect: () => Promise<void>;
  fetchDistinct: (field: string, filter?: Record<string, unknown>) => Promise<Result<DistinctResult> | null>;
  addGhostDatabase: (name: string) => void;
  removeGhostDatabase: (name: string) => void;
  refreshDatabases: () => Promise<void>;
}

export const selectConnected = (s: StoreState): boolean => s.status.status === 'connected';

export const useStore = create<StoreState>()((set, get) => {
  const collectionQuery = createCollectionQuery(set, get);
  const connectionRequests = createRequestFreshness();
  return {
    ...collectionQuery.state,
    status: { status: 'disconnected' },
    uri: '',
    databases: [],
    ghostDatabases: [],
    collections: [],
    expandedDb: null,
    savedConnections: [],
    collectionColumnWidths: {},
    mcpStatus: { running: false, port: null },

    connect: async (uri: string) => {
      const requestIsCurrent = connectionRequests.start();
      const wasConnected = selectConnected(get());
      collectionQuery.resetConnection();
      set({
        loading: true,
        error: null,
        collectionColumnWidths: {},
        collections: [],
        expandedDb: null,
        databases: [],
        ghostDatabases: [],
      });
      if (wasConnected) {
        await window.api.disconnect();
        if (!requestIsCurrent()) return;
      }
      const result = await window.api.connect(uri);
      if (!requestIsCurrent()) return;
      if (!result.ok) {
        set({ loading: false, error: result.error });
        return;
      }
      const { databases, queryHistory, collectionColumnWidths, autoSelectedDb, collections } = result.data;
      collectionQuery.hydrateHistory(queryHistory);
      set({
        uri: result.data.uri,
        databases,
        collectionColumnWidths,
        // A connected broadcast may already have enabled a newer user selection.
        ...(get().selectedDb === null
          ? { loading: false, expandedDb: autoSelectedDb, selectedDb: autoSelectedDb, collections }
          : {}),
      });
    },

    disconnect: async () => {
      connectionRequests.invalidate();
      collectionQuery.resetConnection();
      set({
        uri: '',
        databases: [],
        ghostDatabases: [],
        collections: [],
        expandedDb: null,
        collectionColumnWidths: {},
      });
      await window.api.disconnect();
    },

    // The connect reply can hydrate widths before the connected broadcast.
    subscribeToConnectionState: () =>
      window.api.onConnectionState((status) => {
        const previous = get().status;
        collectionQuery.connectionChanged(previous, status);
        set({
          status,
          ...(status.status !== 'connected' ||
          (previous.status === 'connected' && previous.connectionKey !== status.connectionKey)
            ? { collectionColumnWidths: {} }
            : {}),
        });
      }),

    saveColumnWidth: async (input) => {
      const { status } = get();
      if (status.status !== 'connected' || status.connectionKey !== input.connectionKey) return;
      const namespace = collectionColumnWidthsKey(input.db, input.collection);
      set((state) => ({
        collectionColumnWidths: {
          ...state.collectionColumnWidths,
          [namespace]: { ...state.collectionColumnWidths[namespace], [input.column]: input.width },
        },
      }));
      try {
        const result = await window.api.saveColumnWidth(input);
        if (!result.ok) toast.error(`Column width was not saved: ${result.error}`);
      } catch (err) {
        toast.error(`Column width was not saved: ${(err as Error).message}`);
      }
    },

    initMcpStatus: () => {
      const unsubscribe = window.api.onMcpStatusUpdate((mcpStatus) => set({ mcpStatus }));
      window.api.getMcpStatus().then((mcpStatus) => set({ mcpStatus }));
      return unsubscribe;
    },

    toggleDb: async (db: string) => {
      if (get().expandedDb === db) {
        set({ expandedDb: null });
        return;
      }
      await get().selectDb(db);
    },

    insertDoc: async (doc: Record<string, unknown>) => {
      const { selectedDb, selectedCollection } = get();
      if (!selectedDb || !selectedCollection) return 'No collection selected';
      const result = await window.api.insertOne(selectedDb, selectedCollection, doc);
      if (!result.ok) return result.error;
      await get().refreshDocs();
      return null;
    },

    updateDoc: async (id: unknown, doc: Record<string, unknown>) => {
      const { selectedDb, selectedCollection } = get();
      if (!selectedDb || !selectedCollection) return 'No collection selected';
      const result = await window.api.updateOne(selectedDb, selectedCollection, id, doc);
      if (!result.ok) return result.error;
      await get().refreshDocs();
      return null;
    },

    updateManyDocs: async (update: UpdateManyInput, options: UpdateManyOptions, expectedResults?: AcceptedResults) => {
      const { selectedDb, selectedCollection, acceptedResults, queryMode, loading } = get();
      if (!selectedDb || !selectedCollection) return { ok: false, error: 'No collection selected' };
      const query = acceptedResults?.appliedQuery;
      if (
        query?.queryMode !== 'filter' ||
        queryMode !== 'filter' ||
        loading ||
        query.db !== selectedDb ||
        query.collection !== selectedCollection ||
        (expectedResults && expectedResults !== acceptedResults)
      )
        return { ok: false, error: 'No current accepted filter results' };
      const result = await window.api.updateMany(query.db, query.collection, query.filter, update, options);
      if (result.ok && get().acceptedResults === acceptedResults && !get().loading) await get().refreshDocs();
      return result;
    },

    deleteResults: async (expectedResults?: AcceptedResults) => {
      const { selectedDb, selectedCollection, acceptedResults, queryMode, loading } = get();
      if (!selectedDb || !selectedCollection) return { ok: false, error: 'No collection selected' };
      const query = acceptedResults?.appliedQuery;
      if (
        query?.queryMode !== 'filter' ||
        queryMode !== 'filter' ||
        loading ||
        query.db !== selectedDb ||
        query.collection !== selectedCollection ||
        (expectedResults && expectedResults !== acceptedResults)
      )
        return { ok: false, error: 'No current accepted filter results' };
      const result = await window.api.deleteMany(query.db, query.collection, query.filter);
      if (result.ok && get().acceptedResults === acceptedResults && !get().loading) await get().fetchPage(0);
      return result;
    },

    deleteDoc: async (id: unknown) => {
      const { selectedDb, selectedCollection } = get();
      if (!selectedDb || !selectedCollection) return 'No collection selected';
      const result = await window.api.deleteOne(selectedDb, selectedCollection, id);
      if (!result.ok) return result.error;
      await get().refreshDocs();
      return null;
    },

    loadSavedConnections: async () => {
      const connections = await window.api.listConnections();
      set({ savedConnections: connections });
    },

    saveConnection: async (name: string, uri: string) => {
      await window.api.saveConnection({ name, uri });
      const connections = await window.api.listConnections();
      set({ savedConnections: connections });
    },

    deleteConnection: async (name: string) => {
      await window.api.deleteConnection(name);
      const connections = await window.api.listConnections();
      set({ savedConnections: connections });
    },

    autoReconnect: async () => {
      const lastUsed = await window.api.getLastUsed();
      if (lastUsed) {
        await get().connect(lastUsed);
      }
    },

    addGhostDatabase: (name: string) => {
      const { ghostDatabases } = get();
      if (ghostDatabases.includes(name)) return;
      set({ ghostDatabases: [...ghostDatabases, name] });
    },

    removeGhostDatabase: (name: string) => {
      const { ghostDatabases, selectedDb } = get();
      const next = ghostDatabases.filter((n) => n !== name);
      if (selectedDb === name) {
        collectionQuery.reset();
        set({
          ghostDatabases: next,
          expandedDb: null,
          selectedDb: null,
          selectedCollection: null,
          collections: [],
          projection: null,
        });
      } else {
        set({ ghostDatabases: next });
      }
    },

    refreshDatabases: async () => {
      const result = await window.api.listDatabases();
      if (result.ok) set({ databases: result.data });
    },
  };
});
