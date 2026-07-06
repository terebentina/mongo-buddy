import { useState } from 'react';
import { WINDOW_COLORS, type WindowColor } from '../../../shared/types';
import { useStore } from '../store';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';

export function WindowColorPicker() {
  const windowColor = useStore((s) => s.windowColor);
  const setWindowColor = useStore((s) => s.setWindowColor);
  const [open, setOpen] = useState(false);

  const pick = (color: WindowColor | null): void => {
    setWindowColor(color);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex items-center justify-center h-5 w-5 rounded hover:bg-muted text-sm leading-none"
        title="Window color"
      >
        {windowColor ?? <span className="h-3 w-3 rounded-full border border-muted-foreground" />}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-2">
        <div className="flex items-center gap-1">
          {WINDOW_COLORS.map((color) => (
            <button
              key={color}
              className="flex items-center justify-center h-6 w-6 rounded hover:bg-muted text-base leading-none data-selected:bg-accent"
              data-selected={windowColor === color ? '' : undefined}
              onClick={() => pick(color)}
              title={color}
            >
              {color}
            </button>
          ))}
          <button
            className="ml-1 px-2 h-6 rounded hover:bg-muted text-xs text-muted-foreground hover:text-foreground"
            onClick={() => pick(null)}
            title="Clear window color"
          >
            Clear
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
