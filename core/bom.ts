/** UTF-8 byte order mark: added to exported CSVs so spreadsheet apps detect UTF-8 accents. */
export const UTF8_BOM = String.fromCharCode(0xfeff);

export function stripBom(text: string): string {
  return text.startsWith(UTF8_BOM) ? text.slice(UTF8_BOM.length) : text;
}
