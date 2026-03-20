import { useState } from 'react'
import { useStore } from './store'
import { ConnectionDialog } from './components/ConnectionDialog'
import { Sidebar } from './components/Sidebar'
import { Toaster } from './components/ui/sonner'

function App(): JSX.Element {
  const connected = useStore((s) => s.connected)
  const [dialogOpen, setDialogOpen] = useState(!connected)

  return (
    <div className="flex h-screen bg-background text-foreground">
      {connected && <Sidebar />}
      <div className="flex-1 flex items-center justify-center">
        {!connected && (
          <button
            className="text-sm text-muted-foreground underline"
            onClick={() => setDialogOpen(true)}
          >
            Connect to MongoDB
          </button>
        )}
      </div>
      <ConnectionDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <Toaster />
    </div>
  )
}

export default App
