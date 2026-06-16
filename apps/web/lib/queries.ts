import type { TrafficReading, SegmentId } from '@orr-pulse/shared';
import { SEGMENT_IDS } from '@orr-pulse/shared';

/**
 * Selects the latest reading per segment from a set of readings.
 * Mirrors the SQL logic: DISTINCT ON (segment_id) ... ORDER BY time DESC
 *
 * Given a set of readings (each with segmentId and time), this function:
 * 1. Groups readings by segmentId
 * 2. From each group, selects the reading with the maximum timestamp
 * 3. Returns exactly one reading per segment
 */
export function selectLatestPerSegment(readings: TrafficReading[]): TrafficReading[] {
  const latestBySegment = new Map<string, TrafficReading>();

  for (const reading of readings) {
    const existing = latestBySegment.get(reading.segmentId);
    if (!existing || reading.time > existing.time) {
      latestBySegment.set(reading.segmentId, reading);
    }
  }

  return Array.from(latestBySegment.values());
}

/**
 * Represents a row from the hourly_segment_stats continuous aggregate.
 */
export interface HourlyStatRow {
  bucket: Date; // contains both day-of-week and hour info
  segmentId: string;
  avgCi: number;
}

/**
 * Remap PostgreSQL EXTRACT(dow) (0=Sunday, 1=Monday...6=Saturday)
 * to our format (0=Monday, 1=Tuesday...6=Sunday).
 */
function remapDow(pgDow: number): number {
  return pgDow === 0 ? 6 : pgDow - 1;
}

/**
 * Computes a heatmap matrix from in-memory hourly stat rows.
 *
 * This function:
 * 1. Groups rows by (dayOfWeek, hour) derived from the bucket timestamp
 * 2. Computes the arithmetic mean of avgCi values per group (averaging across all segments)
 * 3. Remaps JavaScript Date.getUTCDay() (0=Sunday) to Monday=0 format
 */
export function computeHeatmapMatrix(rows: HourlyStatRow[]): Array<{
  dayOfWeek: number; // 0=Monday, 6=Sunday
  hour: number;
  avgCongestionIndex: number;
}> {
  // Group by (dayOfWeek, hour) — use a composite key
  const groups = new Map<string, number[]>();

  for (const row of rows) {
    // JavaScript Date.getUTCDay(): 0=Sunday, 1=Monday...6=Saturday
    // This matches PostgreSQL EXTRACT(dow) convention
    const jsDow = row.bucket.getUTCDay();
    const dayOfWeek = remapDow(jsDow);
    const hour = row.bucket.getUTCHours();
    const key = `${dayOfWeek}:${hour}`;

    const existing = groups.get(key);
    if (existing) {
      existing.push(row.avgCi);
    } else {
      groups.set(key, [row.avgCi]);
    }
  }

  // Compute arithmetic mean per group
  const result: Array<{ dayOfWeek: number; hour: number; avgCongestionIndex: number }> = [];

  for (const [key, values] of groups) {
    const [dayOfWeekStr, hourStr] = key.split(':');
    const sum = values.reduce((acc, v) => acc + v, 0);
    const avg = sum / values.length;

    result.push({
      dayOfWeek: Number(dayOfWeekStr),
      hour: Number(hourStr),
      avgCongestionIndex: avg,
    });
  }

  return result;
}

/**
 * Filters traffic readings by segment ID and time window.
 * Mirrors the SQL logic: WHERE segment_id = $1 AND time >= NOW() - INTERVAL '1 hour' * $2
 *
 * Given a set of readings, this function:
 * 1. Filters readings to only include those with matching segmentId
 * 2. Filters to only include readings with time >= (now - hours * 3600 * 1000) ms
 * 3. Returns filtered readings sorted by time ASC
 */
export function filterByTimeWindow(
  readings: TrafficReading[],
  segmentId: string,
  now: Date,
  hours: number
): TrafficReading[] {
  const windowStart = new Date(now.getTime() - hours * 3600 * 1000);

  return readings
    .filter((r) => {
      if (r.segmentId !== segmentId) return false;
      const readingTime = new Date(r.time);
      return readingTime >= windowStart && readingTime <= now;
    })
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

/**
 * Validates whether a string is a valid segment ID.
 * Maps to HTTP error responses:
 * - Invalid ID on /api/segments/:id/history → 404
 * - Invalid ID on /api/recommendations (from/to) → 400
 */
export function validateSegmentId(id: string): { valid: true; id: SegmentId } | { valid: false; error: string } {
  if (SEGMENT_IDS.includes(id as SegmentId)) {
    return { valid: true, id: id as SegmentId };
  }
  return { valid: false, error: 'Segment not found' };
}
