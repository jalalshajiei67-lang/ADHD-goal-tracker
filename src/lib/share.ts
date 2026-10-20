/** The first 120 characters of whatever was shared, collapsed to one line. */
export function sharedTitle(values: {
  title?: string | null;
  text?: string | null;
  url?: string | null;
}): string {
  const clean = (value: string | null | undefined) =>
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
  return clean(values.title) || clean(values.text) || clean(values.url);
}
