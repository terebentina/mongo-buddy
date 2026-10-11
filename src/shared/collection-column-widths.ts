// JSON tuples preserve literal names, including dots and separators.
export function collectionColumnWidthsKey(db: string, collection: string): string {
  return JSON.stringify([db, collection]);
}
