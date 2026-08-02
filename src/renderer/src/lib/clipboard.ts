import { toast } from 'sonner';

import { formatCell, isScalarCell, unwrapEjsonScalar } from '../components/DocumentTable.helpers';

export async function copyText(text: string, message = 'Copied to clipboard'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error('Could not copy');
  }
}

export function isEjsonWrapper(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  return keys.every((k) => k.startsWith('$'));
}

export type CopyValue = { text: string; kind: 'primitive' | 'object' };

export function formatValueForCopy(value: unknown): CopyValue {
  if (value === null || value === undefined) {
    return { text: 'null', kind: 'primitive' };
  }
  if (typeof value !== 'object') {
    return { text: JSON.stringify(value), kind: 'primitive' };
  }
  if (isEjsonWrapper(value)) {
    // EJSON scalars copy their inner value; other wrappers keep their raw form.
    const scalar = unwrapEjsonScalar(value as Record<string, unknown>);
    return { text: JSON.stringify(scalar ?? value), kind: 'primitive' };
  }
  return { text: JSON.stringify(value), kind: 'object' };
}

// A cell offers the copy cell action only when it displays a scalar with
// visible text. Non-scalar cells copy through the expand popover instead;
// empty cells (null, missing, "") have nothing to copy and offer neither.
export function isCopyableCell(value: unknown): boolean {
  return isScalarCell(value) && formatCell(value) !== '';
}

// Cell copy: exactly what the cell displays (see formatCell), unquoted.
// Column-header and distinct copies use formatValueForCopy instead, which keeps
// the quoted/comma-separated form so the result pastes into an $in array.
// Null/undefined copy as "null" (formatCell renders them as an empty cell).
export function formatValueForCellCopy(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  return formatCell(value);
}

export function buildValuesCopyText(values: unknown[]): string {
  if (values.length === 0) return '';
  const formatted = values.map(formatValueForCopy);
  const allObjects = formatted.every((f) => f.kind === 'object');
  const separator = allObjects ? '\n' : ',\n';
  return formatted.map((f) => f.text).join(separator);
}

export function buildColumnCopyText(docs: Record<string, unknown>[], col: string): string {
  return buildValuesCopyText(docs.map((d) => d[col]));
}
