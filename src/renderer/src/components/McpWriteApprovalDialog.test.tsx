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
  it('approves filtered deletion with a click but requires exact typing for an empty filter', async () => {
    render(<McpWriteApprovalDialog />);
    act(() =>
      receive({ ...proposal, command: 'deleteMany', input: '{"filter":{"status":"expired"}}', id: 'filtered' })
    );
    expect(screen.queryByText(/may delete all documents/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve once' }));
    expect(respond).toHaveBeenCalledExactlyOnceWith('filtered', true);

    act(() =>
      receive({ ...proposal, command: 'deleteMany', input: '{"filter":{}}', id: 'all', typeToConfirm: 'notes' })
    );
    expect(screen.getByText(/may delete all documents/)).toBeInTheDocument();
    const approve = screen.getByRole('button', { name: 'Approve once' });
    const name = screen.getByLabelText(/Type the exact collection name/);
    expect(approve).toBeDisabled();
    await userEvent.type(name, 'Notes');
    expect(approve).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, 'notes');
    expect(approve).toBeEnabled();
    await userEvent.click(approve);
    expect(respond).toHaveBeenLastCalledWith('all', true, 'notes');
  });

  it.each(['createCollection', 'renameCollection'])(
    '%s permits click-only approval with the exact target visible',
    async (command) => {
      render(<McpWriteApprovalDialog />);
      const target = command === 'renameCollection' ? '"notes" → "archive"' : 'notes';
      act(() =>
        receive({ ...proposal, command, collection: target, input: '{"db":"sandbox","from":"notes","to":"archive"}' })
      );
      expect(screen.getByRole('dialog')).toHaveTextContent(target);
      expect(screen.getByLabelText('Complete EJSON input')).toHaveTextContent('"to":"archive"');
      expect(screen.queryByLabelText(/Type the exact/)).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Approve once' }));
      expect(respond).toHaveBeenCalledExactlyOnceWith('one', true);
    }
  );

  it.each([
    ['emptyCollection', 'notes', 'collection', 'delete every document'],
    ['dropCollection', 'notes', 'collection', 'drop the collection'],
    ['dropCollections', 'sandbox', 'database', 'drop the listed collections'],
  ])('%s requires exact %s typing before approval', async (command, expected, kind, warning) => {
    render(<McpWriteApprovalDialog />);
    act(() =>
      receive({
        ...proposal,
        command,
        typeToConfirm: expected,
        collection: command === 'dropCollections' ? '["notes","archive"]' : 'notes',
        input: command === 'dropCollections' ? '{"db":"sandbox","names":["notes","archive"]}' : proposal.input,
      })
    );
    expect(screen.getByRole('dialog')).toHaveTextContent(warning);
    expect(screen.getByLabelText('Complete EJSON input')).toHaveTextContent(
      command === 'dropCollections' ? '"names":["notes","archive"]' : proposal.input
    );
    const approve = screen.getByRole('button', { name: 'Approve once' });
    const input = screen.getByLabelText(new RegExp(`Type the exact ${kind} name`));
    expect(approve).toBeDisabled();
    await userEvent.type(input, expected.toUpperCase());
    expect(approve).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, expected);
    expect(approve).toBeEnabled();
    await userEvent.click(approve);
    expect(respond).toHaveBeenCalledExactlyOnceWith('one', true, expected);
  });
  it('resets typed confirmation between requests and still permits denial', async () => {
    render(<McpWriteApprovalDialog />);
    const all = { ...proposal, command: 'deleteMany', input: '{"filter":{}}', typeToConfirm: 'notes' };
    act(() => receive({ ...all, id: 'first' }));
    await userEvent.type(screen.getByLabelText(/Type the exact collection name/), 'notes');
    act(() => receive({ id: 'first', cleared: true }));
    act(() => receive({ ...all, id: 'second' }));
    expect(screen.getByRole('button', { name: 'Approve once' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Deny' }));
    expect(respond).toHaveBeenCalledExactlyOnceWith('second', false, '');
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
