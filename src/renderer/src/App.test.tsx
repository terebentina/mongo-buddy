import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    <button onClick={() => onRowClick?.({ _id: 'original', name: 'Projected' })}>Open row</button>
  ),
}));
vi.mock('./components/DocumentEditor', () => ({
  DocumentEditor: ({ editDoc }: { editDoc?: Record<string, unknown> | null }) =>
    editDoc ? <div>Editor: {String(editDoc.name)}</div> : <div>New document</div>,
}));

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
});
