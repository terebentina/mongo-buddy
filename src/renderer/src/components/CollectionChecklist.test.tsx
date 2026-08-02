import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CollectionChecklist } from './CollectionChecklist';
import { useCollectionChecklist } from '../hooks/use-collection-checklist';
import type { CollectionInfo } from '../../../shared/types';

const collections: CollectionInfo[] = [
  { name: 'users', type: 'collection', count: 1234 },
  { name: 'orders', type: 'collection' },
];

function Harness({
  collections,
  initial,
  open = true,
}: {
  collections: CollectionInfo[];
  initial: 'all' | 'none';
  open?: boolean;
}) {
  const checklist = useCollectionChecklist(collections, { open, initial });
  return (
    <>
      <CollectionChecklist state={checklist} />
      <output>{[...checklist.selected].sort().join(',')}</output>
    </>
  );
}

const selection = (): string => screen.getByRole('status').textContent ?? '';
const header = (): HTMLInputElement => screen.getByRole('checkbox', { name: /select all/i }) as HTMLInputElement;

describe('useCollectionChecklist seeding', () => {
  it('starts with nothing selected when initial is none', () => {
    render(<Harness collections={collections} initial="none" />);
    expect(selection()).toBe('');
  });

  it('starts with everything selected when initial is all', () => {
    render(<Harness collections={collections} initial="all" />);
    expect(selection()).toBe('orders,users');
  });

  it('re-seeds when reopened', async () => {
    const { rerender } = render(<Harness collections={collections} initial="all" />);
    await userEvent.click(screen.getByRole('checkbox', { name: /users/ }));
    expect(selection()).toBe('orders');

    rerender(<Harness collections={collections} initial="all" open={false} />);
    rerender(<Harness collections={collections} initial="all" open />);

    expect(selection()).toBe('orders,users');
  });

  it('re-seeds when the collection list changes while open', () => {
    const { rerender } = render(<Harness collections={collections} initial="all" />);
    expect(selection()).toBe('orders,users');

    rerender(<Harness collections={[{ name: 'logs', type: 'collection' }]} initial="all" />);

    expect(selection()).toBe('logs');
  });

  it('does not re-seed when an equal collection list is passed as a new array', async () => {
    const { rerender } = render(<Harness collections={collections} initial="all" />);
    await userEvent.click(screen.getByRole('checkbox', { name: /users/ }));

    rerender(<Harness collections={collections.map((c) => ({ ...c }))} initial="all" />);

    expect(selection()).toBe('orders');
  });
});

describe('CollectionChecklist toggling', () => {
  it('selects every collection from the select-all checkbox', async () => {
    render(<Harness collections={collections} initial="none" />);
    await userEvent.click(header());

    expect(selection()).toBe('orders,users');
  });

  it('clears every collection when select-all is unchecked', async () => {
    render(<Harness collections={collections} initial="all" />);
    await userEvent.click(header());

    expect(selection()).toBe('');
  });

  it('toggles a single collection', async () => {
    render(<Harness collections={collections} initial="none" />);
    await userEvent.click(screen.getByRole('checkbox', { name: /orders/ }));
    expect(selection()).toBe('orders');

    await userEvent.click(screen.getByRole('checkbox', { name: /orders/ }));
    expect(selection()).toBe('');
  });
});

describe('CollectionChecklist display', () => {
  it('marks the select-all checkbox indeterminate for a partial selection', async () => {
    render(<Harness collections={collections} initial="none" />);
    expect(header().indeterminate).toBe(false);

    await userEvent.click(screen.getByRole('checkbox', { name: /users/ }));
    expect(header().indeterminate).toBe(true);
    expect(header().checked).toBe(false);

    await userEvent.click(screen.getByRole('checkbox', { name: /orders/ }));
    expect(header().indeterminate).toBe(false);
    expect(header().checked).toBe(true);
  });

  it('counts the collections in the select-all label', () => {
    render(<Harness collections={collections} initial="none" />);
    expect(screen.getByText('Select all (2)')).toBeInTheDocument();
  });

  it('shows the document count only for collections that have one', () => {
    render(<Harness collections={collections} initial="none" />);
    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });
});
