import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sidebar } from './Sidebar'
import { useStore } from '../store'

const mockApi = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  listDatabases: vi.fn(),
  listCollections: vi.fn(),
  find: vi.fn(),
  count: vi.fn(),
  sampleFields: vi.fn().mockResolvedValue({ ok: true, data: [] })
}

beforeEach(() => {
  vi.clearAllMocks()
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
    loading: false
  })
  ;(window as any).api = mockApi
})

describe('Sidebar', () => {
  it('renders database list', () => {
    useStore.setState({
      connected: true,
      databases: [
        { name: 'testdb', sizeOnDisk: 1024, empty: false },
        { name: 'admin', sizeOnDisk: 512, empty: false }
      ]
    })

    render(<Sidebar width={240} onResize={() => {}} />)

    expect(screen.getByText('testdb')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
  })

  it('click DB expands to show collections', async () => {
    mockApi.listCollections.mockResolvedValue({
      ok: true,
      data: [
        { name: 'users', type: 'collection' },
        { name: 'posts', type: 'collection' }
      ]
    })

    useStore.setState({
      connected: true,
      databases: [{ name: 'testdb', sizeOnDisk: 1024, empty: false }]
    })

    render(<Sidebar width={240} onResize={() => {}} />)

    await userEvent.click(screen.getByText('testdb'))

    expect(mockApi.listCollections).toHaveBeenCalledWith('testdb')

    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument()
      expect(screen.getByText('posts')).toBeInTheDocument()
    })
  })

  it('click collection calls store.selectCollection', async () => {
    mockApi.listCollections.mockResolvedValue({
      ok: true,
      data: [{ name: 'users', type: 'collection' }]
    })
    mockApi.find.mockResolvedValue({
      ok: true,
      data: { docs: [], totalCount: 0 }
    })

    useStore.setState({
      connected: true,
      databases: [{ name: 'testdb', sizeOnDisk: 1024, empty: false }]
    })

    render(<Sidebar width={240} onResize={() => {}} />)

    // Click to expand db (triggers selectDb which loads collections)
    await userEvent.click(screen.getByText('testdb'))

    // Wait for collections to appear
    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument()
    })

    // Click collection
    await userEvent.click(screen.getByText('users'))

    await waitFor(() => {
      expect(mockApi.find).toHaveBeenCalled()
    })
  })

  it('shows selected collection as active', async () => {
    useStore.setState({
      connected: true,
      databases: [{ name: 'testdb', sizeOnDisk: 1024, empty: false }],
      selectedDb: 'testdb',
      selectedCollection: 'users',
      collections: [
        { name: 'users', type: 'collection' },
        { name: 'posts', type: 'collection' }
      ]
    })

    render(<Sidebar width={240} onResize={() => {}} />)

    // Collapsible is controlled by selectedDb === db.name, so it should be open
    const usersItem = screen.getByText('users').closest('button')
    expect(usersItem).toHaveClass('bg-accent')
  })
})
