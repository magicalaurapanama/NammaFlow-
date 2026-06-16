// Feature: orr-pulse, Property 10: Recommendation windows identify correct best and worst periods
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { SEGMENT_IDS } from '@orr-pulse/shared';
import {
  computeRecommendations,
  type MedianCiRow,
} from '../lib/recommendations';

/**
 * Arbitrary generator for a segment ID from the predefined list.
 */
const segmentIdArb = fc.constantFrom(...SEGMENT_IDS);

/**
 * Arbitrary generator for a MedianCiRow.
 */
const medianCiRowArb: fc.Arbitrary<MedianCiRow> = fc.record({
  segmentId: segmentIdArb,
  dayOfWeek: fc.integer({ min: 0, max: 6 }),
  hour: fc.integer({ min: 0, max: 23 }),
  medianCi: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
});

/**
 * Helper to manually compute corridor-average CI per (dayOfWeek, hour)
 * for the full corridor (positions 0-9).
 */
function computeExpectedAvgByDayHour(
  data: MedianCiRow[]
): Map<string, { dayOfWeek: number; hour: number; avgCi: number }> {
  // All segment IDs are in range for full corridor (positions 0-9)
  const segmentsInRange = new Set(SEGMENT_IDS);
  const filtered = data.filter((row) => segmentsInRange.has(row.segmentId as any));

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

  return avgByDayHour;
}

describe('computeRecommendations - Property 10', () => {
  // **Validates: Requirements 7.1, 7.2**
  it('best window has avgCongestionIndex <= worst window for each day', () => {
    fc.assert(
      fc.property(
        fc.array(medianCiRowArb, { minLength: 1, maxLength: 200 }),
        (data) => {
          const results = computeRecommendations(data, 0, 9);

          for (const rec of results) {
            expect(rec.best.avgCongestionIndex).toBeLessThanOrEqual(
              rec.worst.avgCongestionIndex
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 7.1, 7.2**
  it('best hour has the minimum average CI across all hours for that day', () => {
    fc.assert(
      fc.property(
        fc.array(medianCiRowArb, { minLength: 1, maxLength: 200 }),
        (data) => {
          const results = computeRecommendations(data, 0, 9);
          const avgByDayHour = computeExpectedAvgByDayHour(data);

          for (const rec of results) {
            // Collect all hour averages for this day
            const dayHourAvgs: number[] = [];
            for (const entry of avgByDayHour.values()) {
              if (entry.dayOfWeek === rec.dayOfWeek) {
                dayHourAvgs.push(entry.avgCi);
              }
            }

            if (dayHourAvgs.length === 0) continue;

            const minCi = Math.min(...dayHourAvgs);
            // The best avgCongestionIndex should match the minimum (within rounding tolerance)
            expect(rec.best.avgCongestionIndex).toBeCloseTo(
              Number(minCi.toFixed(4)),
              4
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 7.1, 7.2**
  it('worst hour has the maximum average CI across all hours for that day', () => {
    fc.assert(
      fc.property(
        fc.array(medianCiRowArb, { minLength: 1, maxLength: 200 }),
        (data) => {
          const results = computeRecommendations(data, 0, 9);
          const avgByDayHour = computeExpectedAvgByDayHour(data);

          for (const rec of results) {
            // Collect all hour averages for this day
            const dayHourAvgs: number[] = [];
            for (const entry of avgByDayHour.values()) {
              if (entry.dayOfWeek === rec.dayOfWeek) {
                dayHourAvgs.push(entry.avgCi);
              }
            }

            if (dayHourAvgs.length === 0) continue;

            const maxCi = Math.max(...dayHourAvgs);
            // The worst avgCongestionIndex should match the maximum (within rounding tolerance)
            expect(rec.worst.avgCongestionIndex).toBeCloseTo(
              Number(maxCi.toFixed(4)),
              4
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 7.1, 7.2**
  it('dayOfWeek values are unique in the result', () => {
    fc.assert(
      fc.property(
        fc.array(medianCiRowArb, { minLength: 1, maxLength: 200 }),
        (data) => {
          const results = computeRecommendations(data, 0, 9);

          const days = results.map((r) => r.dayOfWeek);
          const uniqueDays = new Set(days);
          expect(days.length).toBe(uniqueDays.size);
        },
      ),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 7.1, 7.2**
  it('returns empty array for empty input', () => {
    const result = computeRecommendations([], 0, 9);
    expect(result).toEqual([]);
  });
});
