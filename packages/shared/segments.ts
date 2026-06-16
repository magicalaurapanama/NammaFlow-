export const SEGMENT_IDS = [
  'silk-board',
  'hsr',
  'ibblur',
  'bellandur',
  'ecospace',
  'kadubeesanahalli',
  'marathahalli',
  'doddanekundi',
  'mahadevapura',
  'kr-puram',
] as const;

export type SegmentId = (typeof SEGMENT_IDS)[number];

export interface SegmentConfig {
  id: SegmentId;
  name: string;
  lat: number;
  lon: number;
  position: number; // 0-indexed sequential order
}

export const SEGMENTS: SegmentConfig[] = [
  { id: 'silk-board', name: 'Silk Board', lat: 12.9172, lon: 77.6227, position: 0 },
  { id: 'hsr', name: 'HSR Layout', lat: 12.9116, lon: 77.6389, position: 1 },
  { id: 'ibblur', name: 'Ibbalur', lat: 12.9260, lon: 77.6780, position: 2 },
  { id: 'bellandur', name: 'Bellandur', lat: 12.9307, lon: 77.6785, position: 3 },
  { id: 'ecospace', name: 'Ecospace', lat: 12.9352, lon: 77.6902, position: 4 },
  { id: 'kadubeesanahalli', name: 'Kadubeesanahalli', lat: 12.9380, lon: 77.6975, position: 5 },
  { id: 'marathahalli', name: 'Marathahalli', lat: 12.9562, lon: 77.7010, position: 6 },
  { id: 'doddanekundi', name: 'Doddanekundi', lat: 12.9630, lon: 77.7098, position: 7 },
  { id: 'mahadevapura', name: 'Mahadevapura', lat: 12.9890, lon: 77.7010, position: 8 },
  { id: 'kr-puram', name: 'KR Puram', lat: 13.0070, lon: 77.6960, position: 9 },
];
