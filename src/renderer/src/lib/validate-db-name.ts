const RESERVED = new Set(['admin', 'local', 'config']);
const FORBIDDEN_CHARS = ['/', '\\', '.', '"', '$', '*', '<', '>', ':', '|', '?', ' ', '\0'];
const MAX_BYTES = 63;

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateDbName(rawName: string, existing: readonly string[]): ValidationResult {
  const name = rawName.trim();

  if (name.length === 0) {
    return { ok: false, error: 'Name is required' };
  }

  if (new TextEncoder().encode(name).byteLength > MAX_BYTES) {
    return { ok: false, error: `Name must be ${MAX_BYTES} bytes or fewer` };
  }

  if (RESERVED.has(name)) {
    return { ok: false, error: `"${name}" is a reserved database name` };
  }

  for (const ch of FORBIDDEN_CHARS) {
    if (name.includes(ch)) {
      const display = ch === ' ' ? 'spaces' : ch === '\0' ? 'null bytes' : `"${ch}"`;
      return { ok: false, error: `Name cannot contain ${display}` };
    }
  }

  if (existing.includes(name)) {
    return { ok: false, error: `Database "${name}" already exists` };
  }

  return { ok: true };
}
