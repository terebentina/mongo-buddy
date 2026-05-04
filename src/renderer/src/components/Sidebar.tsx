import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { ScrollArea } from './ui/scroll-area';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './ui/collapsible';
import { Button } from './ui/button';
import { Loader } from './Loader';
import { Unplug, Download, EllipsisVertical, Upload, X, Trash2, RefreshCw, KeyRound, Plus } from 'lucide-react';
import { Menu } from '@base-ui/react/menu';
import { toast } from 'sonner';
import { ImportDialog } from './ImportDialog';
import { ExportDatabaseDialog } from './ExportDatabaseDialog';
import { DropDatabaseDialog } from './DropDatabaseDialog';
import { NewDatabaseDialog } from './NewDatabaseDialog';
import { IndexesDialog } from './IndexesDialog';
import { McpStatusPill } from './McpStatusPill';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Input } from './ui/input';
import { getConnectionDisplayName } from '../lib/connection-name';
import { useOperation, waitForTerminal } from '../hooks/use-operation';
import type { CollectionInfo, ImportOptions, PickedFile } from '../../../shared/types';

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

function CollectionRow({ dbName, coll, isSelected, onSelect }: CollectionRowProps) {
  const [dropDialogOpen, setDropDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [indexesOpen, setIndexesOpen] = useState(false);

  const exp = useOperation('export-collection');
  const exporting = exp.status === 'running' || exp.status === 'pending';

  const selectDb = useStore((s) => s.selectDb);
  const selectedCollection = useStore((s) => s.selectedCollection);

  const progress = exporting && coll.count ? Math.min((exp.progress.processed / coll.count) * 100, 100) : 0;

  const handleExport = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    if (exporting) return;
    const id = await exp.start({ kind: 'export-collection', db: dbName, collection: coll.name });
    if (id === null) {
      toast.error(exp.error ?? 'Export failed');
      return;
    }
    const rec = await waitForTerminal(id);
    if (rec.status === 'succeeded' && rec.result?.kind === 'export-collection' && rec.result.path !== null) {
      toast.success(`Exported ${rec.result.exported.toLocaleString()} documents`);
      if (rec.warning) toast.warning(rec.warning);
    } else if (rec.status === 'failed' || rec.status === 'rejected') {
      toast.error(rec.error ?? 'Export failed');
    }
    exp.reset();
  };

  const handleCancel = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    await exp.cancel();
  };

  const handleDrop = async (): Promise<void> => {
    const result = await window.api.dropCollection(dbName, coll.name);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Dropped collection "${coll.name}"`);
    setDropDialogOpen(false);
    setConfirmText('');

    if (selectedCollection === coll.name) {
      await selectDb(dbName);
    } else {
      const listResult = await window.api.listCollections(dbName);
      if (listResult.ok) {
        useStore.setState({ collections: listResult.data });
      }
    }
  };

  return (
    <>
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
          {exporting && (
            <span className="text-[10px] text-muted-foreground">{exp.progress.processed.toLocaleString()}</span>
          )}
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
                      className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs cursor-pointer outline-hidden hover:bg-accent hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExport(e);
                      }}
                    >
                      <Download className="h-3 w-3" />
                      Export
                    </Menu.Item>
                    <Menu.Item
                      className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs cursor-pointer outline-hidden hover:bg-accent hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIndexesOpen(true);
                      }}
                    >
                      <KeyRound className="h-3 w-3" />
                      Indexes
                    </Menu.Item>
                    <Menu.Item
                      className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs cursor-pointer outline-hidden text-destructive hover:bg-destructive/10 data-highlighted:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDropDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                      Drop
                    </Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          )}
        </span>
      </div>
      <Dialog
        open={dropDialogOpen}
        onOpenChange={(open) => {
          setDropDialogOpen(open);
          if (!open) setConfirmText('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Drop collection</DialogTitle>
            <DialogDescription>
              This will permanently drop <strong>{coll.name}</strong> and all its documents. Type the collection name to
              confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder={coll.name}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDropDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={confirmText !== coll.name} onClick={handleDrop}>
              Drop
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <IndexesDialog open={indexesOpen} onOpenChange={setIndexesOpen} db={dbName} collection={coll.name} />
    </>
  );
}

interface DatabaseRowProps {
  dbName: string;
  isOpen: boolean;
  isGhost: boolean;
  collections: { name: string; count?: number }[];
  selectedCollection: string | null;
  loading: boolean;
  onSelectDb: () => void;
  onSelectCollection: (dbName: string, collName: string) => void;
  onRemoveGhost: () => void;
}

function parseStage(stage: string | undefined): { index: number; total: number } | null {
  if (!stage) return null;
  const m = stage.match(/^(\d+) of (\d+)$/);
  if (!m) return null;
  return { index: Number(m[1]) - 1, total: Number(m[2]) };
}

function DatabaseRow({
  dbName,
  isOpen,
  isGhost,
  collections,
  selectedCollection,
  loading,
  onSelectDb,
  onSelectCollection,
  onRemoveGhost,
}: DatabaseRowProps) {
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [pickedFiles, setPickedFiles] = useState<PickedFile[]>([]);
  const [importIndex, setImportIndex] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportableCollections, setExportableCollections] = useState<CollectionInfo[]>([]);
  const [dropDialogOpen, setDropDialogOpen] = useState(false);
  const [droppableCollections, setDroppableCollections] = useState<CollectionInfo[]>([]);

  const exp = useOperation('export-database');
  const imp = useOperation('import-collection');

  const refreshDocs = useStore((s) => s.refreshDocs);
  const refreshDatabases = useStore((s) => s.refreshDatabases);
  const selectDb = useStore((s) => s.selectDb);
  const storeSelectedDb = useStore((s) => s.selectedDb);
  const storeSelectedCollection = useStore((s) => s.selectedCollection);

  const importing = imp.status === 'running' || imp.status === 'pending';
  const exporting = exp.status === 'running' || exp.status === 'pending';
  const busy = importing || exporting;

  const exportStage = parseStage(exp.progress.stage);

  const handleUploadClick = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    const pickResult = await window.api.pickImportFile();
    if (!pickResult.ok) {
      toast.error(pickResult.error);
      return;
    }
    if (!pickResult.data || pickResult.data.length === 0) return;
    setPickedFiles(pickResult.data);
    setImportDialogOpen(true);
  };

  const handleImportConfirm = async (options: ImportOptions): Promise<void> => {
    if (pickedFiles.length === 0) return;
    const files = [...pickedFiles];
    setImportDialogOpen(false);
    setPickedFiles([]);
    setImportTotal(files.length);

    let totalInserted = 0;
    let totalSkipped = 0;
    let failed = false;
    let cancelled = false;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setImportIndex(i);

      const id = await imp.start({
        kind: 'import-collection',
        db: dbName,
        collection: file.suggestedName,
        filePath: file.filePath,
        options,
      });
      if (id === null) {
        toast.error(`Failed importing ${file.suggestedName}: ${imp.error ?? 'start rejected'}`);
        failed = true;
        break;
      }
      const rec = await waitForTerminal(id);

      if (rec.status === 'cancelled') {
        cancelled = true;
        break;
      }
      if (rec.status !== 'succeeded' || rec.result?.kind !== 'import-collection') {
        toast.error(`Failed importing ${file.suggestedName}: ${rec.error ?? 'import failed'}`);
        failed = true;
        break;
      }
      if (rec.warning) toast.warning(`${file.suggestedName}: ${rec.warning}`);
      totalInserted += rec.result.inserted;
      totalSkipped += rec.result.skipped;
    }

    imp.reset();
    setImportTotal(0);
    setImportIndex(0);

    if (!failed && !cancelled) {
      const collLabel = files.length === 1 ? 'collection' : `${files.length} collections`;
      const msg =
        totalSkipped > 0
          ? `Imported ${totalInserted.toLocaleString()} documents into ${collLabel} (${totalSkipped.toLocaleString()} duplicates skipped)`
          : `Imported ${totalInserted.toLocaleString()} documents into ${collLabel}`;
      toast.success(msg);
    } else if (cancelled) {
      toast('Import cancelled');
    }

    onSelectDb();
    await refreshDatabases();
    if (storeSelectedDb === dbName && files.some((f) => f.suggestedName === storeSelectedCollection)) {
      refreshDocs();
    }
  };

  const handleCancelImport = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    await imp.cancel();
  };

  const handleExportClick = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    if (busy) return;
    const list = await window.api.listCollections(dbName);
    if (!list.ok) {
      toast.error(list.error);
      return;
    }
    const exportable = list.data.filter((c) => c.type === 'collection');
    if (exportable.length === 0) {
      toast('Nothing to export');
      return;
    }
    setExportableCollections(exportable);
    setExportDialogOpen(true);
  };

  const handleExportConfirm = async (selected: string[]): Promise<void> => {
    setExportDialogOpen(false);
    const id = await exp.start({ kind: 'export-database', db: dbName, collections: selected });
    if (id === null) {
      toast.error(exp.error ?? 'Export failed');
      return;
    }
    const rec = await waitForTerminal(id);
    if (rec.status === 'succeeded' && rec.result?.kind === 'export-database' && rec.result.folder !== null) {
      if (rec.result.exported > 0) {
        toast.success(`Exported ${rec.result.exported.toLocaleString()} documents`);
      }
      if (rec.warning) toast.warning(rec.warning);
    } else if (rec.status === 'cancelled') {
      toast('Export cancelled');
    } else if (rec.status === 'failed' || rec.status === 'rejected') {
      toast.error(rec.error ?? 'Export failed');
    }
    exp.reset();
  };

  const handleCancelExport = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    await exp.cancel();
  };

  const handleDropClick = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    if (busy) return;
    const list = await window.api.listCollections(dbName);
    if (!list.ok) {
      toast.error(list.error);
      return;
    }
    const droppable = list.data.filter((c) => c.type === 'collection');
    if (droppable.length === 0) {
      toast('Nothing to drop');
      return;
    }
    setDroppableCollections(droppable);
    setDropDialogOpen(true);
  };

  const handleDropConfirm = async (selected: string[]): Promise<void> => {
    setDropDialogOpen(false);
    const result = await window.api.dropCollections(dbName, selected);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const { dropped, failed } = result.data;
    if (dropped.length > 0) {
      toast.success(dropped.length === 1 ? `Dropped 1 collection` : `Dropped ${dropped.length} collections`);
    }
    for (const f of failed) {
      toast.error(`Failed to drop ${f.name}: ${f.error}`);
    }
    if (storeSelectedDb === dbName) {
      if (storeSelectedCollection !== null && dropped.includes(storeSelectedCollection)) {
        await selectDb(dbName);
      } else {
        const r = await window.api.listCollections(dbName);
        if (r.ok) useStore.setState({ collections: r.data });
      }
    }
  };

  return (
    <>
      <Collapsible open={isOpen}>
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              className={`group/db w-full justify-between text-sm font-medium ${busy ? 'animate-pulse bg-accent/40' : ''}`}
              onClick={onSelectDb}
            >
              <span className={`truncate ${isGhost ? 'text-muted-foreground' : ''}`}>{dbName}</span>
              <span className="flex items-center gap-1">
                {importing && (
                  <span className="text-[10px] text-muted-foreground">
                    {importTotal > 1 && `(${importIndex + 1}/${importTotal}) `}
                    {imp.progress.processed.toLocaleString()}
                  </span>
                )}
                {exporting && (
                  <span className="text-[10px] text-muted-foreground">
                    {exportStage && exportStage.total > 1 && `(${exportStage.index + 1}/${exportStage.total}) `}
                    {exp.progress.processed.toLocaleString()}
                  </span>
                )}
                {busy ? (
                  <span
                    role="button"
                    tabIndex={0}
                    className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={importing ? handleCancelImport : handleCancelExport}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        (importing ? handleCancelImport : handleCancelExport)(e as unknown as React.MouseEvent);
                      }
                    }}
                  >
                    <X className="h-3 w-3" />
                  </span>
                ) : (
                  <Menu.Root>
                    <Menu.Trigger
                      className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover/db:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <EllipsisVertical className="h-3 w-3" />
                    </Menu.Trigger>
                    <Menu.Portal>
                      <Menu.Positioner sideOffset={4} align="start" className="z-50">
                        <Menu.Popup className="min-w-[120px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                          {!isGhost && (
                            <Menu.Item
                              className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs cursor-pointer outline-hidden hover:bg-accent hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (dbName === storeSelectedDb) {
                                  const result = await window.api.listCollections(dbName);
                                  if (result.ok) {
                                    useStore.setState({ collections: result.data });
                                  }
                                } else {
                                  onSelectDb();
                                }
                              }}
                            >
                              <RefreshCw className="h-3 w-3" />
                              Refresh
                            </Menu.Item>
                          )}
                          {!isGhost && (
                            <Menu.Item
                              className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs cursor-pointer outline-hidden hover:bg-accent hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExportClick(e);
                              }}
                            >
                              <Download className="h-3 w-3" />
                              Export
                            </Menu.Item>
                          )}
                          <Menu.Item
                            className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs cursor-pointer outline-hidden hover:bg-accent hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUploadClick(e);
                            }}
                          >
                            <Upload className="h-3 w-3" />
                            Import
                          </Menu.Item>
                          {isGhost ? (
                            <>
                              <div className="my-1 h-px bg-border" />
                              <Menu.Item
                                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs cursor-pointer outline-hidden hover:bg-accent hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveGhost();
                                }}
                              >
                                <X className="h-3 w-3" />
                                Remove
                              </Menu.Item>
                            </>
                          ) : (
                            <>
                              <div className="my-1 h-px bg-border" />
                              <Menu.Item
                                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs cursor-pointer outline-hidden text-destructive hover:bg-destructive/10 data-highlighted:bg-destructive/10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDropClick(e);
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                                Drop collections…
                              </Menu.Item>
                            </>
                          )}
                        </Menu.Popup>
                      </Menu.Positioner>
                    </Menu.Portal>
                  </Menu.Root>
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
      {pickedFiles.length > 0 && (
        <ImportDialog
          open={importDialogOpen}
          onOpenChange={(open) => {
            setImportDialogOpen(open);
            if (!open) setPickedFiles([]);
          }}
          dbName={dbName}
          files={pickedFiles}
          onConfirm={handleImportConfirm}
        />
      )}
      {exportableCollections.length > 0 && (
        <ExportDatabaseDialog
          open={exportDialogOpen}
          onOpenChange={(open) => {
            setExportDialogOpen(open);
            if (!open) setExportableCollections([]);
          }}
          dbName={dbName}
          collections={exportableCollections}
          onConfirm={handleExportConfirm}
        />
      )}
      {droppableCollections.length > 0 && (
        <DropDatabaseDialog
          open={dropDialogOpen}
          onOpenChange={(open) => {
            setDropDialogOpen(open);
            if (!open) setDroppableCollections([]);
          }}
          dbName={dbName}
          collections={droppableCollections}
          onConfirm={handleDropConfirm}
        />
      )}
    </>
  );
}

export function Sidebar({ width, onResize, onChangeConnection }: SidebarProps) {
  const databases = useStore((s) => s.databases);
  const ghostDatabases = useStore((s) => s.ghostDatabases);
  const collections = useStore((s) => s.collections);
  const selectedDb = useStore((s) => s.selectedDb);
  const selectedCollection = useStore((s) => s.selectedCollection);
  const selectDb = useStore((s) => s.selectDb);
  const selectCollection = useStore((s) => s.selectCollection);
  const addGhostDatabase = useStore((s) => s.addGhostDatabase);
  const removeGhostDatabase = useStore((s) => s.removeGhostDatabase);
  const loading = useStore((s) => s.loading);
  const uri = useStore((s) => s.uri);
  const savedConnections = useStore((s) => s.savedConnections);

  const displayName = getConnectionDisplayName(uri, savedConnections);

  const [newDbDialogOpen, setNewDbDialogOpen] = useState(false);

  const realNames = new Set(databases.map((d) => d.name));
  const displayDatabases: { name: string; isGhost: boolean }[] = [
    ...databases.map((d) => ({ name: d.name, isGhost: false })),
    ...ghostDatabases.filter((g) => !realNames.has(g)).map((name) => ({ name, isGhost: true })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const existingNames = [...databases.map((d) => d.name), ...ghostDatabases];

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
      <div className="p-3 font-semibold text-sm border-b flex items-center justify-between gap-2">
        <span className="truncate" title={displayName}>
          {displayName}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <McpStatusPill />
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
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {displayDatabases.length === 0 && !loading && (
            <p className="text-xs text-muted-foreground px-2 py-4 text-center">No databases</p>
          )}
          {displayDatabases.length === 0 && loading && <Loader className="py-4" />}
          {displayDatabases.map((db) => (
            <DatabaseRow
              key={db.name}
              dbName={db.name}
              isOpen={selectedDb === db.name}
              isGhost={db.isGhost}
              collections={collections}
              selectedCollection={selectedCollection}
              loading={loading}
              onSelectDb={() => selectDb(db.name)}
              onSelectCollection={selectCollection}
              onRemoveGhost={() => removeGhostDatabase(db.name)}
            />
          ))}
        </div>
      </ScrollArea>
      <div className="border-t p-2 shrink-0">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setNewDbDialogOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add database
        </Button>
      </div>
      <NewDatabaseDialog
        open={newDbDialogOpen}
        onOpenChange={setNewDbDialogOpen}
        existingNames={existingNames}
        onAdd={addGhostDatabase}
      />
      <div
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 active:bg-primary/40"
        onMouseDown={handleMouseDown}
      />
    </div>
  );
}
