import type { SegmentId } from '@orr-pulse/shared';
import { SEGMENTS } from '@orr-pulse/shared';

export interface CommuteWindow {
  startHour: number;
  endHour: number;
  avgCongestionIndex: number;
}

export interface RecommendationResult {
  dayOfWeek: number;
  dayName: string;
  best: CommuteWindow;
  worst: CommuteWindow;
}

export interface MedianCiRow {
  segmentId: string;
  dayOfWeek: number;
  hour: number;
  medianCi: number;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Computes best and worst commute windows per day of week from pre-computed median CI data.
 *
 * Logic:
 * 1. Filters to only segments within [fromPosition, toPosition]
 * 2. Groups by (dayOfWeek, hour) and computes corridor-average median CI
 * 3. For each day of week, finds the hour with minimum avg CI (best) and maximum avg CI (worst)
 * 4. Returns array of { dayOfWeek, dayName, best, worst }
 */
export function computeRecommendations(
  data: MedianCiRow[],
  fromPosition: number,
  toPosition: number
): RecommendationResult[] {
  // Get segment IDs in the position range
  const segmentsInRange = new Set(
    SEGMENTS
      .filter((s) => s.position >= fromPosition && s.position <= toPosition)
      .map((s) => s.id)
  );

  // Filter data to only segments in range
  const filtered = data.filter((row) => segmentsInRange.has(row.segmentId as SegmentId));

  if (filtered.length === 0) {
    return [];
  }

  // Group by (dayOfWeek, hour) and compute corridor-average median CI
  const groups = new Map<string, number[]>();

  for (const row of filtered) {
    const key = `${row.dayOfWeek}:${row.hour}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(row.medianCi);
    } else {
      groups.set(key, [row.medianCi]);
    }
  }

  // Compute average CI per (dayOfWeek, hour)
  const avgByDayHour = new Map<string, { dayOfWeek: number; hour: number; avgCi: number }>();

  for (const [key, values] of groups) {
    const [dowStr, hourStr] = key.split(':');
    const sum = values.reduce((acc, v) => acc + v, 0);
    avgByDayHour.set(key, {
      dayOfWeek: Number(dowStr),
      hour: Number(hourStr),
      avgCi: sum / values.length,
    });
  }

  // Group by dayOfWeek, find best (min) and worst (max) hour
  const dayGroups = new Map<number, Array<{ hour: number; avgCi: number }>>();

  for (const entry of avgByDayHour.values()) {
    const existing = dayGroups.get(entry.dayOfWeek);
    if (existing) {
      existing.push({ hour: entry.hour, avgCi: entry.avgCi });
    } else {
      dayGroups.set(entry.dayOfWeek, [{ hour: entry.hour, avgCi: entry.avgCi }]);
    }
  }

  const results: RecommendationResult[] = [];

  for (let dow = 0; dow < 7; dow++) {
    const hours = dayGroups.get(dow);
    if (!hours || hours.length === 0) continue;

    // Find best (minimum CI) and worst (maximum CI)
    let best = hours[0];
    let worst = hours[0];

    for (const h of hours) {
      if (h.avgCi < best.avgCi) best = h;
      if (h.avgCi > worst.avgCi) worst = h;
    }

    results.push({
      dayOfWeek: dow,
      dayName: DAY_NAMES[dow],
      best: {
        startHour: best.hour,
        endHour: best.hour + 1,
        avgCongestionIndex: Number(best.avgCi.toFixed(4)),
      },
      worst: {
        startHour: worst.hour,
        endHour: worst.hour + 1,
        avgCongestionIndex: Number(worst.avgCi.toFixed(4)),
      },
    });
  }

  return results;
}

/**
 * Gets segment positions for from/to segment IDs.
 * Returns [fromPosition, toPosition] or null if invalid.
 */
export function getSegmentPositions(
  fromId: SegmentId,
  toId: SegmentId
): [number, number] | null {
  const fromSegment = SEGMENTS.find((s) => s.id === fromId);
  const toSegment = SEGMENTS.find((s) => s.id === toId);

  if (!fromSegment || !toSegment) return null;

  // Ensure from position <= to position
  const fromPos = Math.min(fromSegment.position, toSegment.position);
  const toPos = Math.max(fromSegment.position, toSegment.position);

  return [fromPos, toPos];
}
