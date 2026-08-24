import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateCollectionDialog } from './CreateCollectionDialog';

describe('CreateCollectionDialog', () => {
  it('creates a trimmed collection name', async () => {
    const onCreate = vi.fn().mockResolvedValue(true);
    const onOpenChange = vi.fn();
    render(
      <CreateCollectionDialog open onOpenChange={onOpenChange} dbName="app" existingNames={[]} onCreate={onCreate} />
    );

    await userEvent.type(screen.getByPlaceholderText('Collection name'), '  users  ');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('users'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('rejects an existing collection name', async () => {
    render(
      <CreateCollectionDialog open onOpenChange={() => {}} dbName="app" existingNames={['users']} onCreate={vi.fn()} />
    );

    await userEvent.type(screen.getByPlaceholderText('Collection name'), 'users');

    expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('keeps the dialog and name after creation fails', async () => {
    const onCreate = vi.fn().mockResolvedValue(false);
    render(<CreateCollectionDialog open onOpenChange={() => {}} dbName="app" existingNames={[]} onCreate={onCreate} />);

    const input = screen.getByPlaceholderText('Collection name');
    await userEvent.type(input, 'users');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled());
    expect(input).toHaveValue('users');
  });

  it('disables the form while creation runs', async () => {
    let resolveCreate!: (created: boolean) => void;
    const onCreate = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveCreate = resolve;
        })
    );
    render(<CreateCollectionDialog open onOpenChange={() => {}} dbName="app" existingNames={[]} onCreate={onCreate} />);

    const input = screen.getByPlaceholderText('Collection name');
    await userEvent.type(input, 'users');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
    expect(onCreate).toHaveBeenCalledTimes(1);

    resolveCreate(false);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled());
  });
});
