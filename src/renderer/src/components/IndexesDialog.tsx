import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table';
import { Loader } from './Loader';
import type { IndexInfo } from '../../../shared/types';

interface IndexesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  db: string;
  collection: string;
}

function formatKeyValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function IndexesDialogBody({ db, collection }: { db: string; collection: string }) {
  const [indexes, setIndexes] = useState<IndexInfo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDrop, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void window.api.listIndexes(db, collection).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.ok) {
        setIndexes(result.data);
      } else {
        setError(result.error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [db, collection]);

  const handleConfirmDrop = async (): Promise<void> => {
    if (pendingDrop === null) return;
    const name = pendingDrop;
    setDeleting(true);
    const result = await window.api.dropIndex(db, collection, name);
    setDeleting(false);
    setPendingDelete(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Dropped index "${name}"`);
    setIndexes((prev) => (prev === null ? null : prev.filter((i) => i.name !== name)));
  };

  if (loading) return <Loader className="py-8" />;
  if (error !== null) return <p className="text-sm text-destructive">{error}</p>;
  if (indexes === null || indexes.length === 0) {
    return <p className="text-sm text-muted-foreground">No indexes.</p>;
  }

  return (
    <>
      <div className="max-h-[60vh] overflow-y-auto rounded-md border border-input">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Keys</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {indexes.map((idx) => (
              <TableRow key={idx.name}>
                <TableCell className="font-medium align-top">{idx.name}</TableCell>
                <TableCell className="font-mono text-xs whitespace-pre">
                  {Object.entries(idx.key)
                    .map(([field, value]) => `${field}: ${formatKeyValue(value)}`)
                    .join('\n')}
                </TableCell>
                <TableCell className="align-top text-right">
                  {idx.name !== '_id_' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Drop index ${idx.name}`}
                      onClick={() => setPendingDelete(idx.name)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog
        open={pendingDrop !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Drop index</DialogTitle>
            <DialogDescription>
              Drop index <strong>{pendingDrop}</strong> from <strong>{collection}</strong>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDrop} disabled={deleting}>
              Drop
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function IndexesDialog({ open, onOpenChange, db, collection }: IndexesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Indexes</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{collection}</span>
          </DialogDescription>
        </DialogHeader>
        {open && <IndexesDialogBody db={db} collection={collection} />}
      </DialogContent>
    </Dialog>
  );
}
