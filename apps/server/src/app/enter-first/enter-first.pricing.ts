/** Known Core 3.0 / Enter First track ids (must match aurora2 ENTER_FIRST_TRACKS). */
export const ENTER_FIRST_TRACK_IDS = [
  'iot',
  'mobile',
  'ai',
  'blockchain',
  'arm',
  'vision',
  'programming',
  'aerial',
] as const;

export type EnterFirstTrackId = (typeof ENTER_FIRST_TRACK_IDS)[number];

/**
 * Naira amount charged per track (every track is paid).
 * Override with ENTER_FIRST_TRACK_AMOUNT_NGN (whole naira, not kobo).
 */
export function trackAmountNgn(): number {
  const raw = process.env.ENTER_FIRST_TRACK_AMOUNT_NGN?.trim();
  const parsed = raw ? Number(raw) : 60_000;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 60_000;
}

export function priceTracks(trackIds: string[]): {
  amount: number;
  currency: 'NGN';
  unknown: string[];
} {
  const known = new Set<string>(ENTER_FIRST_TRACK_IDS);
  const unknown = trackIds.filter((id) => !known.has(id));
  const amount = trackIds.length * trackAmountNgn();
  return { amount, currency: 'NGN', unknown };
}
