import { describe, expect, it } from 'vitest';
import { MCP_TOOLS } from './mongo-tool-entries';

describe('MCP_TOOLS mutation boundary', () => {
  it('does not expose deleteMany as a read-only MCP tool', () => {
    expect(MCP_TOOLS.map((entry) => entry.command.name)).not.toContain('deleteMany');
  });

  it('documents projection support for the find tool', () => {
    const find = MCP_TOOLS.find((entry) => entry.command.name === 'find');

    expect(find?.description).toContain('projection');
  });
});
