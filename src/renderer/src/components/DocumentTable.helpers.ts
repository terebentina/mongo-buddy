// An EJSON scalar is a wrapper the UI renders as a plain string rather than JSON.
// Other wrappers ({ $numberLong }, { $binary }, …) are not EJSON scalars.
export function unwrapEjsonScalar(obj: Record<string, unknown>): string | null {
  if ('$date' in obj) return String(obj['$date']);
  if ('$oid' in obj) return String(obj['$oid']);
  return null;
}

export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    return unwrapEjsonScalar(obj) ?? JSON.stringify(value);
  }
  return String(value);
}
