import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { useStore, selectConnected } from './store';
import { ConnectionDialog } from './components/ConnectionDialog';
import { Sidebar } from './components/Sidebar';
import { DocumentTable } from './components/DocumentTable';
import { QueryEditor } from './components/QueryEditor';
import { DocumentEditor } from './components/DocumentEditor';
import { QueryHistory } from './components/QueryHistory';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { createRequestFreshness } from './lib/request-freshness';

function App() {
  const connected = useStore(selectConnected);
  const selectedDb = useStore((s) => s.selectedDb);
  const selectedCollection = useStore((s) => s.selectedCollection);
  const loadDocument = useStore((s) => s.loadDocument);
  const documentRequests = useRef(createRequestFreshness()).current;
  const [dialogOpen, setDialogOpen] = useState(!connected);
  const [editDoc, setEditDoc] = useState<Record<string, unknown> | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(240);

  const handleRowClick = useCallback(
    async (doc: Record<string, unknown>) => {
      if (!Object.prototype.hasOwnProperty.call(doc, '_id')) {
        toast.error('Document has no _id');
        return;
      }
      const requestIsCurrent = documentRequests.start();
      const requestDb = selectedDb;
      const requestCollection = selectedCollection;
      const result = await loadDocument(doc._id);
      const current = useStore.getState();
      if (!requestIsCurrent() || current.selectedDb !== requestDb || current.selectedCollection !== requestCollection) {
        return;
      }
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setEditDoc(result.data);
    },
    [documentRequests, loadDocument, selectedCollection, selectedDb]
  );

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setDialogOpen(true);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useLayoutEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (e: MediaQueryList | MediaQueryListEvent): void => {
      document.documentElement.classList.toggle('dark', e.matches);
    };
    apply(mq);
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return (
    <div className="flex h-screen bg-background text-foreground">
      {connected && (
        <Sidebar width={sidebarWidth} onResize={setSidebarWidth} onChangeConnection={() => setDialogOpen(true)} />
      )}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!connected && (
          <div className="flex-1 flex items-center justify-center">
            <button className="text-sm text-muted-foreground underline" onClick={() => setDialogOpen(true)}>
              Connect to MongoDB
            </button>
          </div>
        )}
        {connected && selectedCollection && (
          <>
            <div className="flex items-center gap-2 px-4 py-2 border-b">
              <DocumentEditor />
              <div className="flex-1" />
              <QueryHistory />
            </div>
            <QueryEditor />
            <DocumentTable className="flex-1 min-h-0" onRowClick={(doc) => void handleRowClick(doc)} />
            {editDoc && <DocumentEditor editDoc={editDoc} onClose={() => setEditDoc(null)} />}
          </>
        )}
      </div>
      <ConnectionDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <Toaster />
    </div>
  );
}

export default App;
