import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import type { ImportOptions } from '../../../shared/types';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbName: string;
  filePath: string;
  defaultCollection: string;
  onConfirm: (collection: string, options: ImportOptions) => void;
}

const DUPLICATE_OPTIONS: { value: ImportOptions['onDuplicate']; label: string; desc: string }[] = [
  { value: 'skip', label: 'Skip', desc: 'Ignore duplicate documents' },
  { value: 'fail', label: 'Fail', desc: 'Stop on first duplicate' },
  { value: 'upsert', label: 'Upsert', desc: 'Replace existing documents' },
];

export function ImportDialog({
  open,
  onOpenChange,
  dbName,
  filePath,
  defaultCollection,
  onConfirm,
}: ImportDialogProps): JSX.Element {
  const [collection, setCollection] = useState(defaultCollection);
  const [onDuplicate, setOnDuplicate] = useState<ImportOptions['onDuplicate']>('skip');
  const [clearFirst, setClearFirst] = useState(false);

  const handleConfirm = (): void => {
    if (!collection.trim()) return;
    onConfirm(collection.trim(), { onDuplicate, clearFirst });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Collection</DialogTitle>
          <DialogDescription>
            Import into <span className="font-medium text-foreground">{dbName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">File</label>
            <Input value={filePath} readOnly className="text-xs text-muted-foreground" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Collection name</label>
            <Input value={collection} onChange={(e) => setCollection(e.target.value)} autoFocus />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Duplicate handling</label>
            <div className="flex gap-2">
              {DUPLICATE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                    onDuplicate === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input hover:bg-muted'
                  }`}
                  onClick={() => setOnDuplicate(opt.value)}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={clearFirst}
                onChange={(e) => setClearFirst(e.target.checked)}
                className="rounded border-input"
              />
              <span className="font-medium">Clear collection first</span>
            </label>
            {clearFirst && (
              <p className="text-xs text-destructive ml-6">
                All existing documents in this collection will be deleted before import.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!collection.trim()}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
