# MongoBuddy — Electron MongoDB Client

## Context
Lightweight MongoDB GUI alternative to Compass. Browse, query, CRUD.

## Stack
Electron + electron-vite (react-ts template), React 18 + TS + zustand, Tailwind + shadcn/ui, CodeMirror 6, mongodb driver, electron-store, pnpm

## Testing: Vitest + React Testing Library
- **TDD / Red-Green-Refactor on every story**
- Unit tests for main process (MongoService, IPC handlers) — mock mongodb driver
- Component tests for renderer (React Testing Library) — mock window.api
- Each story: write failing tests first (RED), implement to pass (GREEN), refactor (REFACTOR)

### Test Structure
```
src/main/__tests__/
  mongo-service.test.ts       # MongoService unit tests (mocked driver)
  ipc-handlers.test.ts        # IPC handler tests (mocked MongoService)
src/renderer/src/__tests__/
  store.test.ts               # zustand store tests (mocked IPC)
  components/
    ConnectionDialog.test.tsx  # render, submit, error states
    Sidebar.test.tsx           # tree expand/collapse, selection
    DocumentTable.test.tsx     # column detection, pagination, display
    QueryEditor.test.tsx       # input, run, mode toggle
    DocumentEditor.test.tsx    # create, edit, delete flows
```

### Test Config
- vitest.config.ts for main process (node environment)
- vitest.config.ts for renderer (jsdom environment, React Testing Library)
- Mock strategy: MongoService mocks the mongodb `MongoClient`; renderer mocks `window.api`

## Architecture

**Main process**: MongoService singleton + IPC handlers
**Preload**: contextBridge → typed `window.api`
**Renderer**: React app, no direct driver access

### BSON Serialization
Use `EJSON.serialize()` / `EJSON.deserialize()` at IPC boundary so renderer always works with plain JSON.

### IPC Channels (invoke/handle, return `Result<T>`)
| Channel | Purpose |
|---|---|
| `mongo:connect` | Connect to URI |
| `mongo:disconnect` | Close connection |
| `mongo:list-databases` | List all DBs |
| `mongo:list-collections` | List collections in DB |
| `mongo:find` | Find docs (filter, sort, skip, limit) |
| `mongo:count` | Count docs (for pagination) |
| `mongo:find-one` | Get single doc by _id |
| `mongo:insert-one` | Insert document |
| `mongo:update-one` | Update by _id (full replacement) |
| `mongo:delete-one` | Delete by _id |
| `mongo:aggregate` | Run aggregation pipeline (JSON array, never eval) |

### Layout
```
┌───────────────────────────────────┐
│ Connection Bar          [Disconnect]
├──────────┬────────────────────────┤
│ DB Tree  │ Document Table         │
│          │ (paginated)            │
│          ├────────────────────────┤
│          │ Query Editor (CM6)     │
└──────────┴────────────────────────┘
```

### Key Files
```
src/main/index.ts            # Window creation, register IPC
src/main/mongo-service.ts    # MongoClient wrapper singleton
src/main/ipc-handlers.ts     # IPC handlers + EJSON serialization boundary
src/preload/index.ts         # contextBridge API
src/preload/index.d.ts       # window.api types
src/renderer/src/App.tsx     # Root layout
src/renderer/src/store.ts    # zustand store
src/renderer/src/components/
  ui/                        # shadcn primitives
  connection/ConnectionDialog.tsx
  sidebar/Sidebar.tsx, DbTree.tsx
  documents/DocumentTable.tsx, DocumentEditor.tsx
  query/QueryEditor.tsx
```

## Stories

Every story follows TDD: **write tests → RED → implement → GREEN → REFACTOR**

### S1: Project Scaffold + Config
- `pnpm create @electron-vite/create` with react-ts template
- Install deps: mongodb, electron-store, zustand, vitest, @testing-library/react, @testing-library/jest-dom, jsdom
- Setup Tailwind + shadcn/ui (button, dialog, table, input, scroll-area, collapsible, sonner)
- Configure vitest: main (node env), renderer (jsdom env)
- Shared types file: `src/shared/types.ts` (Result<T>, DbInfo, CollectionInfo, FindOpts, etc.)
- Verify: `pnpm dev` opens window, `pnpm test` runs (no tests yet)

### S2: MongoService TDD
**RED:** Write `mongo-service.test.ts`:
- `connect()` calls `MongoClient.connect` with URI
- `connect()` with bad URI returns error result
- `disconnect()` closes client
- `listDatabases()` returns DbInfo[]
- `listDatabases()` when not connected throws
- `listCollections(db)` returns CollectionInfo[]
- `find(db, coll, opts)` returns serialized docs + totalCount
- `count(db, coll, filter)` returns number
- EJSON serialization: ObjectId/Date round-trip correctly

**GREEN:** Implement MongoService with mocked mongodb driver passing all tests.
**REFACTOR:** Clean up.

### S3: IPC + Preload Bridge
**RED:** Write `ipc-handlers.test.ts`:
- Each channel calls correct MongoService method
- Success returns `{ ok: true, data }`
- MongoService error returns `{ ok: false, error: message }`
- EJSON serialization applied to outgoing data

**GREEN:** Implement ipc-handlers.ts, preload/index.ts, preload/index.d.ts.
**REFACTOR:** DRY up handler registration if repetitive.

### S4: Zustand Store TDD
**RED:** Write `store.test.ts`:
- `connect(uri)` sets connected=true, loads databases
- `connect` failure sets error, connected=false
- `selectDb(db)` loads collections
- `selectCollection(db, coll)` loads docs
- `disconnect()` resets state

**GREEN:** Implement store.ts (mock window.api in tests).
**REFACTOR:** Clean up.

### S5: Connection Dialog + Sidebar
**RED:** Write `ConnectionDialog.test.tsx`:
- Renders URI input and Connect button
- Submit calls store.connect
- Shows error toast on failure
- Hides dialog on success

**RED:** Write `Sidebar.test.tsx`:
- Renders database list
- Click DB expands to show collections
- Click collection calls store.selectCollection
- Shows selected collection as active

**GREEN:** Implement ConnectionDialog.tsx, Sidebar.tsx, DbTree.tsx, App.tsx layout.
**REFACTOR:** Extract shared patterns.

### S6: Document Table
**RED:** Write `DocumentTable.test.tsx`:
- Renders column headers from doc keys (union of first 20 docs)
- Renders _id column first
- Truncates long cell values (>100 chars)
- JSON.stringifies nested objects in cells
- Shows pagination controls (Next/Prev/page info)
- Next button disabled on last page
- Prev button disabled on first page
- Calls store with updated skip on page change

**GREEN:** Implement DocumentTable.tsx.
**REFACTOR:** Extract column detection utility if complex.

### S7: Saved Connections
**RED:** Write tests:
- electron-store saves `{ name, uri }[]`
- ConnectionDialog renders saved connections list
- Click saved connection fills URI and connects
- Delete removes from store
- Last-used connection auto-reconnects on app start

**GREEN:** Implement connection persistence + dialog updates.
**REFACTOR:** Clean up.

### S8: Query Editor
**RED:** Write `QueryEditor.test.tsx`:
- Renders CodeMirror editor
- Run button parses JSON filter and calls store.find with filter
- Invalid JSON shows error toast
- Aggregate mode: parses JSON array, calls store.aggregate
- Cmd+Enter triggers run
- Toggle between filter/aggregate mode

**GREEN:** Implement QueryEditor.tsx + aggregate IPC.
**REFACTOR:** Extract JSON validation utility.

### S9: Document CRUD
**RED:** Write `DocumentEditor.test.tsx`:
- "Add Document" opens editor dialog with empty template
- Submit calls insert-one, refreshes table
- Click row opens editor with doc JSON
- Save calls update-one, refreshes table
- Delete button shows confirm, calls delete-one, refreshes table
- Invalid JSON in editor shows error

**GREEN:** Implement DocumentEditor.tsx + CRUD IPC handlers.
**REFACTOR:** Clean up.

### S10: Polish
- Loading spinners on all async operations
- Empty states (no DBs, no collections, no docs)
- Keyboard shortcuts (Cmd+K connect, Cmd+Enter run query)
- Collection doc count badge in sidebar
- Dark mode (Tailwind dark: classes, system preference detection)
- Resizable sidebar (drag handle)

## Verification (end-to-end)
1. `pnpm test` → all tests pass
2. `pnpm dev` → Electron window opens
3. Connect to `mongodb://localhost:27017` → sidebar shows DBs
4. Expand DB → collections listed
5. Click collection → table shows docs with auto-detected columns
6. Paginate through docs
7. Save connection, restart app → auto-reconnects
8. Query: `{"status": "active"}` → filtered results
9. Aggregate: `[{"$group": {"_id": "$status", "count": {"$sum": 1}}}]` → results
10. CRUD: insert, edit, delete → table updates
