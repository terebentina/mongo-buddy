import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { validateNewCollectionName } from '../lib/validate-collection-name';

interface CreateCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbName: string;
  existingNames: readonly string[];
  onCreate: (name: string) => Promise<boolean>;
}

export function CreateCollectionDialog({
  open,
  onOpenChange,
  dbName,
  existingNames,
  onCreate,
}: CreateCollectionDialogProps) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName('');
      setCreating(false);
    }
  }

  const result = validateNewCollectionName(name, existingNames);
  const showError = name.trim().length > 0 && !result.ok;

  const handleCreate = async (): Promise<void> => {
    if (!result.ok || creating) return;
    setCreating(true);
    try {
      const created = await onCreate(name.trim());
      if (created) onOpenChange(false);
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleCreate();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!creating) onOpenChange(nextOpen);
      }}
    >
      <DialogContent hideClose={creating}>
        <DialogHeader>
          <DialogTitle>Create collection</DialogTitle>
          <DialogDescription>
            Create an empty collection in <span className="font-medium text-foreground">{dbName}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <Input
            autoFocus
            placeholder="Collection name"
            value={name}
            disabled={creating}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {showError && !result.ok && <p className="text-xs text-destructive">{result.error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={creating} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleCreate()} disabled={!result.ok || creating}>
            {creating ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
