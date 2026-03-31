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
      <BaseScrollArea.Viewport className="h-full w-full rounded-[inherit]">{children}</BaseScrollArea.Viewport>
      <ScrollBar orientation="vertical" />
      <BaseScrollArea.Corner />
    </BaseScrollArea.Root>
  );
}

function ScrollBar({
  className,
  orientation = 'vertical',
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof BaseScrollArea.Scrollbar> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <BaseScrollArea.Scrollbar
      ref={ref}
      orientation={orientation}
      className={cn(
        'flex touch-none select-none transition-colors',
        orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-[1px]',
        orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-[1px]',
        className
      )}
      {...props}
    >
      <BaseScrollArea.Thumb className="relative flex-1 rounded-full bg-border" />
    </BaseScrollArea.Scrollbar>
  );
}

export { ScrollArea, ScrollBar };
