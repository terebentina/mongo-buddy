export function extractIdDisplay(doc: Record<string, unknown>): string | null {
  const id = doc._id;
  if (!id) return null;
  if (typeof id === 'string') return id;
  if (typeof id === 'object' && id !== null && '$oid' in id) return (id as { $oid: string }).$oid;
  return JSON.stringify(id);
}

export function extractLabelDisplay(doc: Record<string, unknown>): {
  field: 'name' | 'title';
  value: string;
} | null {
  if (typeof doc.name === 'string' && doc.name.trim().length > 0) {
    return { field: 'name', value: doc.name };
  }
  if (typeof doc.title === 'string' && doc.title.trim().length > 0) {
    return { field: 'title', value: doc.title };
  }
  return null;
}
