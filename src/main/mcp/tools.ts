import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { MongoService } from '../mongo-service';
import type { ConnectionManager } from '../connection-manager';
import type { Result } from '../../shared/types';

const DISCONNECT_MESSAGE = 'Not connected. Connect via the mongo-buddy GUI first.';

const EJSON_HINT =
  'Filters and pipelines must be MongoDB Extended JSON (EJSON). Use {"$oid": "..."} for ObjectId, {"$date": "..."} for Date, {"$numberLong": "..."} for Long, etc.';

function toToolResult<T>(result: Result<T>): CallToolResult {
  if (result.ok) {
    return { content: [{ type: 'text', text: JSON.stringify(result.data) }] };
  }
  return { isError: true, content: [{ type: 'text', text: result.error }] };
}

function notConnectedResult(): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: DISCONNECT_MESSAGE }] };
}

export function registerMcpTools(server: McpServer, service: MongoService, manager: ConnectionManager): void {
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
    async ({ db, collection, pipeline }) => {
      const active = manager.getActive();
      if (!active) return notConnectedResult();
      return toToolResult(await service.aggregate(active, db, collection, pipeline));
    }
  );

  server.registerTool(
    'explain',
    {
      description: `Run MongoDB explain (verbosity: executionStats) on a query and return the query plan plus execution stats (winning plan, index used, docs/keys examined, executionTimeMillis). Use for diagnosing slow queries or verifying index usage. ${EJSON_HINT}`,
      inputSchema: {
        db: z.string().describe('Database name'),
        collection: z.string().describe('Collection name'),
        queryMode: z.enum(['filter', 'aggregate']).describe('"filter" for find queries, "aggregate" for pipelines'),
        query: z
          .union([z.record(z.string(), z.unknown()), z.array(z.record(z.string(), z.unknown()))])
          .describe('EJSON filter object (queryMode=filter) or pipeline array (queryMode=aggregate)'),
      },
    },
    async ({ db, collection, queryMode, query }) => {
      const active = manager.getActive();
      if (!active) return notConnectedResult();
      return toToolResult(await service.explain(active, db, collection, queryMode, query));
    }
  );
}
