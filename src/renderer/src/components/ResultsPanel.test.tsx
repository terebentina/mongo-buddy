import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResultsPanel, type ResultViewMode } from './ResultsPanel';
import { useStore } from '../store';

const mockApi = { find: vi.fn() };

function ResultsHarness() {
  const [viewMode, setViewMode] = useState<ResultViewMode>('table');
  return <ResultsPanel viewMode={viewMode} onViewModeChange={setViewMode} onRowClick={() => {}} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  (window as unknown as Record<string, unknown>).api = mockApi;
  useStore.setState({
    status: { status: 'connected', uri: 'mongodb://localhost', connectionKey: 'key' },
    selectedDb: 'testdb',
    selectedCollection: 'users',
    docs: [],
    totalCount: 0,
    skip: 0,
    limit: 20,
    filter: {},
    projection: null,
    queryMode: 'filter',
    resultQueryMode: 'filter',
    sort: null,
    loading: false,
  });
});

describe('ResultsPanel', () => {
  it('switches the loaded page to read-only EJSON without another request and keeps actions above the result', async () => {
    const docs = [{ _id: { $oid: '507f1f77bcf86cd799439011' }, name: 'Alice' }];
    useStore.setState({ docs, totalCount: 21 });
    render(<ResultsHarness />);

    const actions = screen.getByRole('group', { name: 'Result actions' });
    expect(within(actions).getByRole('button', { name: 'Projection options' })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: 'Delete results' })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: 'Update results' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '_id' })).toBeInTheDocument();
    await userEvent.click(within(actions).getByRole('button', { name: 'JSON' }));

    expect(screen.getByLabelText('JSON results').textContent).toBe(JSON.stringify(docs, null, 2));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'JSON' })).toHaveAttribute('aria-pressed', 'true');
    expect(mockApi.find).not.toHaveBeenCalled();
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
  });

  it('replaces JSON with the next loaded page and returns to the table without changing the query', async () => {
    const first = [{ _id: 'first' }];
    const second = [{ _id: 'second', when: { $date: '2026-09-27T00:00:00Z' } }];
    useStore.setState({ docs: first, totalCount: 2, limit: 1 });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: second, totalCount: 2 } });
    render(<ResultsHarness />);

    await userEvent.click(screen.getByRole('button', { name: 'JSON' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByLabelText('JSON results').textContent).toBe(JSON.stringify(second, null, 2));
    expect(screen.getByRole('spinbutton')).toHaveValue(2);
    expect(useStore.getState().skip).toBe(1);
    await userEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.getByRole('columnheader', { name: 'when' })).toBeInTheDocument();
    expect(screen.queryByLabelText('JSON results')).not.toBeInTheDocument();
  });

  it('shows every loaded aggregate document, including when the filter page limit is smaller', async () => {
    const docs = [{ total: 1 }, { total: 2 }];
    useStore.setState({ docs, totalCount: 2, limit: 1, queryMode: 'aggregate', resultQueryMode: 'aggregate' });
    render(<ResultsHarness />);

    await userEvent.click(screen.getByRole('button', { name: 'JSON' }));
    expect(screen.getByLabelText('JSON results').textContent).toBe(JSON.stringify(docs, null, 2));
    expect(mockApi.find).not.toHaveBeenCalled();
  });

  it('applies and clears a projection from JSON view while updating the visible documents', async () => {
    useStore.setState({ docs: [{ _id: '1', name: 'Alice', secret: true }], totalCount: 1 });
    mockApi.find
      .mockResolvedValueOnce({ ok: true, data: { docs: [{ _id: '1', name: 'Alice' }], totalCount: 1 } })
      .mockResolvedValueOnce({ ok: false, error: 'Clear rejected' })
      .mockResolvedValueOnce({ ok: true, data: { docs: [{ _id: '1', name: 'Alice', secret: true }], totalCount: 1 } });
    render(<ResultsHarness />);
    await userEvent.click(screen.getByRole('button', { name: 'JSON' }));
    await userEvent.click(screen.getByRole('button', { name: 'Projection options' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Projection JSON5' }), { target: { value: '{ name: 1 }' } });
    await userEvent.click(screen.getByRole('button', { name: 'Apply projection' }));

    expect(useStore.getState().projection).toEqual({ name: 1 });
    expect(screen.getByLabelText('JSON results')).toHaveTextContent('"name": "Alice"');
    expect(screen.getByLabelText('JSON results')).not.toHaveTextContent('secret');
    expect(screen.getByRole('button', { name: 'Projection options' })).toHaveAttribute('title', 'Projection active');

    await userEvent.click(screen.getByRole('button', { name: 'Projection options' }));
    expect(screen.getByRole('textbox', { name: 'Projection JSON5' })).toHaveValue('{\n  "name": 1\n}');
    await userEvent.click(screen.getByRole('button', { name: 'Clear projection' }));
    expect(screen.getByText('Clear rejected')).toBeInTheDocument();
    expect(useStore.getState().projection).toEqual({ name: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Clear projection' }));
    expect(useStore.getState().projection).toBeNull();
    expect(screen.getByLabelText('JSON results')).toHaveTextContent('secret');
    await userEvent.click(screen.getByRole('button', { name: 'Projection options' }));
    expect(screen.getByRole('textbox', { name: 'Projection JSON5' })).toHaveValue('{}');
    expect(screen.queryByText('Clear rejected')).not.toBeInTheDocument();
  });

  it('reopens a successful Apply with its projection and without a prior error', async () => {
    mockApi.find
      .mockResolvedValueOnce({ ok: false, error: 'Invalid projection' })
      .mockResolvedValueOnce({ ok: true, data: { docs: [{ name: 'Alice' }], totalCount: 1 } });
    render(<ResultsHarness />);
    await userEvent.click(screen.getByRole('button', { name: 'Projection options' }));
    const editor = screen.getByRole('textbox', { name: 'Projection JSON5' });
    fireEvent.change(editor, { target: { value: '{ name: 1, secret: 0 }' } });
    await userEvent.click(screen.getByRole('button', { name: 'Apply projection' }));
    expect(screen.getByText('Invalid projection')).toBeInTheDocument();

    fireEvent.change(editor, { target: { value: '{ name: 1 }' } });
    await userEvent.click(screen.getByRole('button', { name: 'Apply projection' }));
    expect(useStore.getState().projection).toEqual({ name: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Projection options' }));
    expect(screen.getByRole('textbox', { name: 'Projection JSON5' })).toHaveValue('{\n  "name": 1\n}');
    expect(screen.queryByText('Invalid projection')).not.toBeInTheDocument();
  });

  it('keeps the paused projection visible in Aggregate mode and prevents applying it', async () => {
    useStore.setState({ projection: { name: 1 }, queryMode: 'aggregate' });
    render(<ResultsHarness />);
    await userEvent.click(screen.getByRole('button', { name: 'JSON' }));
    const trigger = screen.getByRole('button', { name: 'Projection options' });
    expect(trigger).toHaveAttribute('title', 'Projection paused');
    await userEvent.click(trigger);
    expect(screen.getByText('Projection paused in Aggregate mode')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply projection' })).toBeDisabled();
  });

  it('retains the actions and pagination during loading, without displaying stale JSON', async () => {
    render(<ResultsHarness />);
    await userEvent.click(screen.getByRole('button', { name: 'JSON' }));
    act(() => useStore.setState({ docs: [{ name: 'stale' }], loading: true }));
    expect(screen.queryByLabelText('JSON results')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Projection options' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
  });
});
