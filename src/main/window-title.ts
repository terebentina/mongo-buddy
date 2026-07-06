export function formatWindowTitle(name: string, version: string, opts?: { location?: string }): string {
  const base = `${name} ${version}`;
  return opts?.location ? `${opts.location} — ${base}` : base;
}
