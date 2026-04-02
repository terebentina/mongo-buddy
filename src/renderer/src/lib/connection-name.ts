import type { SavedConnection } from '../../../shared/types';

export function getConnectionDisplayName(uri: string, savedConnections: SavedConnection[]): string {
  if (!uri) return 'Databases';

  const match = savedConnections.find((c) => c.uri === uri);
  if (match) return match.name;

  try {
    const normalized = uri.replace(/^mongodb(\+srv)?:\/\//, 'http://');
    const { hostname } = new URL(normalized);
    return hostname || 'Databases';
  } catch {
    return 'Databases';
  }
}
