import { useState } from 'react';
import type { CollectionInfo } from '../../../shared/types';

export interface CollectionChecklistState {
  collections: CollectionInfo[];
  selected: Set<string>;
  allChecked: boolean;
  noneChecked: boolean;
  toggleAll: () => void;
  toggleOne: (name: string) => void;
}

// MongoDB collection names cannot contain a NUL, so this key changes only when
// the set of names does — not when a caller passes an equal but fresh array.
const namesKey = (collections: CollectionInfo[]): string => collections.map((c) => c.name).join('\0');

const seed = (collections: CollectionInfo[], initial: 'all' | 'none'): Set<string> =>
  new Set(initial === 'all' ? collections.map((c) => c.name) : []);

/**
 * Owns the selection for a CollectionChecklist: seeds it, re-seeds it whenever the
 * dialog reopens or the set of collection names changes, and exposes the toggles.
 * Re-seeding on the names — rather than on the array identity — keeps this correct
 * for an always-mounted caller whose list arrives after the first render.
 */
export function useCollectionChecklist(
  collections: CollectionInfo[],
  { open, initial }: { open: boolean; initial: 'all' | 'none' }
): CollectionChecklistState {
  const [selected, setSelected] = useState(() => seed(collections, initial));
  const [prev, setPrev] = useState({ open, names: namesKey(collections) });

  const names = namesKey(collections);
  if (prev.open !== open || prev.names !== names) {
    setPrev({ open, names });
    if (open) setSelected(seed(collections, initial));
  }

  const toggleAll = (): void => {
    setSelected((prev) => (prev.size === collections.length ? new Set() : new Set(collections.map((c) => c.name))));
  };

  const toggleOne = (name: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return {
    collections,
    selected,
    allChecked: selected.size === collections.length && collections.length > 0,
    noneChecked: selected.size === 0,
    toggleAll,
    toggleOne,
  };
}
