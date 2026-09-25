import { describe, expect, it } from 'vitest';
import { MCP_TOOLS } from './mongo-tool-entries';

describe('MCP_TOOLS mutation boundary', () => {
  it('documents projection support for the find tool', () => {
    const find = MCP_TOOLS.find((entry) => entry.command.name === 'find');

    expect(find?.description).toContain('projection');
  });
});
