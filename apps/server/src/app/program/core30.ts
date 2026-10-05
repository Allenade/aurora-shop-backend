/** Folder name stored on Core 3.0 enrollments and the courses inside it. */
export const CORE_30_PROGRAM = 'Core 3.0';

/** Blank means the Core 3.0 folder. An explicit name is kept as sent. */
export function resolveProgram(value?: string | null): string {
  const text = value?.trim();
  return text || CORE_30_PROGRAM;
}
