// An EJSON scalar is a wrapper the UI renders as a plain string rather than JSON.
// Other wrappers ({ $numberLong }, { $binary }, …) are not EJSON scalars.
export function unwrapEjsonScalar(obj: Record<string, unknown>): string | null {
  // Only a string payload has a plain-string form; an out-of-range date arrives
  // as { $date: { $numberLong } } and must fall through to JSON.
  if ('$date' in obj) return typeof obj['$date'] === 'string' ? obj['$date'] : null;
  if ('$oid' in obj) return typeof obj['$oid'] === 'string' ? obj['$oid'] : null;
  return null;
}

// A cell displays a scalar when its value renders as a single plain string:
// anything non-object, plus EJSON scalars. Everything else displays as JSON.
export function isScalarCell(value: unknown): boolean {
  if (typeof value === 'object' && value !== null) {
    return unwrapEjsonScalar(value as Record<string, unknown>) !== null;
  }
  return true;
}

export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    return unwrapEjsonScalar(obj) ?? JSON.stringify(value);
  }
  return String(value);
}
