import { useRef, useEffect, useCallback, useState } from 'react';
import { EditorView, placeholder } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { autocompletion, CompletionContext } from '@codemirror/autocomplete';
import { baseExtensions } from '../lib/editor';
import { useStore } from '../store';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { ExplainDialog } from './ExplainDialog';

const autocompleteConf = new Compartment();

const editorTheme = EditorView.theme({
  '&': { height: '100%' },
  '.cm-scroller': { overflow: 'auto' },
});

function fieldCompletion(fieldNames: string[]) {
  return autocompletion({
    override: [
      (context: CompletionContext) => {
        // Match inside a JSON key: after " that follows { or , (with optional whitespace)
        const match = context.matchBefore(/"[^"]*/);
        if (!match) return null;

        // Check that we're in a key position (not a value)
        const before = context.state.doc.sliceString(0, match.from);
        const trimmed = before.trimEnd();
        const lastChar = trimmed[trimmed.length - 1];
        if (lastChar !== '{' && lastChar !== ',') return null;

        return {
          from: match.from + 1, // after the opening "
          options: fieldNames.map((name) => ({
            label: name,
            type: 'property',
          })),
          filter: true,
        };
      },
    ],
  });
}

const MIN_EDITOR_HEIGHT = 80;
const MIN_RESULTS_HEIGHT = 200;

export function QueryEditor() {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const queryMode = useStore((s) => s.queryMode);
  const setQueryMode = useStore((s) => s.setQueryMode);
  const runQuery = useStore((s) => s.runQuery);
  const runExplain = useStore((s) => s.runExplain);
  const loading = useStore((s) => s.loading);
  const [explainOutput, setExplainOutput] = useState<Record<string, unknown> | null>(null);
  const filter = useStore((s) => s.filter);
  const fieldNames = useStore((s) => s.fieldNames);
  const pendingFilterText = useStore((s) => s.pendingFilterText);
  const pendingQueryMode = useStore((s) => s.pendingQueryMode);
  const clearPendingFilterText = useStore((s) => s.clearPendingFilterText);
  const [editorHeight, setEditorHeight] = useState(MIN_EDITOR_HEIGHT);
  const heightRef = useRef(MIN_EDITOR_HEIGHT);
  const dragging = useRef(false);
  const dragStart = useRef({ y: 0, height: MIN_EDITOR_HEIGHT, top: 0 });

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    if (!editorRef.current) return;
    e.preventDefault();
    dragging.current = true;
    dragStart.current = {
      y: e.clientY,
      height: heightRef.current,
      top: editorRef.current.getBoundingClientRect().top,
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!dragging.current) return;
      const proposed = dragStart.current.height + (e.clientY - dragStart.current.y);
      const available = window.innerHeight - MIN_RESULTS_HEIGHT - dragStart.current.top;
      const max = Math.max(MIN_EDITOR_HEIGHT, available);
      const next = Math.max(MIN_EDITOR_HEIGHT, Math.min(proposed, max));
      heightRef.current = next;
      setEditorHeight(next);
    };
    const onUp = (): void => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const getEditorText = useCallback((): string => {
    if (viewRef.current) {
      return viewRef.current.state.doc.toString();
    }
    return queryMode === 'filter' ? '{}' : '[]';
  }, [queryMode]);

  const handleRun = useCallback(async () => {
    const text = getEditorText() || (queryMode === 'filter' ? '{}' : '[]');
    const error = await runQuery(text);
    if (error) {
      toast.error(error);
    }
  }, [getEditorText, queryMode, runQuery]);

  const handleExplain = useCallback(async () => {
    const text = getEditorText() || (queryMode === 'filter' ? '{}' : '[]');
    const result = await runExplain(text);
    if (!result) return;
    if (result.ok) {
      setExplainOutput(result.data);
    } else {
      toast.error(result.error);
    }
  }, [getEditorText, queryMode, runExplain]);

  const hasActiveFilter = Object.keys(filter).length > 0 || queryMode === 'aggregate';

  const handleClear = useCallback(async () => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        changes: { from: 0, to: viewRef.current.state.doc.length, insert: '{}' },
      });
    }
    setQueryMode('filter');
    const error = await runQuery('{}');
    if (error) {
      toast.error(error);
    }
  }, [setQueryMode, runQuery]);

  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: queryMode === 'filter' ? '{}' : '[]',
      extensions: [
        ...baseExtensions({
          extraKeymaps: [
            {
              key: 'Mod-Enter',
              run: () => {
                handleRun();
                return true;
              },
            },
          ],
        }),
        placeholder('Enter query...'),
        editorTheme,
        autocompleteConf.of(fieldCompletion(fieldNames)),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply pending filter text from store (e.g. filter-by-cell, history restore)
  useEffect(() => {
    if (pendingFilterText === null || !viewRef.current) return;
    if (pendingQueryMode !== null) {
      setQueryMode(pendingQueryMode);
    }
    viewRef.current.dispatch({
      changes: { from: 0, to: viewRef.current.state.doc.length, insert: pendingFilterText },
    });
    clearPendingFilterText();
  }, [pendingFilterText, pendingQueryMode, clearPendingFilterText, setQueryMode]);

  // Update autocomplete when fieldNames change
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: autocompleteConf.reconfigure(fieldCompletion(fieldNames)),
      });
    }
  }, [fieldNames]);

  return (
    <div className="p-2 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={queryMode === 'filter' ? 'default' : 'outline'}
          onClick={() => setQueryMode('filter')}
        >
          Filter
        </Button>
        <Button
          size="sm"
          variant={queryMode === 'aggregate' ? 'default' : 'outline'}
          onClick={() => setQueryMode('aggregate')}
        >
          Aggregate
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={handleClear} disabled={!hasActiveFilter || loading}>
          Clear
        </Button>
        <Button size="sm" variant="outline" onClick={handleExplain} disabled={loading}>
          Explain
        </Button>
        <Button size="sm" onClick={handleRun} disabled={loading}>
          Run
        </Button>
      </div>
      <div
        data-testid="query-editor"
        ref={editorRef}
        className="border border-border rounded overflow-hidden"
        style={{ height: editorHeight }}
      />
      <div
        onMouseDown={handleResizeMouseDown}
        className="h-1 -mx-2 -mb-2 cursor-row-resize bg-border hover:bg-primary/20 active:bg-primary/40"
        data-testid="query-editor-resize-handle"
      />
      <ExplainDialog
        open={explainOutput !== null}
        onOpenChange={(o) => {
          if (!o) setExplainOutput(null);
        }}
        output={explainOutput}
      />
    </div>
  );
}
