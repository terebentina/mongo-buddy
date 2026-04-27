import { EJSON } from 'bson';
import type { IndexInfo } from '../shared/types';

export type IndexSpec = IndexInfo;

const DRIVER_ONLY_FIELDS = new Set(['v', 'ns', 'background', 'textIndexVersion', '2dsphereIndexVersion']);

const ID_INDEX_NAME = '_id_';

export function sanitizeForExport(rawIndexes: ReadonlyArray<Record<string, unknown>>): IndexSpec[] {
  const result: IndexSpec[] = [];
  for (const idx of rawIndexes) {
    if (idx.name === ID_INDEX_NAME) continue;
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(idx)) {
      if (DRIVER_ONLY_FIELDS.has(key)) continue;
      cleaned[key] = value;
    }
    result.push(cleaned as IndexSpec);
  }
  return result;
}

export function parseAndValidateSidecar(rawJsonString: string): IndexSpec[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJsonString);
  } catch (err) {
    throw new Error(`Invalid indexes sidecar: failed to parse JSON: ${(err as Error).message}`, { cause: err });
  }

  const deserialized = EJSON.deserialize(parsed as Record<string, unknown>) as unknown;
  if (!Array.isArray(deserialized)) {
    throw new Error('Invalid indexes sidecar: expected an array of index specs');
  }

  for (let i = 0; i < deserialized.length; i++) {
    const entry = deserialized[i];
    if (entry === null || typeof entry !== 'object') {
      throw new Error(`Invalid indexes sidecar: entry at index ${i} is not an object`);
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.name !== 'string') {
      throw new Error(`Invalid indexes sidecar: entry at index ${i} is missing a string "name"`);
    }
    if (e.key === null || typeof e.key !== 'object' || Array.isArray(e.key)) {
      throw new Error(`Invalid indexes sidecar: entry at index ${i} ("${e.name}") is missing an object "key"`);
    }
  }

  return deserialized as IndexSpec[];
}

export function pickIndexesToCreate(
  specs: ReadonlyArray<IndexSpec>,
  existingIndexNames: ReadonlyArray<string>,
  dropExisting: boolean
): IndexSpec[] {
  if (dropExisting) return specs.slice();
  const existing = new Set(existingIndexNames);
  return specs.filter((s) => !existing.has(s.name));
}
