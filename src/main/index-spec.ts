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
