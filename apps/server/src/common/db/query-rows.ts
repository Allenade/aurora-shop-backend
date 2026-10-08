/** Normalise a TypeORM/pg query result into a list of row records. */
export function queryRows(value: any): Array<Record<string, unknown>> {
  const list = rowList(value);
  const rows: Array<Record<string, unknown>> = [];
  for (const item of list) {
    if (isRecord(item)) rows.push(item);
  }
  return rows;
}

function rowList(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.rows)) return value.rows;
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
