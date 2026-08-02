import { useId, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface TypeToConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  /** The exact string the user must type before the confirm button enables. */
  expectedName: string;
  confirmLabel: string;
  /** An additional precondition, e.g. "at least one collection is selected". */
  canConfirm?: boolean;
  onConfirm: () => void | Promise<void>;
  /** Rendered between the description and the confirm input. */
  children?: ReactNode;
}

export function TypeToConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  expectedName,
  confirmLabel,
  canConfirm = true,
  onConfirm,
  children,
}: TypeToConfirmDialogProps) {
  const inputId = useId();
  const [confirmText, setConfirmText] = useState('');
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setConfirmText('');
  }

  const enabled = confirmText === expectedName && canConfirm;

  const handleConfirm = (): void => {
    if (!enabled) return;
    void onConfirm();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {children}

        <div className="space-y-1">
          <label htmlFor={inputId} className="text-sm text-muted-foreground">
            Type <span className="font-medium text-foreground">{expectedName}</span> to confirm
          </label>
          <Input
            id={inputId}
            placeholder={expectedName}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!canConfirm}
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!enabled}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
