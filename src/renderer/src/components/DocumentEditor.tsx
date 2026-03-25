import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { useStore } from '../store';
import { toast } from 'sonner';
import { Copy } from 'lucide-react';

interface DocumentEditorProps {
  editDoc?: Record<string, unknown> | null;
  onClose?: () => void;
}

function extractId(doc: Record<string, unknown>): string | null {
  const id = doc._id;
  if (!id) return null;
  if (typeof id === 'string') return id;
  if (typeof id === 'object' && id !== null && '$oid' in id) return (id as { $oid: string }).$oid;
  return String(id);
}

export function DocumentEditor({ editDoc, onClose }: DocumentEditorProps): JSX.Element {
  const [open, setOpen] = useState(!!editDoc);
  const [text, setText] = useState(() => {
    if (editDoc) {
      const { _id, ...rest } = editDoc;
      return JSON.stringify(rest, null, 2);
    }
    return '{\n  \n}';
  });
  const [confirming, setConfirming] = useState(false);
  const insertDoc = useStore((s) => s.insertDoc);
  const updateDoc = useStore((s) => s.updateDoc);
  const deleteDoc = useStore((s) => s.deleteDoc);

  const isEditing = !!editDoc;

  const handleOpen = (): void => {
    setText('{\n  \n}');
    setConfirming(false);
    setOpen(true);
  };

  const handleClose = (openState: boolean): void => {
    if (!openState) {
      setOpen(false);
      setConfirming(false);
      onClose?.();
    }
  };

  const handleSave = async (): Promise<void> => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      toast.error('Invalid JSON');
      return;
    }

    if (isEditing) {
      const id = extractId(editDoc!);
      if (!id) return;
      const error = await updateDoc(id, parsed);
      if (error) {
        toast.error(error);
        return;
      }
    } else {
      const error = await insertDoc(parsed);
      if (error) {
        toast.error(error);
        return;
      }
    }
    handleClose(false);
  };

  const handleDelete = async (): Promise<void> => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    const id = extractId(editDoc!);
    if (!id) return;
    const error = await deleteDoc(id);
    if (error) {
      toast.error(error);
      return;
    }
    handleClose(false);
  };

  return (
    <>
      {!isEditing && (
        <Button variant="outline" size="sm" onClick={handleOpen}>
          Add Document
        </Button>
      )}
      <Dialog open={isEditing ? true : open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Document' : 'Add Document'}</DialogTitle>
            <DialogDescription>
              {isEditing ? 'Modify the document JSON below' : 'Enter document JSON'}
            </DialogDescription>
          </DialogHeader>
          {isEditing && editDoc && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
              <span>_id: {extractId(editDoc)}</span>
              <button
                className="hover:text-foreground"
                onClick={() => {
                  navigator.clipboard.writeText(extractId(editDoc) ?? '');
                  toast.success('Copied to clipboard');
                }}
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          )}
          <textarea
            role="textbox"
            className="w-full h-64 p-2 font-mono text-sm border rounded bg-background text-foreground"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex justify-between">
            <div>
              {isEditing && (
                <Button variant="destructive" onClick={handleDelete}>
                  {confirming ? 'Confirm' : 'Delete'}
                </Button>
              )}
            </div>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
