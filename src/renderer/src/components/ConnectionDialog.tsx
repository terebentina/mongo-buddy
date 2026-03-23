import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { useStore } from '../store'
import { toast } from 'sonner'

interface ConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ConnectionDialog({ open, onOpenChange }: ConnectionDialogProps): JSX.Element {
  const [uri, setUri] = useState('')
  const [name, setName] = useState('')
  const connected = useStore((s) => s.connected)
  const connect = useStore((s) => s.connect)
  const savedConnections = useStore((s) => s.savedConnections)
  const loadSavedConnections = useStore((s) => s.loadSavedConnections)
  const saveConnection = useStore((s) => s.saveConnection)
  const deleteConnection = useStore((s) => s.deleteConnection)

  const handleOpenChange = (value: boolean): void => {
    if (!value && !connected) return
    onOpenChange(value)
  }

  useEffect(() => {
    if (open) {
      loadSavedConnections()
    }
  }, [open, loadSavedConnections])

  const handleConnect = async (connectUri: string): Promise<void> => {
    await connect(connectUri)
    const { error } = useStore.getState()
    if (error) {
      toast.error(error)
    } else {
      onOpenChange(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (name.trim()) {
      await saveConnection(name.trim(), uri)
    }
    await handleConnect(uri)
  }

  const handleSavedClick = async (savedUri: string): Promise<void> => {
    await handleConnect(savedUri)
  }

  const handleDelete = async (connName: string): Promise<void> => {
    await deleteConnection(connName)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        hideClose={!connected}
        onInteractOutside={(e) => { if (!connected) e.preventDefault() }}
        onEscapeKeyDown={(e) => { if (!connected) e.preventDefault() }}
      >
        <DialogHeader>
          <DialogTitle>Connect to MongoDB</DialogTitle>
          <DialogDescription>Enter your MongoDB connection URI</DialogDescription>
        </DialogHeader>

        {savedConnections.length > 0 && (
          <div className="space-y-2" data-testid="saved-connections">
            <p className="text-sm font-medium">Saved Connections</p>
            {savedConnections.map((conn) => (
              <div key={conn.name} className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="flex-1 justify-start"
                  onClick={() => handleSavedClick(conn.uri)}
                >
                  {conn.name}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(conn.name)}
                  aria-label={`Delete ${conn.name}`}
                >
                  &times;
                </Button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            placeholder="Connection name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            placeholder="mongodb://localhost:27017"
            value={uri}
            onChange={(e) => setUri(e.target.value)}
          />
          <Button type="submit" className="w-full">
            Connect
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
