import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useStore } from '../store';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table';
import { Button } from './ui/button';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';
import { Popover as BasePopover } from '@base-ui/react/popover';
import { Loader } from './Loader';
import { Maximize2, Copy, ArrowUp, ArrowDown, ArrowUpDown, ListFilter, EllipsisVertical } from 'lucide-react';
import { toast } from 'sonner';
import { Menu } from '@base-ui/react/menu';
import type { DistinctResult } from '../../../shared/types';

function ExpandPopover({ raw, cellValue }: { raw: string; cellValue: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button className="p-0.5 rounded hover:bg-muted" onClick={(e) => e.stopPropagation()}>
            <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        }
      />

      <PopoverContent className="w-80 max-h-64 overflow-auto" onClick={(e) => e.stopPropagation()}>
        <pre className="text-xs whitespace-pre-wrap wrap-break-word">
          {typeof cellValue === 'object' && cellValue !== null ? JSON.stringify(cellValue, null, 2) : raw}
        </pre>
        <Button
          variant="outline"
          size="sm"
          className="mt-2 w-full"
          onClick={() => {
            navigator.clipboard.writeText(raw);
            toast.success('Copied to clipboard');
            setOpen(false);
          }}
        >
          <Copy className="h-3.5 w-3.5 mr-1.5" />
          Copy
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function ColumnMenu({
  onShowDistinct,
  onShowDistinctFiltered,
  hasFilter,
}: {
  onShowDistinct: () => void;
  onShowDistinctFiltered: () => void;
  hasFilter: boolean;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover/header:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <EllipsisVertical className="h-3.5 w-3.5" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="start" className="z-50">
          <Menu.Popup className="min-w-[120px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
            <Menu.Item
              className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs cursor-pointer outline-hidden hover:bg-accent hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onShowDistinct();
              }}
            >
              <ListFilter className="h-3 w-3" />
              Show Distinct
            </Menu.Item>
            {hasFilter && (
              <Menu.Item
                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs cursor-pointer outline-hidden hover:bg-accent hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onShowDistinctFiltered();
                }}
              >
                <ListFilter className="h-3 w-3" />
                Show Distinct (Filtered)
              </Menu.Item>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function DistinctPopover({
  column,
  anchorEl,
  filter,
  onClose,
}: {
  column: string;
  anchorEl: HTMLElement;
  filter?: Record<string, unknown>;
  onClose: () => void;
}) {
  const fetchDistinct = useStore((s) => s.fetchDistinct);
  const addFilterValue = useStore((s) => s.addFilterValue);
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error'; message: string } | { status: 'done'; data: DistinctResult }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetchDistinct(column, filter).then((result) => {
      if (cancelled) return;
      if (!result || !result.ok) {
        setState({ status: 'error', message: result ? result.error : 'No collection selected' });
        return;
      }
      setState({ status: 'done', data: result.data });
    });
    return () => {
      cancelled = true;
    };
  }, [column, filter, fetchDistinct]);

  return (
    <BasePopover.Root open onOpenChange={(open) => !open && onClose()}>
      <BasePopover.Portal>
        <BasePopover.Positioner sideOffset={4} align="start" anchor={anchorEl} className="z-50">
          <BasePopover.Popup
            className="w-64 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-xs font-medium mb-2 text-muted-foreground truncate">Distinct: {column}</div>
            {state.status === 'loading' && (
              <div className="flex justify-center py-4">
                <Loader />
              </div>
            )}
            {state.status === 'error' && <div className="text-xs text-destructive py-2">{state.message}</div>}
            {state.status === 'done' && (
              <>
                <div className="max-h-64 overflow-auto space-y-0.5">
                  {state.data.values.map((value, i) => {
                    const formatted = formatCell(value);
                    const isPrimitive = typeof value !== 'object' || value === null;
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 rounded px-1.5 py-1 hover:bg-muted text-xs"
                      >
                        <span className="truncate" title={formatted}>
                          {formatted || <span className="text-muted-foreground italic">empty</span>}
                        </span>
                        {isPrimitive && (
                          <button
                            className="p-0.5 rounded hover:bg-accent shrink-0"
                            onClick={() => {
                              addFilterValue(column, value);
                              onClose();
                            }}
                          >
                            <ListFilter className="h-3 w-3 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {state.data.values.length === 0 && (
                    <div className="text-xs text-muted-foreground py-2 text-center">No values</div>
                  )}
                </div>
                {state.data.truncated && (
                  <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">Showing first 1000 values</div>
                )}
              </>
            )}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}

function snapshotColumnWidths(
  tableRef: React.RefObject<HTMLTableElement | null>,
  columns: string[]
): Record<string, number> {
  const table = tableRef.current;
  if (!table) return {};
  const ths = table.querySelectorAll('thead th');
  const widths: Record<string, number> = {};
  columns.forEach((col, i) => {
    if (ths[i + 1]) widths[col] = Math.max(40, (ths[i + 1] as HTMLElement).offsetWidth);
  });
  return widths;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if ('$date' in obj) return String(obj['$date']);
    if ('$oid' in obj) return String(obj['$oid']);
    return JSON.stringify(value);
  }
  return String(value);
}

interface DocumentTableProps {
  className?: string;
  onRowClick?: (doc: Record<string, unknown>) => void;
}

export function DocumentTable({ className, onRowClick }: DocumentTableProps) {
  const docs = useStore((s) => s.docs);
  const totalCount = useStore((s) => s.totalCount);
  const skip = useStore((s) => s.skip);
  const limit = useStore((s) => s.limit);
  const loading = useStore((s) => s.loading);
  const fetchPage = useStore((s) => s.fetchPage);
  const sort = useStore((s) => s.sort);
  const setSort = useStore((s) => s.setSort);
  const queryMode = useStore((s) => s.queryMode);
  const setLimit = useStore((s) => s.setLimit);
  const addFilterValue = useStore((s) => s.addFilterValue);
  const storeFilter = useStore((s) => s.filter);
  const hasFilter = Object.keys(storeFilter).length > 0;

  const columns = useMemo(() => getColumns(docs), [docs]);
  const currentPage = Math.floor(skip / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const tableRef = useRef<HTMLTableElement>(null);

  const [pageInput, setPageInput] = useState(String(currentPage));
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [distinctState, setDistinctState] = useState<{
    column: string;
    anchor: HTMLElement;
    filter?: Record<string, unknown>;
  } | null>(null);
  const columnsKey = columns.join(',');
  const prevColumnsKey = useRef(columnsKey);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    if (prevColumnsKey.current !== columnsKey) {
      setColumnWidths({});
      prevColumnsKey.current = columnsKey;
    }
  }, [columnsKey]);

  const handleAutoResize = useCallback(
    (col: string) => {
      const table = tableRef.current;
      if (!table) return;
      const style = getComputedStyle(table);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      // Measure header (font-medium = weight 500)
      ctx.font = `500 ${style.fontSize} ${style.fontFamily}`;
      const headerTextWidth = ctx.measureText(col).width;
      const sortIconWidth = queryMode === 'aggregate' ? 0 : 18; // 14px icon + 4px gap
      const menuIconWidth = queryMode === 'filter' && col !== '_id' ? 18 : 0; // 14px icon + 4px gap
      const headerPadding = 40; // px-4 (16px) + pr-6 (24px)
      const headerWidth = headerTextWidth + sortIconWidth + menuIconWidth + headerPadding;

      // Measure body cells (normal weight)
      ctx.font = `400 ${style.fontSize} ${style.fontFamily}`;
      const cellPadding = 24; // px-3 (12px) * 2
      let maxWidth = headerWidth;
      for (const doc of docs) {
        const textWidth = ctx.measureText(formatCell(doc[col])).width;
        maxWidth = Math.max(maxWidth, textWidth + cellPadding);
      }

      const snapshot = snapshotColumnWidths(tableRef, columns);
      setColumnWidths({ ...snapshot, [col]: Math.max(40, Math.ceil(maxWidth) + 2) });
    },
    [docs, queryMode, columns]
  );

  const handleResizeStart = useCallback(
    (col: string, startX: number, startWidth: number) => {
      const snapshot = snapshotColumnWidths(tableRef, columns);
      document.body.style.userSelect = 'none';

      const onMouseMove = (e: MouseEvent): void => {
        const newWidth = Math.max(40, startWidth + e.clientX - startX);
        setColumnWidths({ ...snapshot, [col]: newWidth });
      };

      const onMouseUp = (): void => {
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [columns]
  );

  if (loading) {
    return <Loader className="flex-1" />;
  }

  if (docs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">No documents found</div>
    );
  }

  return (
    <div className={`flex flex-col ${className ?? ''}`}>
      <div className="flex-1 overflow-auto">
        <Table ref={tableRef} style={{ tableLayout: 'fixed', minWidth: columns.length * 150 + 48 }}>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="w-12 px-2 text-right text-muted-foreground select-none border-r border-border">
                #
              </TableHead>
              {columns.map((col) => {
                const isAggregate = queryMode === 'aggregate';
                const sortDir = sort && col in sort ? sort[col] : null;
                const SortIcon = sortDir === 1 ? ArrowUp : sortDir === -1 ? ArrowDown : ArrowUpDown;
                const showMenu = !isAggregate && col !== '_id';
                return (
                  <TableHead
                    key={col}
                    className={`group/header px-4 pr-6 relative select-none overflow-hidden border-r border-border last:border-r-0 ${isAggregate ? '' : 'cursor-pointer'}`}
                    style={columnWidths[col] > 0 ? { width: columnWidths[col] } : undefined}
                    onClick={isAggregate ? undefined : () => setSort(col)}
                  >
                    <span className="flex items-center gap-1 min-w-0 w-full">
                      <span className="truncate">{col}</span>
                      <span className="ml-auto shrink-0 flex items-center gap-1">
                        {!isAggregate && (
                          <SortIcon
                            className={`h-3.5 w-3.5 shrink-0 ${sortDir ? 'text-foreground' : 'text-muted-foreground/50'}`}
                          />
                        )}
                        {showMenu && (
                          <ColumnMenu
                            hasFilter={hasFilter}
                            onShowDistinct={() => {
                              const selector = `thead th:nth-child(${columns.indexOf(col) + 2})`;
                              const th = tableRef.current?.querySelector(selector);
                              if (th) setDistinctState({ column: col, anchor: th as HTMLElement });
                            }}
                            onShowDistinctFiltered={() => {
                              const selector = `thead th:nth-child(${columns.indexOf(col) + 2})`;
                              const th = tableRef.current?.querySelector(selector);
                              if (th) setDistinctState({ column: col, anchor: th as HTMLElement, filter: storeFilter });
                            }}
                          />
                        )}
                      </span>
                    </span>
                    <div
                      className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-border"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        const th = e.currentTarget.parentElement!;
                        handleResizeStart(col, e.clientX, th.offsetWidth);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleAutoResize(col);
                      }}
                    />
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.map((doc, i) => (
              <TableRow
                key={doc._id != null ? formatCell(doc._id) || i : i}
                className={`group/row even:bg-muted-row ${onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''}`}
                onClick={() => onRowClick?.(doc)}
              >
                <TableCell className="w-12 px-2 text-right text-muted-foreground tabular-nums">{i + 1}</TableCell>
                {columns.map((col) => {
                  const cellValue = doc[col];
                  const raw = formatCell(cellValue);
                  const isPrimitive = typeof cellValue !== 'object' || cellValue === null;
                  const showFilter = isPrimitive && queryMode === 'filter';
                  return (
                    <TableCell key={col} className="overflow-visible relative group">
                      <span className="block truncate">{raw}</span>
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 rounded px-1 bg-background group-even/row:bg-muted-row">
                        {showFilter && (
                          <button
                            className="p-0.5 rounded hover:bg-muted"
                            onClick={(e) => {
                              e.stopPropagation();
                              addFilterValue(col, cellValue as string | number | boolean | null);
                            }}
                          >
                            <ListFilter className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        )}
                        <ExpandPopover raw={raw} cellValue={cellValue} />
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {distinctState && (
          <DistinctPopover
            column={distinctState.column}
            anchorEl={distinctState.anchor}
            filter={distinctState.filter}
            onClose={() => setDistinctState(null)}
          />
        )}
      </div>
      <div className="flex items-center gap-4 px-4 py-2 border-t">
        <Button variant="outline" size="sm" disabled={skip === 0} onClick={() => fetchPage(Math.max(0, skip - limit))}>
          Previous
        </Button>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          Page
          <input
            type="number"
            className="w-14 h-7 px-1.5 text-center text-sm border rounded bg-background"
            value={pageInput}
            min={1}
            max={totalPages}
            onChange={(e) => setPageInput(e.target.value)}
            onBlur={() => {
              const page = Math.max(1, Math.min(totalPages, Math.floor(Number(pageInput)) || 1));
              setPageInput(String(page));
              fetchPage((page - 1) * limit);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
          of {totalPages}
        </span>
        <select
          className="h-7 px-1.5 text-sm border rounded bg-background text-foreground"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
        >
          {[10, 20, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          disabled={skip + limit >= totalCount}
          onClick={() => fetchPage(skip + limit)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function getColumns(docs: Record<string, unknown>[]): string[] {
  const keySet = new Set<string>();
  for (const doc of docs.slice(0, 20)) {
    for (const key of Object.keys(doc)) {
      keySet.add(key);
    }
  }
  const keys = Array.from(keySet);
  const idIndex = keys.indexOf('_id');
  if (idIndex > 0) {
    keys.splice(idIndex, 1);
    keys.unshift('_id');
  }
  return keys;
}
