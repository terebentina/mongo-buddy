import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteResultsDialog } from './DeleteResultsDialog';
import { useStore } from '../store';

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('sonner', () => ({ toast: toastMocks }));

const mockApi = {
  deleteMany: vi.fn(),
  find: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.deleteMany.mockResolvedValue({ ok: true, data: 5 });
  mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });
  useStore.setState({
    selectedDb: 'testdb',
    selectedCollection: 'users',
    docs: [{ _id: '1' }],
    totalCount: 5,
    filter: { status: 'inactive' },
    skip: 0,
    limit: 20,
    sort: null,
    loading: false,
    queryMode: 'filter',
  });
  (window as unknown as Record<string, unknown>).api = mockApi;
});

const openDialog = async (): Promise<void> => {
  await userEvent.click(screen.getByRole('button', { name: 'Delete results' }));
};

describe('DeleteResultsDialog gate', () => {
  it('does not show the action in aggregate mode', () => {
    useStore.setState({ queryMode: 'aggregate' });

    render(<DeleteResultsDialog />);

    expect(screen.queryByRole('button', { name: 'Delete results' })).not.toBeInTheDocument();
  });

  it('shows the action in filter mode', () => {
    render(<DeleteResultsDialog />);

    expect(screen.getByRole('button', { name: 'Delete results' })).toBeEnabled();
  });

  it('disables the action while a query loads', () => {
    useStore.setState({ loading: true });

    render(<DeleteResultsDialog />);

    expect(screen.getByRole('button', { name: 'Delete results' })).toBeDisabled();
  });

  it('disables the action when no documents match', () => {
    useStore.setState({ totalCount: 0 });

    render(<DeleteResultsDialog />);

    expect(screen.getByRole('button', { name: 'Delete results' })).toBeDisabled();
  });
});

describe('DeleteResultsDialog context', () => {
  it('shows the collection, applied filter, and query-time match count', async () => {
    render(<DeleteResultsDialog />);
    await openDialog();

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('users');
    expect(dialog.textContent).toContain('"status"');
    expect(dialog.textContent).toContain('"inactive"');
    expect(dialog.textContent).toMatch(/5 documents matched when the query ran/i);
  });

  it('uses a normal confirmation for a non-empty filter', async () => {
    render(<DeleteResultsDialog />);
    await openDialog();

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete 5 documents' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });
});

describe('DeleteResultsDialog whole-collection gate', () => {
  it('warns about all documents and requires the exact collection name', async () => {
    useStore.setState({ filter: {}, totalCount: 100 });
    render(<DeleteResultsDialog />);
    await openDialog();

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/filter is empty/i);
    expect(dialog.textContent).toMatch(/all documents in the collection/i);
    expect(dialog.textContent).toMatch(/100 documents matched when the query ran/i);
    expect(dialog.textContent).toContain('{}');

    const confirm = screen.getByRole('button', { name: 'Delete all documents' });
    const input = screen.getByLabelText(/type users to confirm/i);
    expect(confirm).toBeDisabled();

    await userEvent.type(input, 'user');
    expect(confirm).toBeDisabled();

    await userEvent.type(input, 's');
    expect(confirm).toBeEnabled();
  });

  it('sends the empty applied filter after the collection name matches', async () => {
    useStore.setState({ filter: {}, totalCount: 100 });
    render(<DeleteResultsDialog />);
    await openDialog();
    await userEvent.type(screen.getByLabelText(/type users to confirm/i), 'users');

    await userEvent.click(screen.getByRole('button', { name: 'Delete all documents' }));

    expect(mockApi.deleteMany).toHaveBeenCalledWith('testdb', 'users', {});
  });
});

describe('DeleteResultsDialog request', () => {
  it('disables further confirmation while the request runs', async () => {
    let resolveDelete: (result: { ok: true; data: number }) => void = () => {};
    mockApi.deleteMany.mockReturnValue(
      new Promise((resolve) => {
        resolveDelete = resolve;
      })
    );
    render(<DeleteResultsDialog />);
    await openDialog();

    const confirm = screen.getByRole('button', { name: 'Delete 5 documents' });
    await userEvent.click(confirm);

    await waitFor(() => expect(confirm).toBeDisabled());
    await userEvent.click(confirm);
    expect(mockApi.deleteMany).toHaveBeenCalledTimes(1);

    resolveDelete({ ok: true, data: 5 });
    await waitFor(() => expect(mockApi.find).toHaveBeenCalled());
  });

  it.each([
    [1, 'Deleted 1 document'],
    [3, 'Deleted 3 documents'],
  ])('shows the driver count in the success toast for %i deleted documents', async (deletedCount, message) => {
    mockApi.deleteMany.mockResolvedValue({ ok: true, data: deletedCount });
    render(<DeleteResultsDialog />);
    await openDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Delete 5 documents' }));

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith(message));
    expect(mockApi.find).toHaveBeenCalled();
  });

  it('shows the error and does not refresh results after a failure', async () => {
    mockApi.deleteMany.mockResolvedValue({ ok: false, error: 'Delete failed' });
    render(<DeleteResultsDialog />);
    await openDialog();

    const confirm = screen.getByRole('button', { name: 'Delete 5 documents' });
    await userEvent.click(confirm);

    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith('Delete failed'));
    expect(mockApi.find).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(confirm).toBeEnabled();
  });
});
