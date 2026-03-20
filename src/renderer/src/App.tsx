import { useState, useEffect } from 'react'
import { useStore } from './store'
import { ConnectionDialog } from './components/ConnectionDialog'
import { Sidebar } from './components/Sidebar'
import { DocumentTable } from './components/DocumentTable'
import { Toaster } from './components/ui/sonner'

function App(): JSX.Element {
  const connected = useStore((s) => s.connected)
  const selectedCollection = useStore((s) => s.selectedCollection)
  const autoReconnect = useStore((s) => s.autoReconnect)
  const [dialogOpen, setDialogOpen] = useState(!connected)

  useEffect(() => {
    autoReconnect()
  }, [autoReconnect])

  return (
    <div className="flex h-screen bg-background text-foreground">
      {connected && <Sidebar />}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!connected && (
          <div className="flex-1 flex items-center justify-center">
            <button
              className="text-sm text-muted-foreground underline"
              onClick={() => setDialogOpen(true)}
            >
              Connect to MongoDB
            </button>
          </div>
        )}
        {connected && selectedCollection && <DocumentTable />}
      </div>
      <ConnectionDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <Toaster />
    </div>
  )
}

export default App
