import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocumentTable } from './DocumentTable';
import { useStore } from '../store';

const mockApi = {
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
        render(<DocumentTable onRowClick={() => {}} />);
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
    });

    render(<DocumentTable onRowClick={() => {}} />);

    expect(screen.getByText('_id')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('email')).toBeInTheDocument();
    expect(screen.getByText('age')).toBeInTheDocument();
  });

  it('renders dotted projection fields as separate columns', () => {
    const applyFilterValue = vi.fn();
    useStore.setState({
      docs: [{ data: { id: 42, name: 'some name' } }],
      projection: { 'data.id': 1, 'data.name': 1, _id: 0 },
      applyFilterValue,
    });

    render(<DocumentTable onRowClick={() => {}} />);

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
      projection,
      queryMode: resultQueryMode,
      resultQueryMode,
    });

    render(<DocumentTable onRowClick={() => {}} />);

    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(2);
    expect(headers[1]).toHaveTextContent('data');
    expect(screen.getByText('{"id":42,"name":"some name"}')).toBeInTheDocument();
  });

  it('does not open a row when the projection gives _id an unsupported value', async () => {
    const onRowClick = vi.fn();
    useStore.setState({ docs: [{ _id: 'computed', name: 'Alice' }], projection: { _id: 0 } });

    render(<DocumentTable onRowClick={onRowClick} />);
    await userEvent.click(screen.getByText('Alice'));

    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('keeps the Filter edit rule after Aggregate mode is selected', async () => {
    const onRowClick = vi.fn();
    useStore.setState({
      docs: [{ _id: 'computed', name: 'Alice' }],
      projection: { _id: '$otherId' },
      resultQueryMode: 'filter',
    });
    useStore.getState().setQueryMode('aggregate');

    render(<DocumentTable onRowClick={onRowClick} />);
    await userEvent.click(screen.getByText('Alice'));

    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('applies both results-table cell actions and explains Shift+click', () => {
    const applyFilterValue = vi.fn();
    useStore.setState({
      docs: [{ _id: '1', status: 'active' }],
      queryMode: 'filter',
      applyFilterValue,
    });

    render(<DocumentTable onRowClick={() => {}} />);

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
      queryMode: 'filter',
      applyFilterValue,
    });

    render(<DocumentTable onRowClick={() => {}} />);

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
