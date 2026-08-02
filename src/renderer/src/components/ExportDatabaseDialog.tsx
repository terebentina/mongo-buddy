import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { CollectionChecklist } from './CollectionChecklist';
import { useCollectionChecklist } from '../hooks/use-collection-checklist';
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
  const checklist = useCollectionChecklist(collections, { open, initial: 'all' });
  const count = checklist.selected.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Database</DialogTitle>
          <DialogDescription>
            Choose which collections to export from <span className="font-medium text-foreground">{dbName}</span>
          </DialogDescription>
        </DialogHeader>

        <CollectionChecklist state={checklist} />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(Array.from(checklist.selected))} disabled={count === 0}>
            {count > 1 ? `Export ${count} collections` : 'Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
