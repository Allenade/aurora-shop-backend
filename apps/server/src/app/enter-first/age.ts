/** Whole years between a YYYY-MM-DD date of birth and `now`. */
export function ageYears(dateOfBirth: string, now = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let age = now.getUTCFullYear() - year;
  const monthDelta = now.getUTCMonth() + 1 - month;
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < day)) age -= 1;
  return age;
}

export function isMinor(
  dateOfBirth: string | undefined,
  now = new Date(),
): boolean {
  if (!dateOfBirth) return false;
  const age = ageYears(dateOfBirth, now);
  return age != null && age < 18;
}
