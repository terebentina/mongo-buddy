import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { McpWriteApprovalDialog } from './McpWriteApprovalDialog';
import type { McpWriteApprovalRequest } from '../../../shared/types';

const proposal: McpWriteApprovalRequest = {
  id: 'one',
  command: 'insertOne',
  connection: 'localhost:27161',
  db: 'sandbox',
  collection: 'notes',
  input:
    '{"db":"sandbox","collection":"notes","doc":{"$oid":"507f1f77bcf86cd799439011","note":"<img src=x onerror=alert(1)>"}}',
};
let receive!: (request: McpWriteApprovalRequest | { id: string; cleared: true }) => void;
const respond = vi.fn();

beforeEach(() => {
  respond.mockClear();
  window.api = {
    onMcpWriteApproval: (cb: typeof receive) => {
      receive = cb;
      return () => undefined;
    },
    respondToMcpWrite: respond,
  } as unknown as typeof window.api;
});

describe('MCP GUI write approval', () => {
  it('shows connection, command, namespace and untrusted EJSON as inert text, then approves once', async () => {
    render(<McpWriteApprovalDialog />);
    act(() => receive(proposal));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('MCP WRITE approval: insertOne');
    expect(dialog).toHaveTextContent('localhost:27161');
    expect(dialog).toHaveTextContent('sandbox');
    expect(dialog).toHaveTextContent('notes');
    expect(screen.getByLabelText('Complete EJSON input')).toHaveTextContent(proposal.input);
    expect(dialog.querySelector('img')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Approve once' }));
    expect(respond).toHaveBeenCalledExactlyOnceWith('one', true);
  });

  it('denies explicitly and clears a cancelled request without granting approval', async () => {
    render(<McpWriteApprovalDialog />);
    act(() => receive(proposal));
    await userEvent.click(screen.getByRole('button', { name: 'Deny' }));
    expect(respond).toHaveBeenCalledExactlyOnceWith('one', false);
    act(() => receive(proposal));
    act(() => receive({ id: 'one', cleared: true }));
    expect(screen.queryByText('localhost:27161')).not.toBeInTheDocument();
    expect(respond).toHaveBeenCalledTimes(1);
  });
});
