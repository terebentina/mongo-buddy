export const DEFAULT_MCP_PORT = 27099;

export interface McpArgs {
  enabled: boolean;
  port: number;
}

const DISABLE_MCP_FLAG = '--disable-mcp';
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
  let enabled = true;
  let port = DEFAULT_MCP_PORT;

  for (const arg of argv) {
    if (arg === DISABLE_MCP_FLAG) {
      enabled = false;
      continue;
    }
    if (arg.startsWith(MCP_PORT_PREFIX)) {
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
