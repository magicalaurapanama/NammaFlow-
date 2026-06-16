export { SEGMENT_IDS, SEGMENTS } from './segments';
export type { SegmentId, SegmentConfig } from './segments';

export { tomtomFlowSegmentSchema, trafficReadingSchema } from './schemas';
export type { TomTomFlowSegment, TrafficReadingInput } from './schemas';

export type {
  TrafficReading,
  HeatmapCell,
  CommuteWindow,
  CorridorStatus,
} from './types';

export { computeCongestionIndex } from './congestion';
