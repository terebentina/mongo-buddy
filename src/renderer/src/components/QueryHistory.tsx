import { useState } from 'react';
import { useStore } from '../store';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { ScrollArea } from './ui/scroll-area';
import { History, Filter, Layers, Trash2 } from 'lucide-react';
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

export function QueryHistory(): JSX.Element {
  const [open, setOpen] = useState(false);
  const queryHistory = useStore((s) => s.queryHistory);
  const restoreFromHistory = useStore((s) => s.restoreFromHistory);

  const handleClick = async (entry: QueryHistoryEntry): Promise<void> => {
    await restoreFromHistory(entry);
    setOpen(false);
  };

  const handleClear = (): void => {
    useStore.setState({ queryHistory: [] });
    window.api.clearHistory();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <History className="h-4 w-4 mr-1" />
          History
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        {queryHistory.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">No query history yet</div>
        ) : (
          <>
            <ScrollArea className="max-h-72">
              <div className="flex flex-col">
                {queryHistory.map((entry) => (
                  <button
                    key={entry.id}
                    className="flex items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition-colors border-b last:border-b-0"
                    onClick={() => handleClick(entry)}
                  >
                    {entry.type === 'filter' ? (
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
  );
}
