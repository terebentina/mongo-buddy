# MongoBuddy

A desktop MongoDB GUI client (Electron + React) that also exposes a built-in MCP server so AI assistants can read from the same connection the user has open in the GUI.

## Language

### Connection family

The word "connection" is overloaded. Five distinct concepts, all related to the user's MongoDB connection:

**SavedConnection**:
A persisted entry in the user's connection list — a URI plus optional metadata, stored on disk via `electron-store`.
_Avoid_: bookmark, profile.

**ConnectionState**:
The status snapshot broadcast from the main process to the renderer. Discriminated union over `disconnected | connecting | connected | error`.
_Avoid_: status (too generic), connection info.

**ConnectedSession**:
The reply payload returned from `ConnectionManager.connect()` — initial database list, query history, auto-selected db, etc. A one-shot snapshot, not a live handle.
_Avoid_: connect result, session.

**ActiveConnection**:
The runtime capability used inside main-process code: `{ client: MongoClient, key: ConnectionKey }`. Minted from the manager at the boundary (IPC handler, MCP tool); passed by value into `MongoService` methods and per-connection stores. A snapshot — does not enforce that the client stays open for its lifetime.
_Avoid_: live connection, mongo session, client wrapper.

**ConnectionKey**:
The opaque per-connection identity string, derived from the URI. Used to scope per-connection storage (query history today; possibly favorites or saved queries later). Currently typed as `string`.
_Avoid_: connection id, uri hash.

### Verbs

**drop**:
The verb for destructive removal of a MongoDB object (collection, index, eventually database, view…). Used everywhere: backend service methods (`dropIndex`, `dropCollection`), IPC channels (`mongo:drop-index`), UI labels ("Drop index", "Drop collection"), confirmation dialogs, button labels, internal state and handler names (`dropDialogOpen`, `handleDrop`), and toasts ("Dropped index 'X'").
_Avoid_: delete, remove. We say "drop" because that is the MongoDB driver's word and the cost is meaningfully higher than a row-level delete — choosing one verb across the stack prevents drift between UI copy and backend vocabulary.

Note: `deleteOne` (single-document removal) is unaffected — that is a different operation with a different driver verb.

### MongoDB operations

**MongoService**:
The namespace of MongoDB operations on the main process. Each method takes an **ActiveConnection** as its first argument and returns a `Result<T>`. Stateless — the constructor holds no live state.

**MCP tool**:
A read-only operation exposed to external MCP clients (Claude, Cursor, etc.). All current tools dispatch through **MongoService**.

### Indexes

**IndexInfo**:
The read-side shape — what `collection.indexes()` returns. Carries driver-managed fields (`v`, `ns`, `textIndexVersion`, etc.) and always includes the `_id_` index. Consumed by the list view and the drop-index flow.

**IndexSpec**:
The write-side shape — what we hand to `collection.createIndexes()` and what we serialize to an exported sidecar JSON. Sanitized: driver-only fields stripped, `_id_` excluded.

Currently `IndexSpec = IndexInfo` (alias in `src/main/index-spec.ts`). The names exist so a future structural split has a place to slot into; do not pass a raw **IndexInfo** to `createIndexes()` even though the types align — go through `sanitizeForExport()` or treat the value as already sanitized.

### Operations (export/import)

**Operation**:
A long-running task tracked by `OperationRegistry` (export collection, export database, import collection). Has a state machine: `pending → running → succeeded | failed | cancelled`.

## Relationships

- A **SavedConnection** is the seed for a **ConnectedSession** when the user clicks Connect.
- The `ConnectionManager` owns the live `MongoClient` and produces an **ActiveConnection** snapshot on demand.
- An **ActiveConnection** carries a **ConnectionKey** for scoping per-connection storage.
- IPC handlers and MCP tools are the only callers of `manager.getActive()`; deeper modules (`MongoService`, history store) never check the precondition — they just consume the value they're given.

## Example dialogue

> **Reviewer:** "If the user clicks Disconnect mid-`find`, what happens?"
> **Dev:** "The MongoService method already has the **ActiveConnection** snapshot, so it calls into the driver, which throws. The boundary's existing try/catch maps it to a `Result<T>` error. We don't try to keep the client alive — that would be a lease, not a snapshot."

> **Reviewer:** "Why doesn't `QueryHistoryStore` take an **ActiveConnection** directly?"
> **Dev:** "It only needs the **ConnectionKey** — the identity, not the live capability. Passing the whole **ActiveConnection** would couple the store to a shape it doesn't use."

## Flagged ambiguities

- "connection" was used to mean a saved URI, a status broadcast, a connect-reply payload, and a runtime capability. Resolved: five distinct names (**SavedConnection**, **ConnectionState**, **ConnectedSession**, **ActiveConnection**, **ConnectionKey**).
- "Not connected" used to be a thrown error string from `requireClient()`, a thrown error string from `requireConnectionKey()`, and a substring-matched literal in MCP tools. Resolved: the negative case is `manager.getActive()` returning `null`; each boundary owns its own user-facing message.
