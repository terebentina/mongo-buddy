import * as React from 'react';
import { ScrollArea as BaseScrollArea } from '@base-ui/react/scroll-area';
import { cn } from '@renderer/lib/utils';

function ScrollArea({
  className,
  children,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof BaseScrollArea.Root> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <BaseScrollArea.Root ref={ref} className={cn('relative overflow-hidden', className)} {...props}>
      <BaseScrollArea.Viewport className="h-full w-full max-h-[inherit] rounded-[inherit]">
        {children}
      </BaseScrollArea.Viewport>
      <ScrollBar />
      <BaseScrollArea.Corner />
    </BaseScrollArea.Root>
  );
}

function ScrollBar() {
  return (
    <BaseScrollArea.Scrollbar
      orientation="vertical"
      className="flex touch-none select-none transition-colors h-full w-2.5 border-l border-l-transparent p-px"
    >
      <BaseScrollArea.Thumb className="w-full rounded-full bg-border" />
    </BaseScrollArea.Scrollbar>
  );
}

export { ScrollArea };
