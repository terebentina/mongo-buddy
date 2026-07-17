import { formatCell } from '../components/DocumentTable.helpers';

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
    return { text: JSON.stringify(value), kind: 'primitive' };
  }
  return { text: JSON.stringify(value), kind: 'object' };
}

// Single-cell copy: like formatValueForCopy but strings are returned unquoted.
// (Column-header and distinct copies keep the quoted/comma-separated form.)
// Single-cell copy: copy exactly what the cell displays (see formatCell),
// so EJSON wrappers like { $oid } copy their inner value, not the raw wrapper.
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
