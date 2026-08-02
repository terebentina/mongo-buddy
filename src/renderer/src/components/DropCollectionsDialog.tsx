import { CollectionChecklist } from './CollectionChecklist';
import { useCollectionChecklist } from '../hooks/use-collection-checklist';
import { TypeToConfirmDialog } from './TypeToConfirmDialog';
import type { CollectionInfo } from '../../../shared/types';

interface DropCollectionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbName: string;
  collections: CollectionInfo[];
  onConfirm: (selected: string[]) => void;
}

export function DropCollectionsDialog({
  open,
  onOpenChange,
  dbName,
  collections,
  onConfirm,
}: DropCollectionsDialogProps) {
  const checklist = useCollectionChecklist(collections, { open, initial: 'none' });
  const count = checklist.selected.size;

  return (
    <TypeToConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Drop collections"
      description={
        <>
          Choose collections to permanently drop from <span className="font-medium text-foreground">{dbName}</span>.
          This cannot be undone.
        </>
      }
      expectedName={dbName}
      confirmLabel={count > 1 ? `Drop ${count} collections` : 'Drop'}
      canConfirm={count > 0}
      onConfirm={() => onConfirm(Array.from(checklist.selected))}
    >
      <CollectionChecklist state={checklist} />
    </TypeToConfirmDialog>
  );
}
