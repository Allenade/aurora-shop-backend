/** Keep only courses stored under the requested program. Never adds rows. */
export function coursesForProgram<T extends { program?: string | null }>(
  rows: T[],
  program: string,
): T[] {
  const key = program.trim().toLowerCase();
  return rows.filter((row) => (row.program ?? '').trim().toLowerCase() === key);
}
