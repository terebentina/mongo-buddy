import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseMcpArgs, DEFAULT_MCP_PORT } from './cli-args';

describe('parseMcpArgs', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns enabled with default port when no flags provided', () => {
    expect(parseMcpArgs([])).toEqual({ enabled: true, port: DEFAULT_MCP_PORT });
  });

  it('DEFAULT_MCP_PORT is 27099', () => {
    expect(DEFAULT_MCP_PORT).toBe(27099);
  });

  it('disables MCP when --disable-mcp is provided', () => {
    expect(parseMcpArgs(['--disable-mcp'])).toEqual({ enabled: false, port: DEFAULT_MCP_PORT });
  });

  it('uses custom port when --mcp-port=N is provided', () => {
    expect(parseMcpArgs(['--mcp-port=3000'])).toEqual({ enabled: true, port: 3000 });
  });

  it('--disable-mcp wins even if --mcp-port is also provided', () => {
    expect(parseMcpArgs(['--disable-mcp', '--mcp-port=12345'])).toEqual({ enabled: false, port: 12345 });
  });

  it('handles flags in either order', () => {
    expect(parseMcpArgs(['--mcp-port=12345', '--disable-mcp'])).toEqual({ enabled: false, port: 12345 });
  });

  it('ignores unrelated argv entries and electron runtime args', () => {
    const argv = ['/path/to/electron', '/path/to/app', '--some-electron-flag', '--mcp-port=8080', 'extra'];
    expect(parseMcpArgs(argv)).toEqual({ enabled: true, port: 8080 });
  });

  it('falls back to default port and warns when --mcp-port is NaN', () => {
    const result = parseMcpArgs(['--mcp-port=abc']);
    expect(result).toEqual({ enabled: true, port: DEFAULT_MCP_PORT });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to default port and warns when --mcp-port is empty', () => {
    const result = parseMcpArgs(['--mcp-port=']);
    expect(result).toEqual({ enabled: true, port: DEFAULT_MCP_PORT });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to default port and warns when --mcp-port is zero', () => {
    const result = parseMcpArgs(['--mcp-port=0']);
    expect(result).toEqual({ enabled: true, port: DEFAULT_MCP_PORT });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to default port and warns when --mcp-port is negative', () => {
    const result = parseMcpArgs(['--mcp-port=-5']);
    expect(result).toEqual({ enabled: true, port: DEFAULT_MCP_PORT });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to default port and warns when --mcp-port exceeds 65535', () => {
    const result = parseMcpArgs(['--mcp-port=70000']);
    expect(result).toEqual({ enabled: true, port: DEFAULT_MCP_PORT });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to default port and warns when --mcp-port is a float', () => {
    const result = parseMcpArgs(['--mcp-port=3000.5']);
    expect(result).toEqual({ enabled: true, port: DEFAULT_MCP_PORT });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('accepts the minimum valid port 1', () => {
    expect(parseMcpArgs(['--mcp-port=1'])).toEqual({ enabled: true, port: 1 });
  });

  it('accepts the maximum valid port 65535', () => {
    expect(parseMcpArgs(['--mcp-port=65535'])).toEqual({ enabled: true, port: 65535 });
  });
});
