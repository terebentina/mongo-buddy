import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { IndexesDialog } from './IndexesDialog';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const mockApi = {
  listIndexes: vi.fn(),
  createIndex: vi.fn(),
  dropIndex: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.listIndexes.mockResolvedValue({
    ok: true,
    data: [{ name: '_id_', key: { _id: 1 } }],
  });
  mockApi.createIndex.mockResolvedValue({ ok: true, data: 'email_1' });
  (window as unknown as Record<string, unknown>).api = mockApi;
});

async function renderIndexesDialog(): Promise<void> {
  render(<IndexesDialog open onOpenChange={() => {}} db="app" collection="users" />);
  await screen.findByText('_id_');
}

async function openAddIndexDialog(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole('button', { name: 'Add index' }));
  return screen.getByRole('dialog', { name: 'Add index' });
}

describe('IndexesDialog index creation', () => {
  it('shows the add button when the collection has no listed indexes', async () => {
    mockApi.listIndexes.mockResolvedValue({ ok: true, data: [] });
    render(<IndexesDialog open onOpenChange={() => {}} db="app" collection="users" />);

    expect(await screen.findByRole('button', { name: 'Add index' })).toBeEnabled();
    expect(screen.getByText('No indexes.')).toBeInTheDocument();
  });

  it('creates a named unique index from a relaxed JSON object', async () => {
    mockApi.listIndexes
      .mockResolvedValueOnce({ ok: true, data: [{ name: '_id_', key: { _id: 1 } }] })
      .mockResolvedValueOnce({
        ok: true,
        data: [
          { name: '_id_', key: { _id: 1 } },
          { name: 'user_lookup', key: { email: 1, createdAt: -1 }, unique: true },
        ],
      });
    mockApi.createIndex.mockResolvedValue({ ok: true, data: 'user_lookup' });
    await renderIndexesDialog();

    const addDialog = await openAddIndexDialog();
    await userEvent.type(within(addDialog).getByLabelText(/index name/i), 'user_lookup');
    fireEvent.change(within(addDialog).getByLabelText(/index keys/i), {
      target: { value: '{ email: 1, createdAt: -1 }' },
    });
    await userEvent.click(within(addDialog).getByRole('checkbox', { name: 'Unique index' }));
    await userEvent.click(within(addDialog).getByRole('button', { name: 'Add index' }));

    await waitFor(() => {
      expect(mockApi.createIndex).toHaveBeenCalledWith(
        'app',
        'users',
        { email: 1, createdAt: -1 },
        { name: 'user_lookup', unique: true }
      );
    });
    expect(await screen.findByText('user_lookup')).toBeInTheDocument();
    expect(mockApi.listIndexes).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenCalledWith('Added index "user_lookup"');
  });

  it('lets MongoDB generate the index name', async () => {
    await renderIndexesDialog();
    const addDialog = await openAddIndexDialog();
    fireEvent.change(within(addDialog).getByLabelText(/index keys/i), {
      target: { value: '{ email: 1 }' },
    });
    await userEvent.click(within(addDialog).getByRole('button', { name: 'Add index' }));

    await waitFor(() => {
      expect(mockApi.createIndex).toHaveBeenCalledWith(
        'app',
        'users',
        { email: 1 },
        { name: undefined, unique: false }
      );
    });
  });

  it('rejects an empty index key before it calls the API', async () => {
    await renderIndexesDialog();
    const addDialog = await openAddIndexDialog();
    fireEvent.change(within(addDialog).getByLabelText(/index keys/i), { target: { value: '{}' } });
    await userEvent.click(within(addDialog).getByRole('button', { name: 'Add index' }));

    expect(await within(addDialog).findByRole('alert')).toHaveTextContent('Add at least one index field.');
    expect(mockApi.createIndex).not.toHaveBeenCalled();
  });

  it('keeps the form open when MongoDB rejects the index', async () => {
    mockApi.createIndex.mockResolvedValue({ ok: false, error: 'Index already exists' });
    await renderIndexesDialog();
    const addDialog = await openAddIndexDialog();

    await userEvent.click(within(addDialog).getByRole('button', { name: 'Add index' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Index already exists'));
    expect(screen.getByRole('dialog', { name: 'Add index' })).toBeInTheDocument();
    expect(mockApi.listIndexes).toHaveBeenCalledTimes(1);
  });
});
