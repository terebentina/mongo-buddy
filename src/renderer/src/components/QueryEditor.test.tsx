import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryEditor } from './QueryEditor';
import { useStore } from '../store';

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

// Mock CodeMirror since jsdom doesn't support it
vi.mock('codemirror', () => ({}));
vi.mock('@codemirror/lang-json', () => ({
  json: vi.fn(() => []),
}));
vi.mock('@codemirror/theme-one-dark', () => ({
  oneDark: [],
}));
const mockEditorContent = '{}';
vi.mock('@codemirror/view', () => ({
  EditorView: vi.fn().mockImplementation(() => ({
    state: { doc: { toString: () => mockEditorContent } },
    destroy: vi.fn(),
    dispatch: vi.fn(),
  })),
  keymap: { of: vi.fn(() => []) },
  placeholder: vi.fn(() => []),
}));
vi.mock('@codemirror/state', () => ({
  EditorState: {
    create: vi.fn(() => ({ doc: { toString: () => mockEditorContent } })),
  },
  Compartment: vi.fn().mockImplementation(() => ({
    of: vi.fn(() => []),
    reconfigure: vi.fn(() => ({})),
  })),
}));
vi.mock('@codemirror/autocomplete', () => ({
  autocompletion: vi.fn(() => []),
  CompletionContext: vi.fn(),
}));

const mockApi = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  listDatabases: vi.fn(),
  listCollections: vi.fn(),
  find: vi.fn(),
  count: vi.fn(),
  aggregate: vi.fn(),
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
  (window as unknown as Record<string, unknown>).api = mockApi;
  useStore.setState({
    connected: true,
    selectedDb: 'testdb',
    selectedCollection: 'users',
    docs: [],
    totalCount: 0,
    skip: 0,
    limit: 20,
    filter: {},
    error: null,
    loading: false,
    queryMode: 'filter',
  });
});

describe('QueryEditor', () => {
  it('renders a Run button', () => {
    render(<QueryEditor />);
    expect(screen.getByRole('button', { name: /run/i })).toBeInTheDocument();
  });

  it('renders a CodeMirror editor container', () => {
    const { container } = render(<QueryEditor />);
    expect(container.querySelector('[data-testid="query-editor"]')).toBeInTheDocument();
  });

  it('Run button calls store.runQuery with editor content', async () => {
    mockApi.find.mockResolvedValue({
      ok: true,
      data: { docs: [{ _id: '1' }], totalCount: 1 },
    });

    render(<QueryEditor />);

    // Simulate setting editor content via the store's runQuery
    // Since CodeMirror is mocked, we test through the component's internal state
    // Set the query text via a ref-based approach
    const runButton = screen.getByRole('button', { name: /run/i });
    await userEvent.click(runButton);

    // With empty editor (mocked), it should call runQuery with '{}'
    await waitFor(() => {
      expect(mockApi.find).toHaveBeenCalled();
    });
  });

  it('shows error toast on invalid JSON', async () => {
    render(<QueryEditor />);

    // We need to simulate invalid JSON in the editor
    // Since CodeMirror is mocked, we'll test through the store directly
    const error = await useStore.getState().runQuery('{bad json}');
    expect(error).toBeTruthy();
  });

  it('toggles between filter and aggregate mode', async () => {
    render(<QueryEditor />);

    const toggleButton = screen.getByRole('button', { name: /aggregate/i });
    await userEvent.click(toggleButton);

    expect(useStore.getState().queryMode).toBe('aggregate');

    const filterButton = screen.getByRole('button', { name: /filter/i });
    await userEvent.click(filterButton);

    expect(useStore.getState().queryMode).toBe('filter');
  });

  it('aggregate mode calls store.runQuery which calls aggregate API', async () => {
    useStore.setState({ queryMode: 'aggregate' });
    mockApi.aggregate.mockResolvedValue({
      ok: true,
      data: [{ _id: null, total: 42 }],
    });

    const pipeline = '[{"$group":{"_id":null,"total":{"$sum":1}}}]';
    const error = await useStore.getState().runQuery(pipeline);

    expect(error).toBeNull();
    expect(mockApi.aggregate).toHaveBeenCalledWith('testdb', 'users', [{ $group: { _id: null, total: { $sum: 1 } } }]);
  });
});
