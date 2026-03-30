import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectionDialog } from './ConnectionDialog';
import { useStore } from '../store';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

const mockApi = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  listDatabases: vi.fn(),
  listCollections: vi.fn(),
  find: vi.fn(),
  count: vi.fn(),
  listConnections: vi.fn(),
  saveConnection: vi.fn(),
  deleteConnection: vi.fn(),
  getLastUsed: vi.fn(),
  setLastUsed: vi.fn(),
  loadHistory: vi.fn().mockResolvedValue([]),
  saveHistory: vi.fn().mockResolvedValue(undefined),
  clearHistory: vi.fn().mockResolvedValue(undefined),
};

beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({
    connected: false,
    uri: '',
    databases: [],
    collections: [],
    selectedDb: null,
    selectedCollection: null,
    docs: [],
    totalCount: 0,
    skip: 0,
    limit: 20,
    filter: {},
    error: null,
    loading: false,
    savedConnections: [],
  });
  mockApi.listConnections.mockResolvedValue([]);
  (window as unknown as Record<string, unknown>).api = mockApi;
});

describe('ConnectionDialog', () => {
  it('renders URI input and Connect button', () => {
    render(<ConnectionDialog open={true} onOpenChange={() => {}} />);

    expect(screen.getByPlaceholderText(/mongodb/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument();
  });

  it('submit calls store.connect', async () => {
    mockApi.connect.mockResolvedValue({ ok: true, data: undefined });
    mockApi.listDatabases.mockResolvedValue({ ok: true, data: [] });
    mockApi.setLastUsed.mockResolvedValue(undefined);

    const onOpenChange = vi.fn();
    render(<ConnectionDialog open={true} onOpenChange={onOpenChange} />);

    const input = screen.getByPlaceholderText('mongodb://localhost:27017');
    await userEvent.type(input, 'mongodb://localhost:27017');
    await userEvent.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => {
      expect(mockApi.connect).toHaveBeenCalledWith('mongodb://localhost:27017');
    });
  });

  it('shows error toast on connection failure', async () => {
    mockApi.connect.mockResolvedValue({ ok: false, error: 'Connection refused' });

    render(<ConnectionDialog open={true} onOpenChange={() => {}} />);

    const input = screen.getByPlaceholderText('mongodb://localhost:27017');
    await userEvent.type(input, 'mongodb://badhost');
    await userEvent.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Connection refused');
    });
  });

  it('hides dialog on successful connection', async () => {
    mockApi.connect.mockResolvedValue({ ok: true, data: undefined });
    mockApi.listDatabases.mockResolvedValue({ ok: true, data: [] });
    mockApi.setLastUsed.mockResolvedValue(undefined);

    const onOpenChange = vi.fn();
    render(<ConnectionDialog open={true} onOpenChange={onOpenChange} />);

    const input = screen.getByPlaceholderText('mongodb://localhost:27017');
    await userEvent.type(input, 'mongodb://localhost:27017');
    await userEvent.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('renders saved connections list', async () => {
    mockApi.listConnections.mockResolvedValue([
      { name: 'Local', uri: 'mongodb://localhost:27017' },
      { name: 'Remote', uri: 'mongodb://remote:27017' },
    ]);

    render(<ConnectionDialog open={true} onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('Local')).toBeInTheDocument();
      expect(screen.getByText('Remote')).toBeInTheDocument();
    });
  });

  it('click saved connection fills URI and connects', async () => {
    mockApi.listConnections.mockResolvedValue([{ name: 'Local', uri: 'mongodb://localhost:27017' }]);
    mockApi.connect.mockResolvedValue({ ok: true, data: undefined });
    mockApi.listDatabases.mockResolvedValue({ ok: true, data: [] });
    mockApi.setLastUsed.mockResolvedValue(undefined);

    const onOpenChange = vi.fn();
    render(<ConnectionDialog open={true} onOpenChange={onOpenChange} />);

    await waitFor(() => {
      expect(screen.getByText('Local')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Local'));

    await waitFor(() => {
      expect(mockApi.connect).toHaveBeenCalledWith('mongodb://localhost:27017');
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('cancel edit resets inputs and exits edit mode', async () => {
    mockApi.listConnections.mockResolvedValue([{ name: 'Local', uri: 'mongodb://localhost:27017' }]);

    render(<ConnectionDialog open={true} onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('Local')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /edit local/i }));

    expect(screen.getByPlaceholderText(/connection name/i)).toHaveValue('Local');
    expect(screen.getByPlaceholderText(/mongodb/i)).toHaveValue('mongodb://localhost:27017');
    expect(screen.getByRole('button', { name: /update & connect/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByPlaceholderText(/connection name/i)).toHaveValue('');
    expect(screen.getByPlaceholderText(/mongodb/i)).toHaveValue('');
    expect(screen.getByRole('button', { name: /^connect$/i })).toBeInTheDocument();
  });

  it('delete removes connection from store', async () => {
    mockApi.listConnections
      .mockResolvedValueOnce([{ name: 'Local', uri: 'mongodb://localhost:27017' }])
      .mockResolvedValueOnce([]);
    mockApi.deleteConnection.mockResolvedValue(undefined);

    render(<ConnectionDialog open={true} onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('Local')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /delete local/i }));

    await waitFor(() => {
      expect(mockApi.deleteConnection).toHaveBeenCalledWith('Local');
    });
  });
});
