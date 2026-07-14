import { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { useStore } from '../store';
import { toast } from 'sonner';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import JSON5 from 'json5';
import { foldGutter, foldKeymap } from '@codemirror/language';
import { baseExtensions } from '../lib/editor';

const DEFAULT_UPDATE = '{\n  "$set": {}\n}';

const editorTheme = EditorView.theme({
  '&': { height: '100%' },
  '.cm-scroller': { overflow: 'auto' },
});

export function UpdateManyDialog() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const viewRef = useRef<EditorView | null>(null);
  const updateManyDocs = useStore((s) => s.updateManyDocs);
  const selectedCollection = useStore((s) => s.selectedCollection);

  const editorRefCallback = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const state = EditorState.create({
        doc: DEFAULT_UPDATE,
        extensions: [...baseExtensions({ extraKeymaps: foldKeymap }), editorTheme, foldGutter()],
      });
      viewRef.current = new EditorView({ state, parent: node });
    } else {
      viewRef.current?.destroy();
      viewRef.current = null;
    }
  }, []);

  const handleOpenChange = (openState: boolean): void => {
    if (!openState) setSaving(false);
    setOpen(openState);
  };

  const handleConfirm = async (): Promise<void> => {
    const editorText = viewRef.current?.state.doc.toString() ?? '';
    let update: Record<string, unknown>;
    try {
      update = JSON5.parse(editorText);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid JSON');
      return;
    }

    setSaving(true);
    const result = await updateManyDocs(update);
    if (!result.ok) {
      setSaving(false);
      toast.error(result.error);
      return;
    }
    toast.success(
      `Matched ${result.data.matchedCount}, modified ${result.data.modifiedCount} ${
        result.data.modifiedCount === 1 ? 'document' : 'documents'
      }`
    );
    handleOpenChange(false);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Update results
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent initialFocus={() => viewRef.current?.contentDOM ?? null}>
          <DialogHeader>
            <DialogTitle>
              Update results
              {selectedCollection && (
                <span className="text-muted-foreground font-normal"> in {selectedCollection}</span>
              )}
            </DialogTitle>
            <DialogDescription>Enter the update-operator document applied to every matching document</DialogDescription>
          </DialogHeader>
          <div ref={editorRefCallback} className="w-full border rounded overflow-hidden h-64" />
          <div className="flex justify-end">
            <Button onClick={handleConfirm} disabled={saving}>
              Update
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
