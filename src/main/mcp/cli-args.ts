export const DEFAULT_MCP_PORT = 27099;

export interface McpArgs {
  enabled: boolean;
  port: number;
}

const MCP_FLAG = '--mcp';
const MCP_PORT_PREFIX = '--mcp-port=';

function parsePort(raw: string): number | null {
  if (raw.length === 0) return null;
  if (!/^-?\d+$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) return null;
  if (n < 1 || n > 65535) return null;
  return n;
}

export function parseMcpArgs(argv: readonly string[]): McpArgs {
  let enabled = false;
  let port = DEFAULT_MCP_PORT;

  for (const arg of argv) {
    if (arg === MCP_FLAG) {
      enabled = true;
      continue;
    }
    if (arg.startsWith(MCP_PORT_PREFIX)) {
      enabled = true;
      const raw = arg.slice(MCP_PORT_PREFIX.length);
      const parsed = parsePort(raw);
      if (parsed === null) {
        console.warn(`Invalid --mcp-port value "${raw}". Falling back to default port ${DEFAULT_MCP_PORT}.`);
      } else {
        port = parsed;
      }
    }
  }

  return { enabled, port };
}
