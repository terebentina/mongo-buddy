import { useEffect, useRef } from 'react';
import type { CollectionChecklistState } from '../hooks/use-collection-checklist';

export function CollectionChecklist({ state }: { state: CollectionChecklistState }) {
  const { collections, selected, allChecked, noneChecked, toggleAll, toggleOne } = state;
  const headerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (headerRef.current) {
      headerRef.current.indeterminate = !allChecked && !noneChecked;
    }
  }, [allChecked, noneChecked]);

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-medium px-1">
        <input
          ref={headerRef}
          type="checkbox"
          checked={allChecked}
          onChange={toggleAll}
          className="rounded border-input"
        />
        <span>Select all ({collections.length})</span>
      </label>
      <div className="max-h-60 overflow-y-auto rounded-md border border-input">
        {collections.map((coll, i) => (
          <label
            key={coll.name}
            className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 ${i > 0 ? 'border-t border-input' : ''}`}
          >
            <input
              type="checkbox"
              checked={selected.has(coll.name)}
              onChange={() => toggleOne(coll.name)}
              className="rounded border-input"
            />
            <span className="text-sm font-medium flex-1 truncate">{coll.name}</span>
            {coll.count !== undefined && (
              <span className="text-xs text-muted-foreground">{coll.count.toLocaleString()}</span>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}
