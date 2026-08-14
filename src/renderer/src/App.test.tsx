import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import App from './App';
import { useStore } from './store';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('./components/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('./components/QueryEditor', () => ({ QueryEditor: () => null }));
vi.mock('./components/QueryHistory', () => ({ QueryHistory: () => null }));
vi.mock('./components/ConnectionDialog', () => ({ ConnectionDialog: () => null }));
vi.mock('./components/ui/sonner', () => ({ Toaster: () => null }));
vi.mock('./components/DocumentTable', () => ({
  DocumentTable: ({ onRowClick }: { onRowClick?: (doc: Record<string, unknown>) => void }) => (
    <>
      <button onClick={() => onRowClick?.({ _id: 'original', name: 'Projected' })}>Open row</button>
      <button onClick={() => onRowClick?.({ _id: 'newer', name: 'Newer projected' })}>Open newer row</button>
    </>
  ),
}));
vi.mock('./components/DocumentEditor', () => ({
  DocumentEditor: ({ editDoc }: { editDoc?: Record<string, unknown> | null }) =>
    editDoc ? <div>Editor: {String(editDoc.name)}</div> : <div>New document</div>,
}));

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  useStore.setState({
    status: { status: 'connected', uri: 'mongodb://localhost', connectionKey: 'key' },
    selectedDb: 'testdb',
    selectedCollection: 'users',
  });
});

describe('App document editing', () => {
  it('opens the editor only after the complete document load succeeds', async () => {
    const complete = { _id: 'original', name: 'Complete', secret: true };
    const loadDocument = vi.fn().mockResolvedValue({ ok: true, data: complete });
    useStore.setState({ loadDocument });

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Open row' }));

    expect(loadDocument).toHaveBeenCalledWith('original');
    expect(await screen.findByText('Editor: Complete')).toBeInTheDocument();
  });

  it('shows an error and does not open the editor when the complete document load fails', async () => {
    const loadDocument = vi.fn().mockResolvedValue({ ok: false, error: 'Load failed' });
    useStore.setState({ loadDocument });

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Open row' }));

    expect(toast.error).toHaveBeenCalledWith('Load failed');
    expect(screen.queryByText(/^Editor:/)).not.toBeInTheDocument();
  });

  it('discards a document load after a newer row load starts', async () => {
    const firstLoad = deferred<{ ok: true; data: Record<string, unknown> }>();
    const newerLoad = deferred<{ ok: true; data: Record<string, unknown> }>();
    const loadDocument = vi.fn().mockReturnValueOnce(firstLoad.promise).mockReturnValueOnce(newerLoad.promise);
    useStore.setState({ loadDocument });

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Open row' }));
    await userEvent.click(screen.getByRole('button', { name: 'Open newer row' }));

    await act(async () => {
      newerLoad.resolve({ ok: true, data: { _id: 'newer', name: 'Newer complete' } });
      await newerLoad.promise;
    });
    expect(screen.getByText('Editor: Newer complete')).toBeInTheDocument();

    await act(async () => {
      firstLoad.resolve({ ok: true, data: { _id: 'original', name: 'First complete' } });
      await firstLoad.promise;
    });
    expect(screen.getByText('Editor: Newer complete')).toBeInTheDocument();
    expect(screen.queryByText('Editor: First complete')).not.toBeInTheDocument();
  });

  it('discards a document load after the collection selection changes', async () => {
    const load = deferred<{ ok: true; data: Record<string, unknown> }>();
    useStore.setState({ loadDocument: vi.fn().mockReturnValue(load.promise) });

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Open row' }));
    await act(async () => {
      useStore.setState({ selectedCollection: 'orders' });
    });
    await act(async () => {
      load.resolve({ ok: true, data: { _id: 'original', name: 'Wrong collection' } });
      await load.promise;
    });

    expect(screen.queryByText(/^Editor:/)).not.toBeInTheDocument();
  });
});
