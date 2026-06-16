// Feature: orr-pulse, Property 7: Heatmap aggregation correctness
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { SEGMENT_IDS } from '@orr-pulse/shared';
import { computeHeatmapMatrix, type HourlyStatRow } from '../lib/queries';

/**
 * Generate a segment ID from the predefined list.
 */
const segmentIdArb = fc.constantFrom(...SEGMENT_IDS);

/**
 * Generate a random UTC date within a reasonable range.
 */
const bucketDateArb = fc.date({
  min: new Date('2024-01-01T00:00:00Z'),
  max: new Date('2024-12-31T23:59:59Z'),
}).map((d) => {
  // Normalize to the top of the hour to simulate hourly buckets
  const normalized = new Date(d);
  normalized.setUTCMinutes(0, 0, 0);
  return normalized;
});

/**
 * Arbitrary generator for an HourlyStatRow.
 */
const hourlyStatRowArb: fc.Arbitrary<HourlyStatRow> = fc.record({
  bucket: bucketDateArb,
  segmentId: segmentIdArb,
  avgCi: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
});

/**
 * Helper to compute expected dayOfWeek from a Date (matching our Monday=0 format).
 */
function expectedDayOfWeek(date: Date): number {
  const jsDow = date.getUTCDay(); // 0=Sunday, 1=Monday...6=Saturday
  return jsDow === 0 ? 6 : jsDow - 1;
}

/**
 * Helper to manually compute expected heatmap from rows.
 */
function computeExpectedHeatmap(rows: HourlyStatRow[]): Map<string, number> {
  const groups = new Map<string, number[]>();

  for (const row of rows) {
    const dayOfWeek = expectedDayOfWeek(row.bucket);
    const hour = row.bucket.getUTCHours();
    const key = `${dayOfWeek}:${hour}`;

    const existing = groups.get(key);
    if (existing) {
      existing.push(row.avgCi);
    } else {
      groups.set(key, [row.avgCi]);
    }
  }

  const result = new Map<string, number>();
  for (const [key, values] of groups) {
    const sum = values.reduce((acc, v) => acc + v, 0);
    result.set(key, sum / values.length);
  }
  return result;
}

describe('computeHeatmapMatrix - Property 7', () => {
  // **Validates: Requirements 5.1**
  it('returns the correct arithmetic mean per (dayOfWeek, hour) group', () => {
    fc.assert(
      fc.property(
        fc.array(hourlyStatRowArb, { minLength: 1, maxLength: 100 }),
        (rows) => {
          const result = computeHeatmapMatrix(rows);
          const expected = computeExpectedHeatmap(rows);

          // Result should have exactly as many cells as distinct (dayOfWeek, hour) groups
          expect(result.length).toBe(expected.size);

          // Each cell should match the expected arithmetic mean
          for (const cell of result) {
            const key = `${cell.dayOfWeek}:${cell.hour}`;
            const expectedAvg = expected.get(key);
            expect(expectedAvg).toBeDefined();
            expect(cell.avgCongestionIndex).toBeCloseTo(expectedAvg!, 10);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 5.1**
  it('each cell averages across all segments for that (dayOfWeek, hour)', () => {
    fc.assert(
      fc.property(
        fc.array(hourlyStatRowArb, { minLength: 1, maxLength: 100 }),
        (rows) => {
          const result = computeHeatmapMatrix(rows);

          for (const cell of result) {
            // Find all input rows matching this (dayOfWeek, hour)
            const matchingRows = rows.filter((r) => {
              const dow = expectedDayOfWeek(r.bucket);
              const hour = r.bucket.getUTCHours();
              return dow === cell.dayOfWeek && hour === cell.hour;
            });

            // There should be at least one matching row
            expect(matchingRows.length).toBeGreaterThan(0);

            // The average should be the arithmetic mean of all matching avgCi values
            const expectedAvg =
              matchingRows.reduce((sum, r) => sum + r.avgCi, 0) / matchingRows.length;
            expect(cell.avgCongestionIndex).toBeCloseTo(expectedAvg, 10);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 5.1**
  it('dayOfWeek values are in range [0, 6] and hour values are in range [0, 23]', () => {
    fc.assert(
      fc.property(
        fc.array(hourlyStatRowArb, { minLength: 1, maxLength: 50 }),
        (rows) => {
          const result = computeHeatmapMatrix(rows);

          for (const cell of result) {
            expect(cell.dayOfWeek).toBeGreaterThanOrEqual(0);
            expect(cell.dayOfWeek).toBeLessThanOrEqual(6);
            expect(cell.hour).toBeGreaterThanOrEqual(0);
            expect(cell.hour).toBeLessThanOrEqual(23);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 5.1**
  it('returns empty array for empty input', () => {
    const result = computeHeatmapMatrix([]);
    expect(result).toEqual([]);
  });
});
