import type { z } from 'zod';
import { countCommand } from '../commands/count';
import { listDatabasesCommand } from '../commands/list-databases';
import { sampleFieldsCommand } from '../commands/sample-fields';
import { listCollectionsCommand } from '../commands/list-collections';
import { listIndexesCommand } from '../commands/list-indexes';
import type { McpToolEntry } from './mongo-tools';

const EJSON_HINT =
  'Filters and pipelines must be MongoDB Extended JSON (EJSON). Use {"$oid": "..."} for ObjectId, {"$date": "..."} for Date, {"$numberLong": "..."} for Long, etc.';

const NOT_CONNECTED_MESSAGE = 'Not connected. Connect via the mongo-buddy GUI first.';

export const MCP_TOOLS: McpToolEntry<z.ZodObject<z.ZodRawShape>, unknown>[] = [
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
];
