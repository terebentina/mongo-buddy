import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import type { ImportOptions, PickedFile } from '../../../shared/types';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbName: string;
  files: PickedFile[];
  onConfirm: (options: ImportOptions) => void;
}

const DUPLICATE_OPTIONS: { value: ImportOptions['onDuplicate']; label: string; desc: string }[] = [
  { value: 'skip', label: 'Skip', desc: 'Ignore duplicate documents' },
  { value: 'fail', label: 'Fail', desc: 'Stop on first duplicate' },
  { value: 'upsert', label: 'Upsert', desc: 'Replace existing documents' },
];

export function ImportDialog({ open, onOpenChange, dbName, files, onConfirm }: ImportDialogProps) {
  const [onDuplicate, setOnDuplicate] = useState<ImportOptions['onDuplicate']>('skip');
  const [clearFirst, setClearFirst] = useState(false);

  const hasDuplicates = useMemo(() => {
    const names = files.map((f) => f.suggestedName);
    return new Set(names).size !== names.length;
  }, [files]);

  const handleConfirm = (): void => {
    onConfirm({ onDuplicate, clearFirst });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import {files.length === 1 ? 'Collection' : `${files.length} Collections`}</DialogTitle>
          <DialogDescription>
            Import into <span className="font-medium text-foreground">{dbName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{files.length === 1 ? 'Collection' : 'Collections'}</label>
            <div className="max-h-60 overflow-y-auto rounded-md border border-input">
              {files.map((file, i) => (
                <div key={file.filePath} className={`px-3 py-2 ${i > 0 ? 'border-t border-input' : ''}`}>
                  <div className="text-sm font-medium">{file.suggestedName}</div>
                  <div className="text-xs text-muted-foreground truncate">{file.filePath}</div>
                </div>
              ))}
            </div>
          </div>

          {hasDuplicates && (
            <p className="text-xs text-destructive">
              Multiple files resolve to the same collection name. Remove duplicates before importing.
            </p>
          )}

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
                All existing documents in {files.length === 1 ? 'this collection' : 'these collections'} will be deleted
                before import.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={hasDuplicates}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
