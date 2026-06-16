import type { SegmentId } from './segments';

export interface TrafficReading {
  segmentId: SegmentId;
  time: string;
  currentSpeed: number;
  freeFlowSpeed: number;
  currentTravelTime: number;
  freeFlowTravelTime: number;
  confidence: number;
  congestionIndex: number;
  roadClosure: boolean;
}

export interface HeatmapCell {
  dayOfWeek: number; // 0=Monday, 6=Sunday
  hour: number; // 0–23
  avgCongestionIndex: number;
}

export interface CommuteWindow {
  startHour: number;
  endHour: number;
  avgCongestionIndex: number;
}

export interface CorridorStatus {
  id: SegmentId;
  name: string;
  currentSpeed: number;
  freeFlowSpeed: number;
  congestionIndex: number;
  currentTravelTime: number;
  freeFlowTravelTime: number;
  confidence: number;
  roadClosure: boolean;
  timestamp: string;
}
