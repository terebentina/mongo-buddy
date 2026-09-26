import { createServer as createHttpServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { z } from 'zod';
import { version } from '../../../package.json';
import { registerMongoMcpTools, type McpToolEntry } from './mongo-tools';
import type { Dispatch } from '../commands/dispatch';
import type { WriteApproval } from './write-approval';

const HOST = '0.0.0.0';
const MCP_PATH = '/mcp';

export interface StartMcpServerOptions {
  dispatch: Dispatch;
  mongoTools: McpToolEntry<z.ZodType, unknown>[];
  port: number;
  approval: WriteApproval;
}

export interface McpServerHandle {
  close: () => Promise<void>;
  actualPort: number;
  address: string;
}

async function listen(httpServer: Server, port: number): Promise<{ port: number; address: string } | null> {
  return new Promise((resolve) => {
    const onError = (err: NodeJS.ErrnoException): void => {
      httpServer.removeListener('listening', onListening);
      if (err.code === 'EADDRINUSE') {
        console.error(`MCP: port ${port} is already in use, not starting MCP server`);
      } else {
        console.error('MCP: failed to bind HTTP server:', err);
      }
      resolve(null);
    };
    const onListening = (): void => {
      httpServer.removeListener('error', onError);
      const info = httpServer.address();
      if (!info || typeof info === 'string') {
        resolve(null);
        return;
      }
      resolve({ port: info.port, address: info.address });
    };
    httpServer.once('error', onError);
    httpServer.once('listening', onListening);
    httpServer.listen(port, HOST);
  });
}

export async function startMcpServer(options: StartMcpServerOptions): Promise<McpServerHandle | null> {
  let shuttingDown = false;
  const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (shuttingDown) {
      res.statusCode = 503;
      res.end('MCP server is shutting down');
      return;
    }
    const url = req.url ?? '';
    const pathname = url.split('?')[0];
    if (pathname !== MCP_PATH) {
      res.statusCode = 404;
      res.setHeader('content-type', 'text/plain');
      res.end('Not Found');
      return;
    }

    const request = new AbortController();
    req.on('aborted', () => request.abort());
    res.on('close', () => {
      if (!res.writableFinished) request.abort();
    });
    const mcpServer = new McpServer(
      { name: 'mongo-buddy', version },
      {
        capabilities: { tools: {} },
        instructions:
          'All MongoDB create, read, update, and delete interactions must be done exclusively through MongoBuddy MCP tools. Do not use direct database connections, drivers, shells, or other MCP servers for MongoDB CRUD. MongoBuddy MCP uses the active connection in the MongoBuddy app.',
      }
    );
    registerMongoMcpTools({
      server: mcpServer,
      dispatch: options.dispatch,
      tools: options.mongoTools,
      approval: options.approval,
      signal: request.signal,
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    const cleanup = (): void => {
      void transport.close().catch(() => undefined);
      void mcpServer.close().catch(() => undefined);
    };
    res.on('close', cleanup);

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error('MCP: request handler error:', err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null }));
      } else {
        res.end();
      }
      cleanup();
    }
  });

  const listening = await listen(httpServer, options.port);
  if (!listening) {
    return null;
  }

  return {
    actualPort: listening.port,
    address: listening.address,
    close: async () => {
      shuttingDown = true;
      options.approval.cancel();
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    },
  };
}
