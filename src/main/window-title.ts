export function formatWindowTitle(
  name: string,
  version: string,
  opts?: { marker?: string; location?: string }
): string {
  const base = `${name} ${version}`;
  const withLocation = opts?.location ? `${opts.location} — ${base}` : base;
  return opts?.marker ? `${opts.marker} ${withLocation}` : withLocation;
}
