import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MongoService } from '../mongo-service';
import type { ConnectionManager } from '../connection-manager';

// All MCP Mongo tools have migrated to MongoCommand-based registration
// in mongo-tools.ts; this file remains only so server.ts keeps compiling
// until commit 15 deletes both this stub and its import.
export function registerMcpTools(_server: McpServer, _service: MongoService, _manager: ConnectionManager): void {
  // intentionally empty
}
