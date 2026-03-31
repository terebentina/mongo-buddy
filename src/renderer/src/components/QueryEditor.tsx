import { useRef, useEffect, useCallback } from 'react';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { autocompletion, CompletionContext } from '@codemirror/autocomplete';
import { useStore } from '../store';
import { toast } from 'sonner';
import { Button } from './ui/button';

const autocompleteConf = new Compartment();

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

export function QueryEditor() {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const queryMode = useStore((s) => s.queryMode);
  const setQueryMode = useStore((s) => s.setQueryMode);
  const runQuery = useStore((s) => s.runQuery);
  const loading = useStore((s) => s.loading);
  const filter = useStore((s) => s.filter);
  const fieldNames = useStore((s) => s.fieldNames);
  const pendingFilterText = useStore((s) => s.pendingFilterText);
  const pendingQueryMode = useStore((s) => s.pendingQueryMode);
  const clearPendingFilterText = useStore((s) => s.clearPendingFilterText);

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

    const runKeymap = keymap.of([
      {
        key: 'Mod-Enter',
        run: () => {
          handleRun();
          return true;
        },
      },
    ]);

    const state = EditorState.create({
      doc: queryMode === 'filter' ? '{}' : '[]',
      extensions: [
        javascript(),
        ...(document.documentElement.classList.contains('dark')
          ? [oneDark]
          : [syntaxHighlighting(defaultHighlightStyle)]),
        runKeymap,
        placeholder('Enter query...'),
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
    <div className="border-b border-border p-2 flex flex-col gap-2">
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
        <Button size="sm" onClick={handleRun} disabled={loading}>
          Run
        </Button>
      </div>
      <div
        data-testid="query-editor"
        ref={editorRef}
        className="min-h-[80px] border border-border rounded overflow-hidden"
      />
    </div>
  );
}
