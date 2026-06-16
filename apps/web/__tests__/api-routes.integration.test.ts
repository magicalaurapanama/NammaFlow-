/**
 * Integration tests for API route handler logic functions.
 *
 * These tests verify the pure query/logic functions used by the route handlers
 * without needing HTTP or database connectivity.
 *
 * Validates: Requirements 14.3
 */
import { describe, it, expect } from 'vitest';
import { SEGMENT_IDS, type SegmentId, type TrafficReading } from '@orr-pulse/shared';
import {
  selectLatestPerSegment,
  computeHeatmapMatrix,
  filterByTimeWindow,
  validateSegmentId,
  type HourlyStatRow,
} from '../lib/queries';
import { computeRecommendations, type MedianCiRow } from '../lib/recommendations';

// --- Test Helpers ---

function makeReading(overrides: Partial<TrafficReading> & { segmentId: SegmentId; time: string }): TrafficReading {
  return {
    currentSpeed: 40,
    freeFlowSpeed: 60,
    currentTravelTime: 90,
    freeFlowTravelTime: 60,
    confidence: 0.9,
    congestionIndex: 0.33,
    roadClosure: false,
    ...overrides,
  };
}

function makeHourlyStatRow(bucket: Date, segmentId: string, avgCi: number): HourlyStatRow {
  return { bucket, segmentId, avgCi };
}

// --- 1. selectLatestPerSegment (used by /api/corridor/now) ---

describe('selectLatestPerSegment - Integration', () => {
  it('returns exactly one reading per segment with the latest timestamp', () => {
    const readings: TrafficReading[] = [
      makeReading({ segmentId: 'silk-board', time: '2024-06-01T08:00:00Z', congestionIndex: 0.5 }),
      makeReading({ segmentId: 'silk-board', time: '2024-06-01T08:15:00Z', congestionIndex: 0.6 }),
      makeReading({ segmentId: 'silk-board', time: '2024-06-01T08:30:00Z', congestionIndex: 0.7 }),
      makeReading({ segmentId: 'hsr', time: '2024-06-01T08:00:00Z', congestionIndex: 0.3 }),
      makeReading({ segmentId: 'hsr', time: '2024-06-01T08:15:00Z', congestionIndex: 0.4 }),
      makeReading({ segmentId: 'marathahalli', time: '2024-06-01T07:45:00Z', congestionIndex: 0.2 }),
      makeReading({ segmentId: 'marathahalli', time: '2024-06-01T08:30:00Z', congestionIndex: 0.8 }),
    ];

    const result = selectLatestPerSegment(readings);

    // Exactly one reading per segment present in input
    expect(result).toHaveLength(3);

    const bySegment = new Map(result.map((r) => [r.segmentId, r]));

    // silk-board: latest is 08:30
    expect(bySegment.get('silk-board')!.time).toBe('2024-06-01T08:30:00Z');
    expect(bySegment.get('silk-board')!.congestionIndex).toBe(0.7);

    // hsr: latest is 08:15
    expect(bySegment.get('hsr')!.time).toBe('2024-06-01T08:15:00Z');
    expect(bySegment.get('hsr')!.congestionIndex).toBe(0.4);

    // marathahalli: latest is 08:30
    expect(bySegment.get('marathahalli')!.time).toBe('2024-06-01T08:30:00Z');
    expect(bySegment.get('marathahalli')!.congestionIndex).toBe(0.8);
  });

  it('handles single reading per segment correctly', () => {
    const readings: TrafficReading[] = [
      makeReading({ segmentId: 'silk-board', time: '2024-06-01T08:00:00Z' }),
      makeReading({ segmentId: 'hsr', time: '2024-06-01T08:00:00Z' }),
    ];

    const result = selectLatestPerSegment(readings);
    expect(result).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(selectLatestPerSegment([])).toEqual([]);
  });
});

// --- 2. computeHeatmapMatrix (used by /api/heatmap) ---

describe('computeHeatmapMatrix - Integration', () => {
  it('returns correct dimensions for 7 days × 24 hours of data', () => {
    // Generate one row per (day, hour) combination across all segments
    const rows: HourlyStatRow[] = [];

    // Create data for 7 full days (Mon-Sun) with 24 hours each
    // Use a week starting on Monday June 3, 2024 (Monday)
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        // June 3 is Monday (getUTCDay() returns 1)
        const bucket = new Date(Date.UTC(2024, 5, 3 + day, hour, 0, 0));

        // Add rows for multiple segments to test averaging across segments
        rows.push(makeHourlyStatRow(bucket, 'silk-board', 0.5));
        rows.push(makeHourlyStatRow(bucket, 'hsr', 0.7));
      }
    }

    const matrix = computeHeatmapMatrix(rows);

    // Should have exactly 7 × 24 = 168 cells
    expect(matrix).toHaveLength(7 * 24);

    // Each cell should have a dayOfWeek in [0,6] and hour in [0,23]
    for (const cell of matrix) {
      expect(cell.dayOfWeek).toBeGreaterThanOrEqual(0);
      expect(cell.dayOfWeek).toBeLessThanOrEqual(6);
      expect(cell.hour).toBeGreaterThanOrEqual(0);
      expect(cell.hour).toBeLessThanOrEqual(23);
    }

    // Verify uniqueness: each (dayOfWeek, hour) should appear exactly once
    const keys = new Set(matrix.map((c) => `${c.dayOfWeek}:${c.hour}`));
    expect(keys.size).toBe(168);
  });

  it('computes correct average across segments', () => {
    // Monday, hour 9 — two segments with CI 0.4 and 0.8
    // June 3 2024 is Monday (getUTCDay() = 1 → remapped to 0)
    const mondayAt9 = new Date(Date.UTC(2024, 5, 3, 9, 0, 0));

    const rows: HourlyStatRow[] = [
      makeHourlyStatRow(mondayAt9, 'silk-board', 0.4),
      makeHourlyStatRow(mondayAt9, 'hsr', 0.8),
    ];

    const matrix = computeHeatmapMatrix(rows);

    expect(matrix).toHaveLength(1);
    expect(matrix[0].dayOfWeek).toBe(0); // Monday
    expect(matrix[0].hour).toBe(9);
    expect(matrix[0].avgCongestionIndex).toBeCloseTo(0.6, 4); // (0.4 + 0.8) / 2
  });

  it('returns empty matrix for empty input', () => {
    const matrix = computeHeatmapMatrix([]);
    expect(matrix).toHaveLength(0);
  });
});

// --- 3. filterByTimeWindow (used by /api/segments/:id/history) ---

describe('filterByTimeWindow - Integration', () => {
  it('returns only readings within the requested time window', () => {
    const now = new Date('2024-06-01T12:00:00Z');
    const hours = 6; // window: 06:00 to 12:00

    const readings: TrafficReading[] = [
      // Inside window
      makeReading({ segmentId: 'silk-board', time: '2024-06-01T06:00:00Z' }),
      makeReading({ segmentId: 'silk-board', time: '2024-06-01T08:30:00Z' }),
      makeReading({ segmentId: 'silk-board', time: '2024-06-01T11:45:00Z' }),
      // Outside window (before)
      makeReading({ segmentId: 'silk-board', time: '2024-06-01T05:59:59Z' }),
      makeReading({ segmentId: 'silk-board', time: '2024-05-31T23:00:00Z' }),
      // Outside window (after — shouldn't happen in practice but testing boundary)
      makeReading({ segmentId: 'silk-board', time: '2024-06-01T12:00:01Z' }),
      // Different segment — should be excluded
      makeReading({ segmentId: 'hsr', time: '2024-06-01T09:00:00Z' }),
    ];

    const result = filterByTimeWindow(readings, 'silk-board', now, hours);

    expect(result).toHaveLength(3);
    expect(result[0].time).toBe('2024-06-01T06:00:00Z');
    expect(result[1].time).toBe('2024-06-01T08:30:00Z');
    expect(result[2].time).toBe('2024-06-01T11:45:00Z');
  });

  it('returns results sorted by time ascending', () => {
    const now = new Date('2024-06-01T12:00:00Z');

    const readings: TrafficReading[] = [
      makeReading({ segmentId: 'bellandur', time: '2024-06-01T10:00:00Z' }),
      makeReading({ segmentId: 'bellandur', time: '2024-06-01T06:00:00Z' }),
      makeReading({ segmentId: 'bellandur', time: '2024-06-01T08:00:00Z' }),
    ];

    const result = filterByTimeWindow(readings, 'bellandur', now, 48);

    expect(result[0].time).toBe('2024-06-01T06:00:00Z');
    expect(result[1].time).toBe('2024-06-01T08:00:00Z');
    expect(result[2].time).toBe('2024-06-01T10:00:00Z');
  });

  it('returns empty array when no readings match', () => {
    const now = new Date('2024-06-01T12:00:00Z');
    const readings: TrafficReading[] = [
      makeReading({ segmentId: 'hsr', time: '2024-06-01T10:00:00Z' }),
    ];

    const result = filterByTimeWindow(readings, 'silk-board', now, 6);
    expect(result).toHaveLength(0);
  });
});

// --- 4. computeRecommendations (used by /api/recommendations) ---

describe('computeRecommendations - Integration', () => {
  it('returns best/worst windows matching manual calculation', () => {
    // Create median CI data for 7 days, 24 hours, 3 segments (positions 0-2)
    // Segment positions: silk-board=0, hsr=1, ibblur=2
    const data: MedianCiRow[] = [];

    for (let dow = 0; dow < 7; dow++) {
      for (let hour = 0; hour < 24; hour++) {
        // Create a pattern where hour 5 is best (low CI) and hour 17 is worst (high CI)
        let baseCi: number;
        if (hour === 5) {
          baseCi = 0.1;
        } else if (hour === 17) {
          baseCi = 0.9;
        } else {
          baseCi = 0.5;
        }

        // Add for all 3 segments in range with slight variation
        data.push({ segmentId: 'silk-board', dayOfWeek: dow, hour, medianCi: baseCi });
        data.push({ segmentId: 'hsr', dayOfWeek: dow, hour, medianCi: baseCi + 0.02 });
        data.push({ segmentId: 'ibblur', dayOfWeek: dow, hour, medianCi: baseCi - 0.02 });
      }
    }

    // Use full range positions 0-2
    const results = computeRecommendations(data, 0, 2);

    expect(results).toHaveLength(7);

    for (const result of results) {
      // Best window should be hour 5 (lowest CI)
      expect(result.best.startHour).toBe(5);
      expect(result.best.endHour).toBe(6);

      // Worst window should be hour 17 (highest CI)
      expect(result.worst.startHour).toBe(17);
      expect(result.worst.endHour).toBe(18);

      // Manual calculation: average of [baseCi, baseCi+0.02, baseCi-0.02] = baseCi
      // Best avg: 0.1, Worst avg: 0.9
      expect(result.best.avgCongestionIndex).toBeCloseTo(0.1, 3);
      expect(result.worst.avgCongestionIndex).toBeCloseTo(0.9, 3);
    }
  });

  it('filters to sub-corridor correctly', () => {
    // Create data for positions 0-9 but only query positions 3-5
    const data: MedianCiRow[] = [];

    for (let hour = 0; hour < 24; hour++) {
      // Segments outside range (positions 0-2, 6-9) have low CI
      data.push({ segmentId: 'silk-board', dayOfWeek: 0, hour, medianCi: 0.1 }); // pos 0
      data.push({ segmentId: 'hsr', dayOfWeek: 0, hour, medianCi: 0.1 }); // pos 1
      data.push({ segmentId: 'ibblur', dayOfWeek: 0, hour, medianCi: 0.1 }); // pos 2

      // Segments inside range (positions 3-5) — hour 8 is worst, hour 22 is best
      const inRangeCi = hour === 8 ? 0.85 : hour === 22 ? 0.15 : 0.5;
      data.push({ segmentId: 'bellandur', dayOfWeek: 0, hour, medianCi: inRangeCi }); // pos 3
      data.push({ segmentId: 'ecospace', dayOfWeek: 0, hour, medianCi: inRangeCi }); // pos 4
      data.push({ segmentId: 'kadubeesanahalli', dayOfWeek: 0, hour, medianCi: inRangeCi }); // pos 5

      // More outside-range segments
      data.push({ segmentId: 'marathahalli', dayOfWeek: 0, hour, medianCi: 0.1 }); // pos 6
    }

    // Query only positions 3-5
    const results = computeRecommendations(data, 3, 5);

    expect(results).toHaveLength(1); // Only day 0

    // The best/worst should reflect only in-range segment data
    expect(results[0].best.startHour).toBe(22);
    expect(results[0].worst.startHour).toBe(8);
    expect(results[0].best.avgCongestionIndex).toBeCloseTo(0.15, 3);
    expect(results[0].worst.avgCongestionIndex).toBeCloseTo(0.85, 3);
  });

  it('returns empty array when no data matches the sub-corridor', () => {
    // All data is for segments outside position range 7-9
    const data: MedianCiRow[] = [
      { segmentId: 'silk-board', dayOfWeek: 0, hour: 8, medianCi: 0.5 }, // pos 0
      { segmentId: 'hsr', dayOfWeek: 0, hour: 8, medianCi: 0.5 }, // pos 1
    ];

    // Query positions 7-9 (doddanekundi, mahadevapura, kr-puram)
    const results = computeRecommendations(data, 7, 9);
    expect(results).toHaveLength(0);
  });
});

// --- 5. validateSegmentId (used by multiple routes) ---

describe('validateSegmentId - Integration', () => {
  it('accepts all valid segment IDs', () => {
    for (const id of SEGMENT_IDS) {
      const result = validateSegmentId(id);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.id).toBe(id);
      }
    }
  });

  it('rejects invalid segment IDs with correct error', () => {
    const invalidIds = [
      'invalid-segment',
      'SILK-BOARD',
      '',
      'silk board',
      'marathahalli-bridge',
      '123',
      'null',
    ];

    for (const id of invalidIds) {
      const result = validateSegmentId(id);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe('Segment not found');
      }
    }
  });

  it('is case-sensitive', () => {
    const result = validateSegmentId('Silk-Board');
    expect(result.valid).toBe(false);
  });
});
