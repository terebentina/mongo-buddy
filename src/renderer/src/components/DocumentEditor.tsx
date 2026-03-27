import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { useStore } from '../store';
import { toast } from 'sonner';
import { Copy, Maximize2, Minimize2 } from 'lucide-react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { foldGutter, foldKeymap } from '@codemirror/language';
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands';

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

const editorTheme = EditorView.theme({
  '&': { height: '100%' },
  '.cm-scroller': { overflow: 'auto' },
});

export function DocumentEditor({ editDoc, onClose }: DocumentEditorProps): JSX.Element {
  const [open, setOpen] = useState(!!editDoc);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const insertDoc = useStore((s) => s.insertDoc);
  const updateDoc = useStore((s) => s.updateDoc);
  const deleteDoc = useStore((s) => s.deleteDoc);

  const isEditing = !!editDoc;

  const initialDoc = editDoc
    ? JSON.stringify(
        (() => {
          const { _id, ...rest } = editDoc;
          return rest;
        })(),
        null,
        2
      )
    : '{\n  \n}';

  useEffect(() => {
    if (!editorRef.current) return;
    const state = EditorState.create({
      doc: initialDoc,
      extensions: [
        json(),
        oneDark,
        editorTheme,
        foldGutter(),
        history(),
        keymap.of([...foldKeymap, ...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
      ],
    });
    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpen = (): void => {
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
    const editorText = viewRef.current?.state.doc.toString() ?? '';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(editorText);
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
        <DialogContent className={maximized ? 'max-w-[90vw] w-[90vw] h-[90vh] flex flex-col' : ''}>
          <button
            className="absolute right-10 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            onClick={() => setMaximized((m) => !m)}
          >
            {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            <span className="sr-only">{maximized ? 'Minimize' : 'Maximize'}</span>
          </button>
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
          <div
            ref={editorRef}
            className={`w-full border rounded overflow-hidden ${maximized ? 'flex-1 min-h-0' : 'h-64'}`}
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
