import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import type { CollectionInfo } from '../../../shared/types';

interface ExportDatabaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbName: string;
  collections: CollectionInfo[];
  onConfirm: (selected: string[]) => void;
}

export function ExportDatabaseDialog({
  open,
  onOpenChange,
  dbName,
  collections,
  onConfirm,
}: ExportDatabaseDialogProps) {
  const allNames = useMemo(() => collections.map((c) => c.name), [collections]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(allNames));
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setSelected(new Set(allNames));
  }

  const headerRef = useRef<HTMLInputElement>(null);
  const allChecked = selected.size === allNames.length && allNames.length > 0;
  const noneChecked = selected.size === 0;

  useEffect(() => {
    if (headerRef.current) {
      headerRef.current.indeterminate = !allChecked && !noneChecked;
    }
  }, [allChecked, noneChecked]);

  const toggleAll = (): void => {
    setSelected(allChecked ? new Set() : new Set(allNames));
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
  const buttonLabel = count > 1 ? `Export ${count} collections` : 'Export';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Database</DialogTitle>
          <DialogDescription>
            Choose which collections to export from <span className="font-medium text-foreground">{dbName}</span>
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
            <span>Select all ({allNames.length})</span>
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

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={count === 0}>
            {buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
