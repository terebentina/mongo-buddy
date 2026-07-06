export function formatWindowTitle(name: string, version: string, marker?: string): string {
  return marker ? `${marker} ${name} ${version}` : `${name} ${version}`;
}
