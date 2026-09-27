import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useStore } from '../store';
import { Button } from './ui/button';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';
import { DocumentTable } from './DocumentTable';
import { DeleteResultsDialog } from './DeleteResultsDialog';
import { UpdateManyDialog } from './UpdateManyDialog';
import { Loader } from './Loader';

export type ResultViewMode = 'table' | 'json';

interface ResultsPanelProps {
  viewMode: ResultViewMode;
  onViewModeChange: (mode: ResultViewMode) => void;
  onRowClick: (doc: Record<string, unknown>) => void;
}

function ProjectionPopover() {
  const projection = useStore((s) => s.projection);
  const queryMode = useStore((s) => s.queryMode);
  const applyProjection = useStore((s) => s.applyProjection);
  const clearProjection = useStore((s) => s.clearProjection);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('{}');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const active = projection !== null;
  const paused = active && queryMode === 'aggregate';

  const handleOpenChange = (nextOpen: boolean): void => {
    setOpen(nextOpen);
    if (nextOpen) {
      setDraft(projection ? JSON.stringify(projection, null, 2) : '{}');
      setError(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <button
            aria-label="Projection options"
            title={paused ? 'Projection paused' : active ? 'Projection active' : 'Projection options'}
            className={`relative inline-flex rounded p-1 hover:bg-muted ${active ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {active && <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-primary" />}
          </button>
        }
      />
      <PopoverContent className="w-96" align="start">
        <div className="mb-2 text-xs font-medium text-muted-foreground">
          {paused ? 'Projection paused in Aggregate mode' : active ? 'Projection active' : 'No projection'}
        </div>
        <textarea
          aria-label="Projection JSON5"
          className="h-36 w-full resize-y rounded border bg-background p-2 font-mono text-xs outline-hidden focus:ring-1 focus:ring-ring"
          spellCheck={false}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        {error && <div className="mt-2 text-xs text-destructive">{error}</div>}
        <div className="mt-3 flex justify-end gap-2">
          <Button
            aria-label="Clear projection"
            variant="outline"
            size="sm"
            disabled={!active || submitting}
            onClick={async () => {
              setSubmitting(true);
              const nextError = await clearProjection();
              setSubmitting(false);
              if (nextError) {
                setError(nextError);
                return;
              }
              setOpen(false);
            }}
          >
            Clear
          </Button>
          <Button
            aria-label="Apply projection"
            size="sm"
            disabled={queryMode === 'aggregate' || submitting}
            onClick={async () => {
              setSubmitting(true);
              const nextError = await applyProjection(draft);
              setSubmitting(false);
              if (nextError) {
                setError(nextError);
                return;
              }
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ResultsPanel({ viewMode, onViewModeChange, onRowClick }: ResultsPanelProps) {
  const docs = useStore((s) => s.docs);
  const totalCount = useStore((s) => s.totalCount);
  const skip = useStore((s) => s.skip);
  const limit = useStore((s) => s.limit);
  const loading = useStore((s) => s.loading);
  const fetchPage = useStore((s) => s.fetchPage);
  const setLimit = useStore((s) => s.setLimit);
  const currentPage = Math.floor(skip / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const [pageInput, setPageInput] = useState(String(currentPage));
  const [lastCurrentPage, setLastCurrentPage] = useState(currentPage);

  if (currentPage !== lastCurrentPage) {
    setLastCurrentPage(currentPage);
    setPageInput(String(currentPage));
  }

  return (
    <section aria-label="Results" className="flex flex-1 min-h-0 flex-col">
      <div role="group" aria-label="Result actions" className="flex items-center gap-3 border-y px-2 py-2">
        <div role="group" aria-label="Result view" className="flex items-center gap-1">
          <Button
            size="sm"
            variant={viewMode === 'table' ? 'default' : 'outline'}
            aria-pressed={viewMode === 'table'}
            onClick={() => onViewModeChange('table')}
          >
            Table
          </Button>
          <Button
            size="sm"
            variant={viewMode === 'json' ? 'default' : 'outline'}
            aria-pressed={viewMode === 'json'}
            onClick={() => onViewModeChange('json')}
          >
            JSON
          </Button>
        </div>
        <ProjectionPopover />
        <div className="flex-1" />
        <DeleteResultsDialog />
        <UpdateManyDialog />
      </div>
      {loading ? (
        <Loader className="flex-1" />
      ) : viewMode === 'table' ? (
        <DocumentTable onRowClick={onRowClick} />
      ) : (
        <pre aria-label="JSON results" className="flex-1 min-h-0 overflow-auto p-4 font-mono text-sm">
          {JSON.stringify(docs, null, 2)}
        </pre>
      )}
      <div className="flex items-center justify-between gap-4 border-t px-4 py-2">
        <nav aria-label="Pagination" className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            disabled={skip === 0}
            onClick={() => fetchPage(Math.max(0, skip - limit))}
          >
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
          <Button
            variant="outline"
            size="sm"
            disabled={skip + limit >= totalCount}
            onClick={() => fetchPage(skip + limit)}
          >
            Next
          </Button>
        </nav>
        <span className="text-sm text-muted-foreground">
          {totalCount.toLocaleString()} {totalCount === 1 ? 'document' : 'documents'}
        </span>
      </div>
    </section>
  );
}
