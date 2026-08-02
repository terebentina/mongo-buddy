import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TypeToConfirmDialog } from './TypeToConfirmDialog';

const renderDialog = (
  props: Partial<React.ComponentProps<typeof TypeToConfirmDialog>> = {}
): { onConfirm: ReturnType<typeof vi.fn>; onOpenChange: ReturnType<typeof vi.fn> } => {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <TypeToConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Drop collection"
      description="This cannot be undone."
      expectedName="users"
      confirmLabel="Drop"
      onConfirm={onConfirm}
      {...props}
    />
  );
  return { onConfirm, onOpenChange };
};

describe('TypeToConfirmDialog gate', () => {
  it('disables the confirm button until the typed name matches', async () => {
    renderDialog();
    const confirm = screen.getByRole('button', { name: 'Drop' });
    expect(confirm).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/type users to confirm/i), 'user');
    expect(confirm).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/type users to confirm/i), 's');
    expect(confirm).toBeEnabled();
  });

  it('requires an exact match, rejecting surrounding whitespace', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText(/type users to confirm/i), ' users ');

    expect(screen.getByRole('button', { name: 'Drop' })).toBeDisabled();
  });

  it('confirms on Enter once the name matches', async () => {
    const { onConfirm } = renderDialog();
    await userEvent.type(screen.getByLabelText(/type users to confirm/i), 'users{Enter}');

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('ignores Enter while the name does not match', async () => {
    const { onConfirm } = renderDialog();
    await userEvent.type(screen.getByLabelText(/type users to confirm/i), 'user{Enter}');

    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('TypeToConfirmDialog second gate', () => {
  it('disables the input and the confirm button when canConfirm is false', () => {
    renderDialog({ canConfirm: false });

    expect(screen.getByLabelText(/type users to confirm/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Drop' })).toBeDisabled();
  });

  it('keeps the confirm button disabled on a matching name while canConfirm is false', async () => {
    const { onConfirm } = renderDialog({ canConfirm: false });
    const input = screen.getByLabelText(/type users to confirm/i);

    await userEvent.type(input, 'users{Enter}');

    expect(screen.getByRole('button', { name: 'Drop' })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('TypeToConfirmDialog lifecycle', () => {
  it('leaves closing to the caller when confirmed', async () => {
    const { onOpenChange } = renderDialog();
    await userEvent.type(screen.getByLabelText(/type users to confirm/i), 'users');
    await userEvent.click(screen.getByRole('button', { name: 'Drop' }));

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('closes when Cancel is clicked', async () => {
    const { onOpenChange } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('clears the typed name when reopened', async () => {
    const onConfirm = vi.fn();
    const props = {
      onOpenChange: vi.fn(),
      title: 'Drop collection',
      description: 'This cannot be undone.',
      expectedName: 'users',
      confirmLabel: 'Drop',
      onConfirm,
    };
    const { rerender } = render(<TypeToConfirmDialog open {...props} />);

    await userEvent.type(screen.getByLabelText(/type users to confirm/i), 'users');
    rerender(<TypeToConfirmDialog open={false} {...props} />);
    rerender(<TypeToConfirmDialog open {...props} />);

    expect(screen.getByLabelText(/type users to confirm/i)).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Drop' })).toBeDisabled();
  });
});

describe('TypeToConfirmDialog content', () => {
  it('renders the title, description and children above the confirm input', () => {
    renderDialog({ children: <p>pick something first</p> });

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Drop collection');
    expect(dialog.textContent).toContain('This cannot be undone.');
    expect(dialog.textContent).toContain('pick something first');
  });
});
