// Feature: orr-pulse, Property 11: Sub-corridor filtering includes only segments in range
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { SEGMENTS, SEGMENT_IDS } from '@orr-pulse/shared';
import {
  computeRecommendations,
  type MedianCiRow,
} from '../lib/recommendations';

/**
 * **Validates: Requirements 7.3**
 *
 * For any valid from/to segment pair where from.position <= to.position,
 * the recommendation computation shall include only segments whose
 * position is >= from.position and <= to.position.
 */

/**
 * Arbitrary generator for a from/to position pair ensuring from <= to.
 */
const positionRangeArb = fc
  .integer({ min: 0, max: 9 })
  .chain((from) =>
    fc.integer({ min: from, max: 9 }).map((to) => ({ from, to }))
  );

/**
 * Arbitrary generator for a MedianCiRow with a segment from the full corridor.
 */
const medianCiRowArb: fc.Arbitrary<MedianCiRow> = fc.record({
  segmentId: fc.constantFrom(...SEGMENT_IDS),
  dayOfWeek: fc.integer({ min: 0, max: 6 }),
  hour: fc.integer({ min: 0, max: 23 }),
  medianCi: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
});

/**
 * Helper: compute expected recommendations using only segments in [fromPos, toPos].
 * Replicates the logic of computeRecommendations for comparison.
 */
function computeExpectedFiltered(
  data: MedianCiRow[],
  fromPosition: number,
  toPosition: number
) {
  const segmentsInRange = new Set(
    SEGMENTS
      .filter((s) => s.position >= fromPosition && s.position <= toPosition)
      .map((s) => s.id)
  );

  const filtered = data.filter((row) => segmentsInRange.has(row.segmentId as any));

  if (filtered.length === 0) return [];

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

  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
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

  const dayGroups = new Map<number, Array<{ hour: number; avgCi: number }>>();
  for (const entry of avgByDayHour.values()) {
    const existing = dayGroups.get(entry.dayOfWeek);
    if (existing) {
      existing.push({ hour: entry.hour, avgCi: entry.avgCi });
    } else {
      dayGroups.set(entry.dayOfWeek, [{ hour: entry.hour, avgCi: entry.avgCi }]);
    }
  }

  const results: Array<{
    dayOfWeek: number;
    dayName: string;
    best: { startHour: number; endHour: number; avgCongestionIndex: number };
    worst: { startHour: number; endHour: number; avgCongestionIndex: number };
  }> = [];

  for (let dow = 0; dow < 7; dow++) {
    const hours = dayGroups.get(dow);
    if (!hours || hours.length === 0) continue;

    let best = hours[0];
    let worst = hours[0];
    for (const h of hours) {
      if (h.avgCi < best.avgCi) best = h;
      if (h.avgCi > worst.avgCi) worst = h;
    }

    results.push({
      dayOfWeek: dow,
      dayName: dayNames[dow],
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

describe('computeRecommendations - Property 11: Sub-corridor filtering', () => {
  // **Validates: Requirements 7.3**
  it('only includes segments within [fromPosition, toPosition] range', () => {
    fc.assert(
      fc.property(
        positionRangeArb,
        fc.array(medianCiRowArb, { minLength: 1, maxLength: 200 }),
        ({ from, to }, data) => {
          const actual = computeRecommendations(data, from, to);
          const expected = computeExpectedFiltered(data, from, to);

          // Results should have same length
          expect(actual.length).toBe(expected.length);

          // Each day's results should match
          for (let i = 0; i < actual.length; i++) {
            expect(actual[i].dayOfWeek).toBe(expected[i].dayOfWeek);
            expect(actual[i].dayName).toBe(expected[i].dayName);
            expect(actual[i].best.startHour).toBe(expected[i].best.startHour);
            expect(actual[i].best.avgCongestionIndex).toBeCloseTo(
              expected[i].best.avgCongestionIndex,
              4
            );
            expect(actual[i].worst.startHour).toBe(expected[i].worst.startHour);
            expect(actual[i].worst.avgCongestionIndex).toBeCloseTo(
              expected[i].worst.avgCongestionIndex,
              4
            );
          }
        }
      ),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 7.3**
  it('segments outside the range do not influence the result', () => {
    fc.assert(
      fc.property(
        positionRangeArb,
        fc.array(medianCiRowArb, { minLength: 1, maxLength: 100 }),
        fc.array(medianCiRowArb, { minLength: 1, maxLength: 50 }),
        ({ from, to }, inRangeData, extraData) => {
          // Get segment IDs in range
          const segmentsInRange = new Set(
            SEGMENTS
              .filter((s) => s.position >= from && s.position <= to)
              .map((s) => s.id)
          );

          // Get segment IDs outside range
          const segmentsOutRange = SEGMENTS
            .filter((s) => s.position < from || s.position > to)
            .map((s) => s.id);

          // If there are no out-of-range segments, skip this test case
          if (segmentsOutRange.length === 0) return;

          // Force extra data to use only out-of-range segments
          const outOfRangeData: MedianCiRow[] = extraData.map((row) => ({
            ...row,
            segmentId: segmentsOutRange[Math.abs(row.hour) % segmentsOutRange.length],
          }));

          // Compute with only in-range data
          const resultWithoutExtra = computeRecommendations(inRangeData, from, to);

          // Compute with in-range data + out-of-range data
          const combined = [...inRangeData, ...outOfRangeData];
          const resultWithExtra = computeRecommendations(combined, from, to);

          // Results should be identical — out-of-range data shouldn't matter
          expect(resultWithExtra.length).toBe(resultWithoutExtra.length);

          for (let i = 0; i < resultWithExtra.length; i++) {
            expect(resultWithExtra[i].dayOfWeek).toBe(resultWithoutExtra[i].dayOfWeek);
            expect(resultWithExtra[i].best.startHour).toBe(resultWithoutExtra[i].best.startHour);
            expect(resultWithExtra[i].best.avgCongestionIndex).toBeCloseTo(
              resultWithoutExtra[i].best.avgCongestionIndex,
              4
            );
            expect(resultWithExtra[i].worst.startHour).toBe(resultWithoutExtra[i].worst.startHour);
            expect(resultWithExtra[i].worst.avgCongestionIndex).toBeCloseTo(
              resultWithoutExtra[i].worst.avgCongestionIndex,
              4
            );
          }
        }
      ),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 7.3**
  it('returns empty results when no data exists for segments in range', () => {
    fc.assert(
      fc.property(
        positionRangeArb,
        fc.array(medianCiRowArb, { minLength: 1, maxLength: 50 }),
        ({ from, to }, data) => {
          // Get segment IDs outside the range
          const segmentsOutRange = SEGMENTS
            .filter((s) => s.position < from || s.position > to)
            .map((s) => s.id);

          // If all segments are in range, skip
          if (segmentsOutRange.length === 0) return;

          // Force all data to use only out-of-range segments
          const outOfRangeOnlyData: MedianCiRow[] = data.map((row) => ({
            ...row,
            segmentId: segmentsOutRange[Math.abs(row.hour) % segmentsOutRange.length],
          }));

          const result = computeRecommendations(outOfRangeOnlyData, from, to);

          // Should return empty since no data is in range
          expect(result).toEqual([]);
        }
      ),
      { numRuns: 100 },
    );
  });
});
