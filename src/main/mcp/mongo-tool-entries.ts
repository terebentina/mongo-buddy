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

const NOT_CONNECTED_MESSAGE = 'Not connected. Connect via the mongo-buddy GUI first.';

export const MCP_TOOLS: McpToolEntry<z.ZodType, unknown>[] = [
  {
    command: countCommand,
    description: `Count documents matching a filter. ${EJSON_HINT}`,
    notConnectedMessage: NOT_CONNECTED_MESSAGE,
  },
  {
    command: listDatabasesCommand,
    description:
      'List all databases on the currently connected MongoDB server with name, size on disk, and empty flag.',
    notConnectedMessage: NOT_CONNECTED_MESSAGE,
  },
  {
    command: sampleFieldsCommand,
    description:
      'Sample up to 50 documents from a collection and return the union of top-level field names. Use this to discover the shape of a collection before writing a query.',
    notConnectedMessage: NOT_CONNECTED_MESSAGE,
  },
  {
    command: listCollectionsCommand,
    description: 'List all collections in the given database, including type and estimated document count.',
    notConnectedMessage: NOT_CONNECTED_MESSAGE,
  },
  {
    command: listIndexesCommand,
    description: 'List all indexes on a collection (raw spec from MongoDB)',
    notConnectedMessage: NOT_CONNECTED_MESSAGE,
  },
  {
    command: distinctCommand,
    description: `Return the distinct values of a field in a collection. Response includes a "truncated" flag if the result was clipped. ${EJSON_HINT}`,
    notConnectedMessage: NOT_CONNECTED_MESSAGE,
  },
  {
    command: aggregateCommand,
    description: `Run an aggregation pipeline against a collection. Returns the resulting documents. ${EJSON_HINT}`,
    notConnectedMessage: NOT_CONNECTED_MESSAGE,
  },
  {
    command: findCommand,
    description: `Find documents in a collection. Returns { docs, totalCount } where totalCount ignores skip/limit — use it to paginate via skip. Default limit is ${DEFAULT_FIND_LIMIT}, max is ${MAX_FIND_LIMIT} (values above are clamped). ${EJSON_HINT}`,
    transformInput: (input) => {
      const i = input as Record<string, unknown>;
      return { ...i, limit: clampLimit(i.limit as number | undefined) };
    },
    notConnectedMessage: NOT_CONNECTED_MESSAGE,
  },
  {
    command: explainCommand,
    description: `Run MongoDB explain (verbosity: executionStats) on a query and return the query plan plus execution stats (winning plan, index used, docs/keys examined, executionTimeMillis). Use for diagnosing slow queries or verifying index usage. ${EJSON_HINT}`,
    notConnectedMessage: NOT_CONNECTED_MESSAGE,
  },
];
