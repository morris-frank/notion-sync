const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}(?=$|[\s_–—-])[\s_–—-]*/;

export function titleForSync(filename: string): string {
  const stripped = filename.replace(ISO_DATE_PREFIX, "").trim();
  return stripped || filename;
}
