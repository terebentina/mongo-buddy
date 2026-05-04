import { useState, useRef, useCallback } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { foldGutter, foldKeymap } from '@codemirror/language';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { baseExtensions } from '../lib/editor';

interface ExplainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  output: Record<string, unknown> | null;
}

const editorTheme = EditorView.theme({
  '&': { height: '100%' },
  '.cm-scroller': { overflow: 'auto' },
  '.cm-foldGutter .cm-gutterElement': {
    fontSize: '1.2em',
    lineHeight: '1.2',
    padding: '0 2px',
  },
});

function ExplainDialogBody({ output, maximized }: { output: Record<string, unknown>; maximized: boolean }) {
  const viewRef = useRef<EditorView | null>(null);

  const editorRefCallback = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        const state = EditorState.create({
          doc: JSON.stringify(output, null, 2),
          extensions: [
            ...baseExtensions({ extraKeymaps: foldKeymap }),
            editorTheme,
            foldGutter(),
            EditorState.readOnly.of(true),
          ],
        });
        viewRef.current = new EditorView({ state, parent: node });
      } else {
        viewRef.current?.destroy();
        viewRef.current = null;
      }
    },
    [output]
  );

  return (
    <div
      ref={editorRefCallback}
      className={`w-full border rounded overflow-hidden ${maximized ? 'flex-1 min-h-0' : 'h-64'}`}
    />
  );
}

export function ExplainDialog({ open, onOpenChange, output }: ExplainDialogProps) {
  const [maximized, setMaximized] = useState(() => localStorage.getItem('explain-maximized') === 'true');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={maximized ? 'max-w-[90vw] w-[90vw] h-[90vh] flex flex-col' : ''}>
        <button
          className="absolute right-10 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2"
          onClick={() =>
            setMaximized((m) => {
              const next = !m;
              localStorage.setItem('explain-maximized', String(next));
              return next;
            })
          }
        >
          {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          <span className="sr-only">{maximized ? 'Minimize' : 'Maximize'}</span>
        </button>
        <DialogHeader>
          <DialogTitle>Explain</DialogTitle>
          <DialogDescription>MongoDB query plan and execution stats</DialogDescription>
        </DialogHeader>
        {open && output !== null && <ExplainDialogBody output={output} maximized={maximized} />}
      </DialogContent>
    </Dialog>
  );
}
