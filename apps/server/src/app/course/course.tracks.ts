/** Core 3.0 tracks. Slugs must stay aligned with aurora2 ENTER_FIRST_TRACKS. */
export const CORE30_TRACKS: Array<{
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
}> = [
  {
    slug: 'iot',
    name: 'Internet of Things',
    description: 'Connected devices, sensors, and embedded networking.',
    sortOrder: 0,
  },
  {
    slug: 'mobile',
    name: 'Mobile Development',
    description: 'Mobile application engineering.',
    sortOrder: 1,
  },
  {
    slug: 'ai',
    name: 'Artificial Intelligence',
    description: 'Applied machine learning and AI systems.',
    sortOrder: 2,
  },
  {
    slug: 'blockchain',
    name: 'Blockchain',
    description: 'Distributed ledgers and smart contracts.',
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
    description: 'Image understanding and vision systems.',
    sortOrder: 5,
  },
  {
    slug: 'programming',
    name: 'Programming',
    description: 'Software engineering fundamentals.',
    sortOrder: 6,
  },
  {
    slug: 'aerial',
    name: 'Aerial Robotics',
    description: 'Drones and aerial robotic systems.',
    sortOrder: 7,
  },
];
