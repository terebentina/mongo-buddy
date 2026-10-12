import { filterResults } from '../test-fixtures';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdateManyDialog } from './UpdateManyDialog';
import { useStore } from '../store';

const mockApi = {
  updateMany: vi.fn(),
  find: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({
    selectedDb: 'testdb',
    selectedCollection: 'users',
    loading: false,
    queryMode: 'filter',
    acceptedResults: filterResults(
      {
        ...useStore.getState().acceptedResults?.appliedQuery,
        db: 'testdb',
        collection: 'users',
        filter: { status: 'active' },
      },
      [{ _id: '1' }],
      5
    ),
  });
  (window as unknown as Record<string, unknown>).api = mockApi;
});

const openDialog = async (): Promise<void> => {
  await userEvent.click(screen.getByRole('button', { name: 'Update results' }));
};

describe('UpdateManyDialog gating', () => {
  it('does not render the button in aggregate mode', () => {
    useStore.setState({ queryMode: 'aggregate' });
    render(<UpdateManyDialog />);
    expect(screen.queryByRole('button', { name: 'Update results' })).not.toBeInTheDocument();
  });

  it('disables the button while a query is loading', () => {
    useStore.setState({ loading: true });
    render(<UpdateManyDialog />);
    expect(screen.getByRole('button', { name: 'Update results' })).toBeDisabled();
  });

  it('disables the button when the match count is zero', () => {
    useStore.setState({
      acceptedResults: filterResults(
        { ...useStore.getState().acceptedResults?.appliedQuery },
        useStore.getState().acceptedResults?.docs ?? [],
        0
      ),
    });
    render(<UpdateManyDialog />);
    expect(screen.getByRole('button', { name: 'Update results' })).toBeDisabled();
  });
});

describe('UpdateManyDialog context', () => {
  it('shows the applied filter JSON and the match count', async () => {
    useStore.setState({
      acceptedResults: filterResults(
        { ...useStore.getState().acceptedResults?.appliedQuery, filter: { status: 'active' } },
        useStore.getState().acceptedResults?.docs ?? [],
        42
      ),
    });
    render(<UpdateManyDialog />);
    await openDialog();

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('"status"');
    expect(dialog.textContent).toContain('"active"');
    expect(dialog.textContent).toContain('42');
    expect(dialog.textContent).toMatch(/matching the currently applied filter/i);
  });

  it('shows a stronger whole-collection warning when the filter is empty', async () => {
    useStore.setState({
      acceptedResults: filterResults(
        { ...useStore.getState().acceptedResults?.appliedQuery, filter: {} },
        useStore.getState().acceptedResults?.docs ?? [],
        100
      ),
    });
    render(<UpdateManyDialog />);
    await openDialog();

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/ALL documents in the collection/i);
  });
});
