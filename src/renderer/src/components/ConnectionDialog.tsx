import { useState } from 'react'
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
  const connect = useStore((s) => s.connect)

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    await connect(uri)
    const { error } = useStore.getState()
    if (error) {
      toast.error(error)
    } else {
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect to MongoDB</DialogTitle>
          <DialogDescription>Enter your MongoDB connection URI</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
