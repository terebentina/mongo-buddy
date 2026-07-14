const FORBIDDEN_CHARS = ['$', '\0'];

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateCollectionName(
  rawName: string,
  currentName: string,
  existing: readonly string[]
): ValidationResult {
  const name = rawName.trim();

  if (name.length === 0) {
    return { ok: false, error: 'Name is required' };
  }

  if (name === currentName) {
    return { ok: false, error: 'Enter a different name' };
  }

  for (const ch of FORBIDDEN_CHARS) {
    if (name.includes(ch)) {
      const display = ch === '\0' ? 'null bytes' : `"${ch}"`;
      return { ok: false, error: `Name cannot contain ${display}` };
    }
  }

  if (name.startsWith('system.')) {
    return { ok: false, error: 'Name cannot start with "system."' };
  }

  if (existing.includes(name)) {
    return { ok: false, error: `Collection "${name}" already exists` };
  }

  return { ok: true };
}
