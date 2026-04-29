import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { validateDbName } from '../lib/validate-db-name';

interface NewDatabaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingNames: readonly string[];
  onAdd: (name: string) => void;
}

export function NewDatabaseDialog({ open, onOpenChange, existingNames, onAdd }: NewDatabaseDialogProps) {
  const [name, setName] = useState('');
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setName('');
  }

  const result = validateDbName(name, existingNames);
  const showError = name.length > 0 && !result.ok;
  const canAdd = result.ok;

  const handleAdd = (): void => {
    if (!result.ok) return;
    onAdd(name.trim());
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New database</DialogTitle>
          <DialogDescription>
            Adds a placeholder entry in the sidebar so you can import collections into a new database. The database only
            materializes on the server once its first collection is imported. Placeholders are cleared on disconnect.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <Input
            autoFocus
            placeholder="Database name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {showError && !result.ok && <p className="text-xs text-destructive">{result.error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!canAdd}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
