import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { ScrollArea } from './ui/scroll-area';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './ui/collapsible';
import { Button } from './ui/button';
import { Loader } from './Loader';
import { Unplug, Download, EllipsisVertical, Upload, X } from 'lucide-react';
import { Menu } from '@base-ui/react/menu';
import { toast } from 'sonner';
import { ImportDialog } from './ImportDialog';
import type { ExportProgress, ImportOptions, ImportProgress, PickedFile } from '../../../shared/types';

interface SidebarProps {
  width: number;
  onResize: (width: number) => void;
  onChangeConnection?: () => void;
}

interface CollectionRowProps {
  dbName: string;
  coll: { name: string; count?: number };
  isSelected: boolean;
  onSelect: () => void;
}

function CollectionRow({ dbName, coll, isSelected, onSelect }: CollectionRowProps): JSX.Element {
  const [exportCount, setExportCount] = useState<number | null>(null);

  useEffect(() => {
    const cleanup = window.api.onExportProgress((data: ExportProgress) => {
      if (data.db === dbName && data.collection === coll.name) {
        setExportCount(data.count);
      }
    });
    return cleanup;
  }, [dbName, coll.name]);

  const exporting = exportCount !== null;
  const progress = exporting && coll.count ? Math.min((exportCount / coll.count) * 100, 100) : 0;

  const handleExport = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    if (exporting) return;
    setExportCount(0);
    const result = await window.api.exportCollection(dbName, coll.name);
    setExportCount(null);
    if (!result.ok) {
      toast.error(result.error);
    } else if (result.data !== null) {
      toast.success(`Exported ${result.data.toLocaleString()} documents`);
    }
  };

  const handleCancel = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    await window.api.cancelExport(dbName, coll.name);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={`group/coll w-full flex items-center justify-between text-xs rounded-md px-3 h-9 cursor-pointer relative overflow-hidden hover:bg-accent hover:text-accent-foreground ${isSelected ? 'bg-accent' : ''}`}
      style={
        exporting
          ? {
              background: `linear-gradient(to right, hsl(var(--accent)) ${progress}%, transparent ${progress}%)`,
            }
          : undefined
      }
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="truncate">{coll.name}</span>
      <span className="flex items-center gap-1">
        {coll.count !== undefined && !exporting && (
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {coll.count.toLocaleString()}
          </span>
        )}
        {exporting && <span className="text-[10px] text-muted-foreground">{exportCount.toLocaleString()}</span>}
        {exporting ? (
          <button
            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            onClick={handleCancel}
          >
            <X className="h-3 w-3" />
          </button>
        ) : (
          <Menu.Root>
            <Menu.Trigger
              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover/coll:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <EllipsisVertical className="h-3 w-3" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner sideOffset={4} align="start" className="z-50">
                <Menu.Popup className="min-w-[120px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                  <Menu.Item
                    className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs cursor-pointer outline-none hover:bg-accent hover:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExport(e);
                    }}
                  >
                    <Download className="h-3 w-3" />
                    Export
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        )}
      </span>
    </div>
  );
}

interface DatabaseRowProps {
  dbName: string;
  isOpen: boolean;
  collections: { name: string; count?: number }[];
  selectedCollection: string | null;
  loading: boolean;
  onSelectDb: () => void;
  onSelectCollection: (dbName: string, collName: string) => void;
}

function DatabaseRow({
  dbName,
  isOpen,
  collections,
  selectedCollection,
  loading,
  onSelectDb,
  onSelectCollection,
}: DatabaseRowProps): JSX.Element {
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
  const [importingCollection, setImportingCollection] = useState<string | null>(null);
  const [importCount, setImportCount] = useState(0);
  const refreshDocs = useStore((s) => s.refreshDocs);
  const storeSelectedDb = useStore((s) => s.selectedDb);
  const storeSelectedCollection = useStore((s) => s.selectedCollection);

  useEffect(() => {
    const cleanup = window.api.onImportProgress((data: ImportProgress) => {
      if (data.db === dbName && importingCollection && data.collection === importingCollection) {
        setImportCount(data.count);
      }
    });
    return cleanup;
  }, [dbName, importingCollection]);

  const importing = importingCollection !== null;

  const handleUploadClick = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    const pickResult = await window.api.pickImportFile();
    if (!pickResult.ok) {
      toast.error(pickResult.error);
      return;
    }
    if (!pickResult.data) return;
    setPickedFile(pickResult.data);
    setImportDialogOpen(true);
  };

  const handleImportConfirm = async (collection: string, options: ImportOptions): Promise<void> => {
    if (!pickedFile) return;
    const filePath = pickedFile.filePath;
    setImportDialogOpen(false);
    setPickedFile(null);
    setImportingCollection(collection);
    setImportCount(0);
    const importResult = await window.api.importCollection(dbName, collection, filePath, options);
    setImportingCollection(null);
    setImportCount(0);
    if (!importResult.ok) {
      toast.error(importResult.error);
      return;
    }
    if (importResult.data) {
      const { inserted, skipped } = importResult.data;
      const msg =
        skipped > 0
          ? `Imported ${inserted.toLocaleString()} documents (${skipped.toLocaleString()} duplicates skipped)`
          : `Imported ${inserted.toLocaleString()} documents`;
      toast.success(msg);
    }
    onSelectDb();
    if (storeSelectedDb === dbName && storeSelectedCollection === collection) {
      refreshDocs();
    }
  };

  const handleCancelImport = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    if (!importingCollection) return;
    await window.api.cancelImport(dbName, importingCollection);
    toast('Import cancelled');
  };

  return (
    <>
      <Collapsible open={isOpen}>
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              className={`group/db w-full justify-between text-sm font-medium ${importing ? 'animate-pulse bg-accent/40' : ''}`}
              onClick={onSelectDb}
            >
              <span className="truncate">{dbName}</span>
              <span className="flex items-center gap-1">
                {importing && <span className="text-[10px] text-muted-foreground">{importCount.toLocaleString()}</span>}
                {importing ? (
                  <button
                    className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    onClick={handleCancelImport}
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : (
                  <button
                    className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover/db:opacity-100 transition-opacity"
                    onClick={handleUploadClick}
                    title="Import collection"
                  >
                    <Upload className="h-3 w-3" />
                  </button>
                )}
              </span>
            </Button>
          }
        />
        <CollapsibleContent>
          <div className="ml-3 space-y-0.5">
            {collections.length === 0 && loading && <Loader className="py-2" />}
            {collections.length === 0 && !loading && (
              <p className="text-xs text-muted-foreground px-2 py-2">No collections</p>
            )}
            {[...collections]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((coll) => (
                <CollectionRow
                  key={coll.name}
                  dbName={dbName}
                  coll={coll}
                  isSelected={selectedCollection === coll.name}
                  onSelect={() => onSelectCollection(dbName, coll.name)}
                />
              ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
      {pickedFile && (
        <ImportDialog
          open={importDialogOpen}
          onOpenChange={(open) => {
            setImportDialogOpen(open);
            if (!open) setPickedFile(null);
          }}
          dbName={dbName}
          filePath={pickedFile.filePath}
          defaultCollection={pickedFile.suggestedName}
          onConfirm={handleImportConfirm}
        />
      )}
    </>
  );
}

export function Sidebar({ width, onResize, onChangeConnection }: SidebarProps): JSX.Element {
  const databases = useStore((s) => s.databases);
  const collections = useStore((s) => s.collections);
  const selectedDb = useStore((s) => s.selectedDb);
  const selectedCollection = useStore((s) => s.selectedCollection);
  const selectDb = useStore((s) => s.selectDb);
  const selectCollection = useStore((s) => s.selectCollection);
  const loading = useStore((s) => s.loading);

  const dragging = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      if (!dragging.current) return;
      const newWidth = Math.min(Math.max(e.clientX, 150), 500);
      onResize(newWidth);
    };
    const handleMouseUp = (): void => {
      dragging.current = false;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onResize]);

  return (
    <div className="border-r bg-muted/30 flex flex-col relative" style={{ width }}>
      <div className="p-3 font-semibold text-sm border-b flex items-center justify-between">
        Databases
        {onChangeConnection && (
          <button
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            onClick={onChangeConnection}
            title="Change connection"
          >
            <Unplug className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {databases.length === 0 && !loading && (
            <p className="text-xs text-muted-foreground px-2 py-4 text-center">No databases</p>
          )}
          {databases.length === 0 && loading && <Loader className="py-4" />}
          {[...databases]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((db) => (
              <DatabaseRow
                key={db.name}
                dbName={db.name}
                isOpen={selectedDb === db.name}
                collections={collections}
                selectedCollection={selectedCollection}
                loading={loading}
                onSelectDb={() => selectDb(db.name)}
                onSelectCollection={selectCollection}
              />
            ))}
        </div>
      </ScrollArea>
      <div
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 active:bg-primary/40"
        onMouseDown={handleMouseDown}
      />
    </div>
  );
}
