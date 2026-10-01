/** Known Core 3.0 / Enter First tracks (ids must match aurora2 ENTER_FIRST_TRACKS). */
export const CORE_TRACK_CATALOG = [
  {
    slug: 'iot',
    name: 'Internet of Things',
    description: 'Sensors, connectivity, and embedded IoT systems.',
    sortOrder: 0,
  },
  {
    slug: 'mobile',
    name: 'Mobile Development',
    description: 'Mobile application engineering for Core 3.0.',
    sortOrder: 1,
  },
  {
    slug: 'ai',
    name: 'Artificial Intelligence',
    description: 'Machine learning and applied AI fundamentals.',
    sortOrder: 2,
  },
  {
    slug: 'blockchain',
    name: 'Blockchain',
    description: 'Distributed ledgers and smart-contract basics.',
    sortOrder: 3,
  },
  {
    slug: 'arm',
    name: 'ARM Embedded Systems',
    description: 'ARM architecture and embedded firmware.',
    sortOrder: 4,
  },
  {
    slug: 'vision',
    name: 'Computer Vision',
    description: 'Image processing and vision systems.',
    sortOrder: 5,
  },
  {
    slug: 'programming',
    name: 'Programming',
    description: 'Core programming for robotics and software.',
    sortOrder: 6,
  },
  {
    slug: 'aerial',
    name: 'Aerial Robotics',
    description: 'Drones and aerial robotic systems.',
    sortOrder: 7,
  },
] as const;

export const ENTER_FIRST_TRACK_IDS = CORE_TRACK_CATALOG.map(
  (track) => track.slug,
);

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
