import type { z } from 'zod';
import { countCommand } from '../commands/count';
import { listDatabasesCommand } from '../commands/list-databases';
import { sampleFieldsCommand } from '../commands/sample-fields';
import { listCollectionsCommand } from '../commands/list-collections';
import { listIndexesCommand } from '../commands/list-indexes';
import { distinctCommand } from '../commands/distinct';
import { findCommand } from '../commands/find';
import { aggregateCommand } from '../commands/aggregate';
import { explainCommand } from '../commands/explain';
import { insertOneCommand } from '../commands/insert-one';
import { updateManyCommand } from '../commands/update-many';
import { deleteManyCommand } from '../commands/delete-many';

const DEFAULT_FIND_LIMIT = 50;
const MAX_FIND_LIMIT = 200;

function clampLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_FIND_LIMIT;
  if (value > MAX_FIND_LIMIT) return MAX_FIND_LIMIT;
  return value;
}
import type { McpToolEntry } from './mongo-tools';

const EJSON_HINT =
  'Filters and pipelines must be MongoDB Extended JSON (EJSON). Use {"$oid": "..."} for ObjectId, {"$date": "..."} for Date, {"$numberLong": "..."} for Long, etc.';

export const MCP_TOOLS: McpToolEntry<z.ZodType, unknown>[] = [
  {
    command: countCommand,
    description: `Count documents matching a filter. ${EJSON_HINT}`,
  },
  {
    command: listDatabasesCommand,
    description:
      'List all databases on the currently connected MongoDB server with name, size on disk, and empty flag.',
  },
  {
    command: sampleFieldsCommand,
    description:
      'Sample up to 50 documents from a collection and return the union of top-level field names. Use this to discover the shape of a collection before writing a query.',
  },
  {
    command: listCollectionsCommand,
    description: 'List all collections in the given database, including type and estimated document count.',
  },
  {
    command: listIndexesCommand,
    description: 'List all indexes on a collection (raw spec from MongoDB)',
  },
  {
    command: distinctCommand,
    description: `Return the distinct values of a field in a collection. Response includes a "truncated" flag if the result was clipped. ${EJSON_HINT}`,
  },
  {
    command: aggregateCommand,
    description: `Run an aggregation pipeline against a collection. Pipelines with $out or $merge write to a collection and can replace existing data; they run without MongoBuddy GUI approval. Other pipelines return the resulting documents. ${EJSON_HINT}`,
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
  {
    command: findCommand,
    description: `Find documents in a collection. Use projection for the full MongoDB find projection syntax. Returns { docs, totalCount } where totalCount uses only the filter — use it to paginate via skip. Default limit is ${DEFAULT_FIND_LIMIT}, max is ${MAX_FIND_LIMIT} (values above are clamped). ${EJSON_HINT}`,
    transformInput: (input) => {
      const i = input as Record<string, unknown>;
      return { ...i, limit: clampLimit(i.limit as number | undefined) };
    },
  },
  {
    command: explainCommand,
    description: `Run MongoDB explain (verbosity: executionStats) on a query and return the query plan plus execution stats (winning plan, index used, docs/keys examined, executionTimeMillis). Use for diagnosing slow queries or verifying index usage. ${EJSON_HINT}`,
  },
  {
    command: insertOneCommand,
    title: 'WRITE — insertOne (MongoBuddy confirmation required)',
    description: `WRITE: Insert one document into a collection. MongoBuddy confirmation required: an explicit, one-time approval in the GUI before execution; MCP tool annotations do not grant permission. ${EJSON_HINT}`,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    requiresApproval: true,
  },
  {
    command: updateManyCommand,
    title: 'WRITE — updateMany (MongoBuddy confirmation required)',
    description: `WRITE: Update every matching document with an update document or pipeline. Optional driver options include arrayFilters. Review the entire filter, update and options in the GUI before one-time approval. ${EJSON_HINT}`,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    requiresApproval: true,
  },
  {
    command: deleteManyCommand,
    title: 'WRITE — deleteMany (MongoBuddy confirmation required)',
    description: `WRITE: Delete every document matching the filter. MongoBuddy GUI approval required per request; an empty filter ({}) may delete every document in the collection and additionally requires typing the exact collection name. ${EJSON_HINT}`,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    requiresApproval: true,
    typeToConfirm: (input) =>
      Object.keys(input.filter as Record<string, unknown>).length === 0 ? (input.collection as string) : undefined,
  },
];
