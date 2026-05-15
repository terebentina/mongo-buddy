export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if ('$date' in obj) return String(obj['$date']);
    if ('$oid' in obj) return String(obj['$oid']);
    return JSON.stringify(value);
  }
  return String(value);
}

export function buildValuesCopyText(values: unknown[]): string {
  return values.map(formatCell).join('\n');
}

export function buildColumnCopyText(docs: Record<string, unknown>[], col: string): string {
  return buildValuesCopyText(docs.map((d) => d[col]));
}
