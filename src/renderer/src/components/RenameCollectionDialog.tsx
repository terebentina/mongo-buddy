import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { validateCollectionName } from '../lib/validate-collection-name';

interface RenameCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  existingNames: readonly string[];
  onRename: (newName: string) => void;
}

export function RenameCollectionDialog({
  open,
  onOpenChange,
  currentName,
  existingNames,
  onRename,
}: RenameCollectionDialogProps) {
  const [name, setName] = useState(currentName);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setName(currentName);
  }

  const result = validateCollectionName(name, currentName, existingNames);
  const showError = name.trim().length > 0 && name !== currentName && !result.ok;
  const canRename = result.ok;

  const handleRename = (): void => {
    if (!result.ok) return;
    onRename(name.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRename();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename collection</DialogTitle>
          <DialogDescription>
            Rename <span className="font-medium text-foreground">{currentName}</span> within the same database.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <Input
            autoFocus
            placeholder="Collection name"
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
          <Button onClick={handleRename} disabled={!canRename}>
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
