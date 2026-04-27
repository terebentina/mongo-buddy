import { useStore } from '../store';

export function McpStatusPill() {
  const mcpStatus = useStore((s) => s.mcpStatus);

  if (!mcpStatus.running) return null;

  return (
    <span
      className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full"
      title={`MCP server listening on port ${mcpStatus.port}`}
    >
      MCP port {mcpStatus.port}
    </span>
  );
}
