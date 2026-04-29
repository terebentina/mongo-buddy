import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import type { CollectionInfo } from '../../../shared/types';

interface DropDatabaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbName: string;
  collections: CollectionInfo[];
  onConfirm: (selected: string[]) => void;
}

export function DropDatabaseDialog({ open, onOpenChange, dbName, collections, onConfirm }: DropDatabaseDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmText, setConfirmText] = useState('');
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setSelected(new Set());
      setConfirmText('');
    }
  }

  const headerRef = useRef<HTMLInputElement>(null);
  const allChecked = selected.size === collections.length && collections.length > 0;
  const noneChecked = selected.size === 0;

  useEffect(() => {
    if (headerRef.current) {
      headerRef.current.indeterminate = !allChecked && !noneChecked;
    }
  }, [allChecked, noneChecked]);

  const toggleAll = (): void => {
    setSelected(allChecked ? new Set() : new Set(collections.map((c) => c.name)));
  };

  const toggleOne = (name: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleConfirm = (): void => {
    onConfirm(Array.from(selected));
  };

  const count = selected.size;
  const confirmed = confirmText === dbName;
  const canDrop = count > 0 && confirmed;
  const buttonLabel = count > 1 ? `Drop ${count} collections` : 'Drop';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Drop collections</DialogTitle>
          <DialogDescription>
            Choose collections to permanently drop from <span className="font-medium text-foreground">{dbName}</span>.
            This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium px-1">
            <input
              ref={headerRef}
              type="checkbox"
              checked={allChecked}
              onChange={toggleAll}
              className="rounded border-input"
            />
            <span>Select all ({collections.length})</span>
          </label>
          <div className="max-h-60 overflow-y-auto rounded-md border border-input">
            {collections.map((coll, i) => (
              <label
                key={coll.name}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 ${i > 0 ? 'border-t border-input' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(coll.name)}
                  onChange={() => toggleOne(coll.name)}
                  className="rounded border-input"
                />
                <span className="text-sm font-medium flex-1 truncate">{coll.name}</span>
                {coll.count !== undefined && (
                  <span className="text-xs text-muted-foreground">{coll.count.toLocaleString()}</span>
                )}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">
            Type <span className="font-medium text-foreground">{dbName}</span> to confirm
          </label>
          <Input
            placeholder={dbName}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={count === 0}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!canDrop}>
            {buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
