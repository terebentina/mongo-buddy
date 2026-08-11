import { useState } from 'react';
import { toast } from 'sonner';
import { useStore } from '../store';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { TypeToConfirmDialog } from './TypeToConfirmDialog';

export function DeleteResultsDialog() {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteResults = useStore((state) => state.deleteResults);
  const selectedCollection = useStore((state) => state.selectedCollection);
  const queryMode = useStore((state) => state.queryMode);
  const loading = useStore((state) => state.loading);
  const totalCount = useStore((state) => state.totalCount);
  const filter = useStore((state) => state.filter);

  if (queryMode === 'aggregate') return null;

  const isEmptyFilter = Object.keys(filter).length === 0;
  const documentWord = totalCount === 1 ? 'document' : 'documents';

  const handleConfirm = async (): Promise<void> => {
    if (deleting) return;
    setDeleting(true);
    const result = await deleteResults();
    if (!result.ok) {
      setDeleting(false);
      toast.error(result.error);
      return;
    }

    const deletedWord = result.data === 1 ? 'document' : 'documents';
    toast.success(`Deleted ${result.data.toLocaleString()} ${deletedWord}`);
    setDeleting(false);
    setOpen(false);
  };

  const context = (
    <div className="space-y-2 text-sm text-muted-foreground">
      <div>
        Collection: <span className="font-medium text-foreground">{selectedCollection}</span>
      </div>
      <div>
        <span className="font-medium text-foreground">{totalCount.toLocaleString()}</span> {documentWord} matched when
        the query ran.
      </div>
      <div>Applied filter:</div>
      <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-24 font-mono text-foreground">
        {JSON.stringify(filter, null, 2)}
      </pre>
    </div>
  );

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={loading || deleting || totalCount === 0 || !selectedCollection}
        onClick={() => setOpen(true)}
      >
        Delete results
      </Button>
      {isEmptyFilter ? (
        <TypeToConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title={`Delete all documents in ${selectedCollection ?? ''}`}
          description="The filter is empty. This action permanently deletes all documents in the collection."
          expectedName={selectedCollection ?? ''}
          confirmLabel="Delete all documents"
          canConfirm={!deleting}
          onConfirm={handleConfirm}
        >
          {context}
        </TypeToConfirmDialog>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete results in {selectedCollection}</DialogTitle>
              <DialogDescription>
                This action permanently deletes all documents that match the applied filter.
              </DialogDescription>
            </DialogHeader>
            {context}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" disabled={deleting} onClick={handleConfirm}>
                Delete {totalCount.toLocaleString()} {documentWord}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
