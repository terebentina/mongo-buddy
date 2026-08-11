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
import type { UpdateManyInput } from '../../../shared/types';

const DEFAULT_UPDATE = '{\n  "$set": {}\n}';
const PIPELINE_EXAMPLE = '[\n  { "$set": { "data.name": "$title" } }\n]';

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
  const queryMode = useStore((s) => s.queryMode);
  const loading = useStore((s) => s.loading);
  const totalCount = useStore((s) => s.totalCount);
  const filter = useStore((s) => s.filter);

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
    let update: UpdateManyInput;
    try {
      update = JSON5.parse(editorText) as UpdateManyInput;
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

  // Aggregate results have no filter to hand to updateMany, and the store's
  // filter is stale after an aggregate run.
  if (queryMode === 'aggregate') return null;

  const isEmptyFilter = Object.keys(filter).length === 0;
  const docWord = totalCount === 1 ? 'document' : 'documents';

  return (
    <>
      <Button variant="outline" size="sm" disabled={loading || totalCount === 0} onClick={() => setOpen(true)}>
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
            <DialogDescription>
              Enter an update document or an update pipeline to apply to every matching document
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            Updates all <span className="font-medium text-foreground">{totalCount.toLocaleString()}</span> {docWord}{' '}
            matching the currently applied filter:
          </div>
          <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-24 font-mono">
            {JSON.stringify(filter, null, 2)}
          </pre>
          {isEmptyFilter && (
            <div className="text-sm text-destructive font-medium">
              The filter is empty — this will update ALL documents in the collection.
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            <div>Use an array for an update pipeline:</div>
            <pre className="mt-1 bg-muted rounded p-2 overflow-auto font-mono">{PIPELINE_EXAMPLE}</pre>
          </div>
          <div ref={editorRefCallback} className="w-full border rounded overflow-hidden h-64" />
          <div className="flex justify-end">
            <Button onClick={handleConfirm} disabled={saving}>
              Update {totalCount.toLocaleString()} {docWord}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
