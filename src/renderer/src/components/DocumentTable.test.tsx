import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocumentTable } from './DocumentTable';
import { useStore } from '../store';

const mockApi = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  listDatabases: vi.fn(),
  listCollections: vi.fn(),
  find: vi.fn(),
  count: vi.fn(),
  distinct: vi.fn(),
};

const FILTER_VALUE_ACTION_LABEL = 'Include this value. Shift+click excludes it.';

beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({
    status: { status: 'connected', uri: 'mongodb://localhost', connectionKey: 'localhost:27017' },
    uri: 'mongodb://localhost',
    databases: [],
    collections: [],
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
    error: null,
    loading: false,
  });
  (window as unknown as Record<string, unknown>).api = mockApi;
});

describe('DocumentTable', () => {
  it.each(['filter', 'aggregate'] as const)(
    'auto-sizes a header longer than its cell values in %s mode',
    (queryMode) => {
      const column = 'a_header_longer_than_its_values';
      useStore.setState({
        docs: [{ [column]: 'x', next: 'y' }],
        totalCount: 1,
        queryMode,
        resultQueryMode: queryMode,
      });
      // jsdom has no text layout; supply deterministic canvas measurements.
      const headerTextWidth = 200;
      const context = {
        font: '',
        measureText: (text: string) => ({ width: text === column ? headerTextWidth : 8 }),
      };
      const getContext = vi
        .spyOn(HTMLCanvasElement.prototype, 'getContext')
        .mockReturnValue(context as unknown as CanvasRenderingContext2D);

      try {
        render(<DocumentTable />);
        const header = screen.getByRole('columnheader', { name: column });
        fireEvent.doubleClick(header.querySelector('.cursor-col-resize')!);

        // Match the rendered header: px-4, gap-1, a 14px menu icon with
        // p-0.5 on both sides, and (in Filter mode) a 14px sort icon + gap-1.
        const controlsWidth = queryMode === 'filter' ? 14 + 4 + 18 : 18;
        const availableTextWidth = parseFloat(header.style.width) - 32 - 4 - controlsWidth - 1;
        expect(availableTextWidth).toBeGreaterThanOrEqual(headerTextWidth);
      } finally {
        getContext.mockRestore();
      }
    }
  );

  it('renders column headers from doc keys (union of first 20 docs)', () => {
    useStore.setState({
      docs: [
        { _id: '1', name: 'Alice', email: 'alice@test.com' },
        { _id: '2', name: 'Bob', age: 30 },
      ],
      totalCount: 2,
    });

    render(<DocumentTable />);

    expect(screen.getByText('_id')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('email')).toBeInTheDocument();
    expect(screen.getByText('age')).toBeInTheDocument();
  });

  it('renders dotted projection fields as separate columns', () => {
    const applyFilterValue = vi.fn();
    useStore.setState({
      docs: [{ data: { id: 42, name: 'some name' } }],
      totalCount: 1,
      projection: { 'data.id': 1, 'data.name': 1, _id: 0 },
      applyFilterValue,
    });

    render(<DocumentTable />);

    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(3);
    expect(headers[1]).toHaveTextContent('data.id');
    expect(headers[2]).toHaveTextContent('data.name');
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('some name')).toBeInTheDocument();
    expect(screen.queryByText('{"id":42,"name":"some name"}')).not.toBeInTheDocument();

    fireEvent.click(
      within(screen.getByText('42').closest('td')!).getByRole('button', { name: FILTER_VALUE_ACTION_LABEL })
    );
    expect(applyFilterValue).toHaveBeenCalledWith('data.id', 42, 'include');
  });

  it.each([
    ['a dotted exclusion', { 'data.name': 0 }, 'filter' as const],
    ['an aggregate result', { 'data.id': 1 }, 'aggregate' as const],
  ])('keeps the parent document column for %s', (_name, projection, resultQueryMode) => {
    useStore.setState({
      docs: [{ data: { id: 42, name: 'some name' } }],
      totalCount: 1,
      projection,
      queryMode: resultQueryMode,
      resultQueryMode,
    });

    render(<DocumentTable />);

    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(2);
    expect(headers[1]).toHaveTextContent('data');
    expect(screen.getByText('{"id":42,"name":"some name"}')).toBeInTheDocument();
  });

  it('keeps the projection header and empty body state when no documents match', () => {
    render(<DocumentTable />);

    expect(screen.getByRole('columnheader')).toContainElement(
      screen.getByRole('button', { name: 'Projection options' })
    );
    expect(screen.getByText('No documents found')).toBeInTheDocument();
  });

  it('shows the active projection and clears it from the popover', async () => {
    const clearProjection = vi.fn().mockResolvedValue(null);
    useStore.setState({ projection: { name: 1 }, clearProjection });

    render(<DocumentTable />);

    const trigger = screen.getByRole('button', { name: 'Projection options' });
    expect(trigger).toHaveAttribute('title', 'Projection active');
    await userEvent.click(trigger);
    expect(screen.getByText('Projection active')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear projection' }));
    expect(clearProjection).toHaveBeenCalledOnce();
  });

  it('shows a paused projection in Aggregate mode and disables Apply', async () => {
    useStore.setState({ projection: { name: 1 }, queryMode: 'aggregate' });

    render(<DocumentTable />);

    const trigger = screen.getByRole('button', { name: 'Projection options' });
    expect(trigger).toHaveAttribute('title', 'Projection paused');
    await userEvent.click(trigger);
    expect(screen.getByText('Projection paused in Aggregate mode')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply projection' })).toBeDisabled();
  });

  it('keeps the projection content and shows the Apply error', async () => {
    const applyProjection = vi.fn().mockResolvedValue('Cannot mix inclusion and exclusion');
    useStore.setState({ applyProjection });

    render(<DocumentTable />);

    await userEvent.click(screen.getByRole('button', { name: 'Projection options' }));
    const editor = screen.getByRole('textbox', { name: 'Projection JSON5' });
    fireEvent.change(editor, { target: { value: '{ name: 1, secret: 0 }' } });
    await userEvent.click(screen.getByRole('button', { name: 'Apply projection' }));

    expect(applyProjection).toHaveBeenCalledWith('{ name: 1, secret: 0 }');
    expect(screen.getByText('Cannot mix inclusion and exclusion')).toBeInTheDocument();
    expect(editor).toHaveValue('{ name: 1, secret: 0 }');
  });

  it('does not open a row when the projection gives _id an unsupported value', async () => {
    const onRowClick = vi.fn();
    useStore.setState({ docs: [{ _id: 'computed', name: 'Alice' }], totalCount: 1, projection: { _id: 0 } });

    render(<DocumentTable onRowClick={onRowClick} />);
    await userEvent.click(screen.getByText('Alice'));

    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('keeps the Filter edit rule after Aggregate mode is selected', async () => {
    const onRowClick = vi.fn();
    useStore.setState({
      docs: [{ _id: 'computed', name: 'Alice' }],
      totalCount: 1,
      projection: { _id: '$otherId' },
      resultQueryMode: 'filter',
    });
    useStore.getState().setQueryMode('aggregate');

    render(<DocumentTable onRowClick={onRowClick} />);
    await userEvent.click(screen.getByText('Alice'));

    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('groups the pagination controls on the left', () => {
    useStore.setState({
      docs: Array.from({ length: 20 }, (_, i) => ({ _id: String(i) })),
      totalCount: 50,
      skip: 0,
      limit: 20,
    });

    render(<DocumentTable />);

    const pagination = screen.getByRole('navigation', { name: 'Pagination' });
    const pageInput = within(pagination).getByRole('spinbutton');
    expect(pageInput).toHaveValue(1);
    expect(
      within(pagination).getByText((_, el) => el?.tagName === 'SPAN' && el.textContent?.includes('of 3') === true)
    ).toBeInTheDocument();
    expect(within(pagination).getByRole('button', { name: /previous/i })).toBeInTheDocument();
    expect(within(pagination).getByRole('button', { name: /next/i })).toBeInTheDocument();
  });

  it('Next button disabled on last page', () => {
    useStore.setState({
      docs: [{ _id: '1' }],
      totalCount: 5,
      skip: 4,
      limit: 20,
    });

    render(<DocumentTable />);

    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('Prev button disabled on first page', () => {
    useStore.setState({
      docs: Array.from({ length: 20 }, (_, i) => ({ _id: String(i) })),
      totalCount: 50,
      skip: 0,
      limit: 20,
    });

    render(<DocumentTable />);

    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
  });

  it('calls store with updated skip on page change', async () => {
    mockApi.find.mockResolvedValue({
      ok: true,
      data: {
        docs: Array.from({ length: 20 }, (_, i) => ({ _id: String(i + 20) })),
        totalCount: 50,
      },
    });

    useStore.setState({
      docs: Array.from({ length: 20 }, (_, i) => ({ _id: String(i) })),
      totalCount: 50,
      skip: 0,
      limit: 20,
    });

    render(<DocumentTable />);

    await userEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(mockApi.find).toHaveBeenCalledWith('testdb', 'users', {
      filter: {},
      skip: 20,
      limit: 20,
    });
  });

  it('applies both results-table cell actions and explains Shift+click', () => {
    const applyFilterValue = vi.fn();
    useStore.setState({
      docs: [{ _id: '1', status: 'active' }],
      totalCount: 1,
      queryMode: 'filter',
      applyFilterValue,
    });

    render(<DocumentTable />);

    const actions = screen.getAllByRole('button', { name: FILTER_VALUE_ACTION_LABEL });
    const statusAction = actions.at(-1)!;
    expect(statusAction).toHaveAttribute('title', FILTER_VALUE_ACTION_LABEL);

    fireEvent.click(statusAction);
    fireEvent.click(statusAction, { shiftKey: true });

    expect(applyFilterValue).toHaveBeenNthCalledWith(1, 'status', 'active', 'include');
    expect(applyFilterValue).toHaveBeenNthCalledWith(2, 'status', 'active', 'exclude');
  });

  it.each([
    ['normal click', false, 'include' as const],
    ['Shift+click', true, 'exclude' as const],
  ])('applies a distinct value after a %s', async (_name, shiftKey, action) => {
    const applyFilterValue = vi.fn();
    mockApi.distinct.mockResolvedValue({
      ok: true,
      data: { values: ['active'], truncated: false },
    });
    useStore.setState({
      docs: [{ _id: '1', status: 'active' }],
      totalCount: 1,
      queryMode: 'filter',
      applyFilterValue,
    });

    render(<DocumentTable />);

    const statusHeader = screen.getByText('status').closest('th')!;
    await userEvent.click(within(statusHeader).getByRole('button'));
    await userEvent.click(await screen.findByText('Show Distinct'));
    const actions = await screen.findAllByRole('button', { name: FILTER_VALUE_ACTION_LABEL });
    const distinctAction = actions.at(-1)!;
    expect(distinctAction).toHaveAttribute('title', FILTER_VALUE_ACTION_LABEL);

    fireEvent.click(distinctAction, { shiftKey });

    expect(applyFilterValue).toHaveBeenCalledWith('status', 'active', action);
  });
});
