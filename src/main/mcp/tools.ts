import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { MongoService } from '../mongo-service';
import type { Result } from '../../shared/types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DISCONNECT_MESSAGE = 'Not connected. Connect via the mongo-buddy GUI first.';

const EJSON_HINT =
  'Filters and pipelines must be MongoDB Extended JSON (EJSON). Use {"$oid": "..."} for ObjectId, {"$date": "..."} for Date, {"$numberLong": "..."} for Long, etc.';

function toToolResult<T>(result: Result<T>): CallToolResult {
  if (result.ok) {
    return { content: [{ type: 'text', text: JSON.stringify(result.data) }] };
  }
  const message = result.error === 'Not connected' ? DISCONNECT_MESSAGE : result.error;
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function clampLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (value > MAX_LIMIT) return MAX_LIMIT;
  return value;
}

export function registerMcpTools(server: McpServer, service: MongoService): void {
  server.registerTool(
    'list_databases',
    {
      description:
        'List all databases on the currently connected MongoDB server with name, size on disk, and empty flag.',
      inputSchema: {},
    },
    async () => toToolResult(await service.listDatabases())
  );

  server.registerTool(
    'list_collections',
    {
      description: 'List all collections in the given database, including type and estimated document count.',
      inputSchema: {
        db: z.string().describe('Database name'),
      },
    },
    async ({ db }) => toToolResult(await service.listCollections(db))
  );

  server.registerTool(
    'sample_fields',
    {
      description:
        'Sample up to 50 documents from a collection and return the union of top-level field names. Use this to discover the shape of a collection before writing a query.',
      inputSchema: {
        db: z.string().describe('Database name'),
        collection: z.string().describe('Collection name'),
      },
    },
    async ({ db, collection }) => toToolResult(await service.sampleFields(db, collection))
  );

  server.registerTool(
    'find',
    {
      description: `Find documents in a collection. Returns { docs, totalCount } where totalCount ignores skip/limit — use it to paginate via skip. Default limit is ${DEFAULT_LIMIT}, max is ${MAX_LIMIT} (values above are clamped). ${EJSON_HINT}`,
      inputSchema: {
        db: z.string().describe('Database name'),
        collection: z.string().describe('Collection name'),
        filter: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            'MongoDB query filter in EJSON (e.g. {"status": "active"} or {"_id": {"$oid": "507f1f77bcf86cd799439011"}})'
          ),
        sort: z
          .record(z.string(), z.union([z.literal(1), z.literal(-1)]))
          .optional()
          .describe('Sort spec, e.g. {"createdAt": -1}'),
        skip: z.number().int().min(0).optional().describe('Number of documents to skip (for pagination)'),
        limit: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe(`Max documents to return (default ${DEFAULT_LIMIT}, clamped to ${MAX_LIMIT})`),
      },
    },
    async ({ db, collection, filter, sort, skip, limit }) => {
      const opts = {
        filter,
        sort,
        skip,
        limit: clampLimit(limit),
      };
      return toToolResult(await service.find(db, collection, opts));
    }
  );

  server.registerTool(
    'count',
    {
      description: `Count documents matching a filter. ${EJSON_HINT}`,
      inputSchema: {
        db: z.string().describe('Database name'),
        collection: z.string().describe('Collection name'),
        filter: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('MongoDB query filter in EJSON. Defaults to {} (count all).'),
      },
    },
    async ({ db, collection, filter }) => toToolResult(await service.count(db, collection, filter ?? {}))
  );

  server.registerTool(
    'aggregate',
    {
      description: `Run an aggregation pipeline against a collection. Returns the resulting documents. ${EJSON_HINT}`,
      inputSchema: {
        db: z.string().describe('Database name'),
        collection: z.string().describe('Collection name'),
        pipeline: z
          .array(z.record(z.string(), z.unknown()))
          .describe('Aggregation pipeline in EJSON, e.g. [{"$match": {...}}, {"$group": {...}}]'),
      },
    },
    async ({ db, collection, pipeline }) => toToolResult(await service.aggregate(db, collection, pipeline))
  );

  server.registerTool(
    'list_indexes',
    {
      description: 'List all indexes on a collection (raw spec from MongoDB)',
      inputSchema: {
        db: z.string().describe('Database name'),
        collection: z.string().describe('Collection name'),
      },
    },
    async ({ db, collection }) => toToolResult(await service.listIndexes(db, collection))
  );

  server.registerTool(
    'distinct',
    {
      description: `Return the distinct values of a field in a collection. Response includes a "truncated" flag if the result was clipped. ${EJSON_HINT}`,
      inputSchema: {
        db: z.string().describe('Database name'),
        collection: z.string().describe('Collection name'),
        field: z.string().describe('Field name to get distinct values for (supports dot notation)'),
        filter: z.record(z.string(), z.unknown()).optional().describe('Optional EJSON filter. Defaults to {}.'),
      },
    },
    async ({ db, collection, field, filter }) =>
      toToolResult(await service.distinct(db, collection, field, filter ?? {}))
  );
}
