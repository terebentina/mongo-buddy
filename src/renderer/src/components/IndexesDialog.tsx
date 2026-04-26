import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
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

  if (loading) return <Loader className="py-8" />;
  if (error !== null) return <p className="text-sm text-destructive">{error}</p>;
  if (indexes === null || indexes.length === 0) {
    return <p className="text-sm text-muted-foreground">No indexes.</p>;
  }

  return (
    <div className="max-h-[60vh] overflow-y-auto rounded-md border border-input">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Keys</TableHead>
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
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
