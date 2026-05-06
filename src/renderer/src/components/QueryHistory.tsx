import { useState } from 'react';
import { useStore } from '../store';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { ScrollArea } from './ui/scroll-area';
import { History, Filter, Layers, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { QueryHistoryEntry } from '../../../shared/types';

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function truncate(str: string, max: number): string {
  const oneLine = str.replace(/\s+/g, ' ').trim();
  return oneLine.length <= max ? oneLine : oneLine.slice(0, max) + '…';
}

export function QueryHistory() {
  const [open, setOpen] = useState(false);
  const queryHistory = useStore((s) => s.queryHistory);
  const historyIndex = useStore((s) => s.historyIndex);
  const restoreFromHistory = useStore((s) => s.restoreFromHistory);
  const navigateHistory = useStore((s) => s.navigateHistory);

  const handleClick = async (entry: QueryHistoryEntry): Promise<void> => {
    await restoreFromHistory(entry);
    setOpen(false);
  };

  const handleClear = (): void => {
    useStore.setState({ queryHistory: [], historyIndex: null });
    window.api.clearHistory();
  };

  const prevDisabled = (historyIndex ?? -1) >= queryHistory.length - 1;
  const nextDisabled = historyIndex === null || historyIndex <= 0;

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        aria-label="Previous history entry"
        disabled={prevDisabled}
        onClick={() => navigateHistory(1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button variant="outline" size="sm">
              <History className="h-4 w-4 mr-1" />
              History
            </Button>
          }
        />
        <PopoverContent align="end" className="w-80 p-0">
          {queryHistory.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">No query history yet</div>
          ) : (
            <>
              <ScrollArea className="max-h-[60vh]">
                <div className="flex flex-col">
                  {queryHistory.map((entry) => (
                    <button
                      key={entry.id}
                      className="flex items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition-colors border-b last:border-b-0"
                      onClick={() => handleClick(entry)}
                    >
                      {entry.queryMode === 'filter' ? (
                        <Filter className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <Layers className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-xs text-muted-foreground">
                          {entry.db}.{entry.collection}
                        </div>
                        <div className="font-mono text-xs truncate">{truncate(entry.query, 60)}</div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap mt-0.5">
                        {formatRelativeTime(entry.timestamp)}
                      </span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
              <div className="border-t p-2">
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={handleClear}>
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear history
                </Button>
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>
      <Button
        variant="outline"
        size="sm"
        aria-label="Next history entry"
        disabled={nextDisabled}
        onClick={() => navigateHistory(-1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
