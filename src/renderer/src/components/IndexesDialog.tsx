import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import JSON5 from 'json5';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
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

type IndexKey = Record<string, string | number>;

const STRING_INDEX_DIRECTIONS = new Set(['2d', '2dsphere', 'text', 'geoHaystack', 'hashed']);

function parseIndexKey(text: string): { ok: true; key: IndexKey } | { ok: false; error: string } {
  let value: unknown;
  try {
    value = JSON5.parse(text);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid JSON object' };
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'The index keys must be an object.' };
  }

  const entries = Object.entries(value);
  if (entries.length === 0) return { ok: false, error: 'Add at least one index field.' };

  const hasInvalidDirection = entries.some(
    ([, direction]) =>
      !(
        (typeof direction === 'number' && Number.isFinite(direction)) ||
        (typeof direction === 'string' && STRING_INDEX_DIRECTIONS.has(direction))
      )
  );
  if (hasInvalidDirection) {
    return { ok: false, error: 'Each index direction must be a number or a supported MongoDB index type.' };
  }

  return { ok: true, key: value as IndexKey };
}

interface AddIndexDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  db: string;
  collection: string;
  onCreated: () => void | Promise<void>;
}

function AddIndexDialog({ open, onOpenChange, db, collection, onCreated }: AddIndexDialogProps) {
  const [name, setName] = useState('');
  const [keyText, setKeyText] = useState('{\n  field: 1\n}');
  const [unique, setUnique] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const parsed = parseIndexKey(keyText);
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }

    setFormError(null);
    setCreating(true);
    const trimmedName = name.trim();
    const result = await window.api.createIndex(db, collection, parsed.key, {
      name: trimmedName.length > 0 ? trimmedName : undefined,
      unique,
    });
    setCreating(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(`Added index "${result.data}"`);
    onOpenChange(false);
    await onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add index</DialogTitle>
          <DialogDescription>
            Add an index to <span className="font-medium text-foreground">{collection}</span>.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleCreate}>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="index-name">
              Index name <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="index-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="MongoDB generates a name when empty"
              disabled={creating}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="index-keys">
              Index keys
            </label>
            <textarea
              id="index-keys"
              className="flex min-h-36 w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={keyText}
              onChange={(event) => {
                setKeyText(event.target.value);
                setFormError(null);
              }}
              aria-describedby={formError === null ? undefined : 'index-keys-error'}
              aria-invalid={formError !== null}
              disabled={creating}
            />
            <p className="text-xs text-muted-foreground">Use a JSON object, for example: {'{ email: 1, name: -1 }'}</p>
            {formError !== null && (
              <p id="index-keys-error" className="text-xs text-destructive" role="alert">
                {formError}
              </p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input accent-primary"
              checked={unique}
              onChange={(event) => setUnique(event.target.checked)}
              disabled={creating}
            />
            Unique index
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              Add index
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function IndexesDialogBody({ db, collection }: { db: string; collection: string }) {
  const [indexes, setIndexes] = useState<IndexInfo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDrop, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refreshIndexes = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const result = await window.api.listIndexes(db, collection);
    setLoading(false);
    if (result.ok) {
      setIndexes(result.data);
    } else {
      setError(result.error);
    }
  }, [db, collection]);

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

  return (
    <>
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAddOpen(true)} disabled={loading}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add index
        </Button>
      </div>
      {loading ? (
        <Loader className="py-8" />
      ) : error !== null ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : indexes === null || indexes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No indexes.</p>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto rounded-md border border-input">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Keys</TableHead>
                <TableHead className="w-20">Unique</TableHead>
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
                  <TableCell className="align-top">
                    {idx.unique === true || idx.name === '_id_' ? 'Yes' : 'No'}
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
      )}
      {addOpen && (
        <AddIndexDialog open onOpenChange={setAddOpen} db={db} collection={collection} onCreated={refreshIndexes} />
      )}
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
