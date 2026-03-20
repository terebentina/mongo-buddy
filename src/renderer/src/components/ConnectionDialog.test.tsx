import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConnectionDialog } from './ConnectionDialog'
import { useStore } from '../store'
import { toast } from 'sonner'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn()
  }
}))

const mockApi = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  listDatabases: vi.fn(),
  listCollections: vi.fn(),
  find: vi.fn(),
  count: vi.fn()
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

describe('ConnectionDialog', () => {
  it('renders URI input and Connect button', () => {
    render(<ConnectionDialog open={true} onOpenChange={() => {}} />)

    expect(screen.getByPlaceholderText(/mongodb/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument()
  })

  it('submit calls store.connect', async () => {
    mockApi.connect.mockResolvedValue({ ok: true, data: undefined })
    mockApi.listDatabases.mockResolvedValue({ ok: true, data: [] })

    const onOpenChange = vi.fn()
    render(<ConnectionDialog open={true} onOpenChange={onOpenChange} />)

    const input = screen.getByPlaceholderText(/mongodb/i)
    await userEvent.type(input, 'mongodb://localhost:27017')
    await userEvent.click(screen.getByRole('button', { name: /connect/i }))

    await waitFor(() => {
      expect(mockApi.connect).toHaveBeenCalledWith('mongodb://localhost:27017')
    })
  })

  it('shows error toast on connection failure', async () => {
    mockApi.connect.mockResolvedValue({ ok: false, error: 'Connection refused' })

    render(<ConnectionDialog open={true} onOpenChange={() => {}} />)

    const input = screen.getByPlaceholderText(/mongodb/i)
    await userEvent.type(input, 'mongodb://badhost')
    await userEvent.click(screen.getByRole('button', { name: /connect/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Connection refused')
    })
  })

  it('hides dialog on successful connection', async () => {
    mockApi.connect.mockResolvedValue({ ok: true, data: undefined })
    mockApi.listDatabases.mockResolvedValue({ ok: true, data: [] })

    const onOpenChange = vi.fn()
    render(<ConnectionDialog open={true} onOpenChange={onOpenChange} />)

    const input = screen.getByPlaceholderText(/mongodb/i)
    await userEvent.type(input, 'mongodb://localhost:27017')
    await userEvent.click(screen.getByRole('button', { name: /connect/i }))

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })
})
