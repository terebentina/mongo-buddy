import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
};

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
    error: null,
    loading: false,
  });
  (window as unknown as Record<string, unknown>).api = mockApi;
});

describe('DocumentTable', () => {
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

  it('renders row number column first, then _id', () => {
    useStore.setState({
      docs: [{ name: 'Alice', _id: '1', email: 'alice@test.com' }],
      totalCount: 1,
    });

    render(<DocumentTable />);

    const headers = screen.getAllByRole('columnheader');
    expect(headers[0]).toHaveTextContent('#');
    expect(headers[1]).toHaveTextContent('_id');
  });

  it('renders long cell values with truncation class', () => {
    const longValue = 'a'.repeat(150);
    useStore.setState({
      docs: [{ _id: '1', description: longValue }],
      totalCount: 1,
    });

    render(<DocumentTable />);

    const cell = screen.getByText(longValue);
    expect(cell).toBeInTheDocument();
    expect(cell).toHaveClass('truncate');
  });

  it('JSON.stringifies nested objects in cells', () => {
    useStore.setState({
      docs: [{ _id: '1', address: { city: 'NYC', zip: '10001' } }],
      totalCount: 1,
    });

    render(<DocumentTable />);

    expect(screen.getByText('{"city":"NYC","zip":"10001"}')).toBeInTheDocument();
  });

  it('shows pagination controls (Next/Prev/page info)', () => {
    useStore.setState({
      docs: Array.from({ length: 20 }, (_, i) => ({ _id: String(i) })),
      totalCount: 50,
      skip: 0,
      limit: 20,
    });

    render(<DocumentTable />);

    const pageInput = screen.getByRole('spinbutton');
    expect(pageInput).toHaveValue(1);
    expect(
      screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent?.includes('of 3') === true)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
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
});
