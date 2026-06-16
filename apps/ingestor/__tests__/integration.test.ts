import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TrafficReading, TomTomFlowSegment } from '@orr-pulse/shared';

// ───────────────────────────────────────────────────────────────────────────────
// Integration Tests: Ingestor → Database
// Validates: Requirements 14.2
//
// These tests verify end-to-end data flow from poll cycle through validation
// and into the database layer using mocked pg Pool. They confirm:
// 1. A poll cycle with mocked TomTom responses writes correct rows
// 2. Full poll cycle integration (fetch → validate → write)
// 3. Confidence filter discards low-confidence readings at DB level
// ───────────────────────────────────────────────────────────────────────────────

// Mock the pg pool to capture SQL and params
const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('../src/db.js', () => ({
  pool: { query: mockQuery },
}));

vi.mock('../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('Integration: Ingestor → Database', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rowCount: 0, rows: [], command: '', oid: 0, fields: [] });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-07-01T08:30:00.000Z'));
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 1: batchInsert writes correct rows with correct column mapping
  // ─────────────────────────────────────────────────────────────────────────────

  describe('batchInsert writes correct rows to traffic_readings', () => {
    it('inserts readings with correct column mapping and parameterized values', async () => {
      const { batchInsert } = await import('../src/writer.js');

      mockQuery.mockResolvedValue({ rowCount: 3, rows: [], command: '', oid: 0, fields: [] });

      const readings: TrafficReading[] = [
        {
          segmentId: 'silk-board',
          time: '2024-07-01T08:30:00.000Z',
          currentSpeed: 25,
          freeFlowSpeed: 60,
          currentTravelTime: 144,
          freeFlowTravelTime: 60,
          confidence: 0.92,
          congestionIndex: 0.583,
          roadClosure: false,
        },
        {
          segmentId: 'marathahalli',
          time: '2024-07-01T08:30:00.000Z',
          currentSpeed: 35,
          freeFlowSpeed: 55,
          currentTravelTime: 94,
          freeFlowTravelTime: 60,
          confidence: 0.85,
          congestionIndex: 0.364,
          roadClosure: false,
        },
        {
          segmentId: 'kr-puram',
          time: '2024-07-01T08:30:00.000Z',
          currentSpeed: 10,
          freeFlowSpeed: 50,
          currentTravelTime: 300,
          freeFlowTravelTime: 60,
          confidence: 0.78,
          congestionIndex: 0.8,
          roadClosure: true,
        },
      ];

      const rowCount = await batchInsert(readings);

      expect(rowCount).toBe(3);
      expect(mockQuery).toHaveBeenCalledTimes(1);

      const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

      // Verify INSERT targets traffic_readings table
      expect(sql).toMatch(/INSERT INTO traffic_readings/);

      // Verify all 9 columns are specified
      expect(sql).toContain('time');
      expect(sql).toContain('segment_id');
      expect(sql).toContain('current_speed');
      expect(sql).toContain('free_flow_speed');
      expect(sql).toContain('current_travel_time');
      expect(sql).toContain('free_flow_travel_time');
      expect(sql).toContain('confidence');
      expect(sql).toContain('congestion_index');
      expect(sql).toContain('road_closure');

      // 3 readings × 9 columns = 27 parameterized values
      expect(values).toHaveLength(27);

      // Verify first reading's values (silk-board)
      expect(values[0]).toBe('2024-07-01T08:30:00.000Z');
      expect(values[1]).toBe('silk-board');
      expect(values[2]).toBe(25);
      expect(values[3]).toBe(60);
      expect(values[4]).toBe(144);
      expect(values[5]).toBe(60);
      expect(values[6]).toBe(0.92);
      expect(values[7]).toBe(0.583);
      expect(values[8]).toBe(false);

      // Verify third reading's values (kr-puram with road closure)
      expect(values[18]).toBe('2024-07-01T08:30:00.000Z');
      expect(values[19]).toBe('kr-puram');
      expect(values[20]).toBe(10);
      expect(values[21]).toBe(50);
      expect(values[22]).toBe(300);
      expect(values[23]).toBe(60);
      expect(values[24]).toBe(0.78);
      expect(values[25]).toBe(0.8);
      expect(values[26]).toBe(true);
    });

    it('uses parameterized placeholders ($1, $2, ...) to prevent SQL injection', async () => {
      const { batchInsert } = await import('../src/writer.js');

      mockQuery.mockResolvedValue({ rowCount: 1, rows: [], command: '', oid: 0, fields: [] });

      const readings: TrafficReading[] = [
        {
          segmentId: 'hsr',
          time: '2024-07-01T08:30:00.000Z',
          currentSpeed: 40,
          freeFlowSpeed: 60,
          currentTravelTime: 90,
          freeFlowTravelTime: 60,
          confidence: 0.95,
          congestionIndex: 0.333,
          roadClosure: false,
        },
      ];

      await batchInsert(readings);

      const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];

      // Verify parameterized placeholders are used (not string interpolation)
      expect(sql).toMatch(/\$\d+/);
      // Should not contain raw values in the SQL string
      expect(sql).not.toContain("'hsr'");
      expect(sql).not.toContain('40');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 2: Full poll cycle with mocked fetcher writes to database
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Full poll cycle with mocked TomTom responses writes correct rows', () => {
    let mockFetchAllSegments: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.resetModules();
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-07-01T08:30:00.000Z'));

      mockQuery.mockReset();
      mockQuery.mockResolvedValue({ rowCount: 0, rows: [], command: '', oid: 0, fields: [] });

      mockFetchAllSegments = vi.fn();

      vi.doMock('../src/db.js', () => ({
        pool: { query: mockQuery },
      }));
      vi.doMock('../src/fetcher.js', () => ({
        fetchAllSegments: mockFetchAllSegments,
      }));
      vi.doMock('../src/logger.js', () => ({
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      }));
    });

    it('end-to-end: fetched TomTom responses flow through validator into DB insert', async () => {
      // Simulate TomTom API returning data for 3 segments (all high confidence)
      const tomtomResponses: (TomTomFlowSegment & { segmentId: string })[] = [
        {
          segmentId: 'silk-board',
          flowSegmentData: {
            currentSpeed: 25,
            freeFlowSpeed: 60,
            currentTravelTime: 144,
            freeFlowTravelTime: 60,
            confidence: 0.92,
            roadClosure: false,
          },
        },
        {
          segmentId: 'bellandur',
          flowSegmentData: {
            currentSpeed: 40,
            freeFlowSpeed: 55,
            currentTravelTime: 82,
            freeFlowTravelTime: 60,
            confidence: 0.88,
            roadClosure: false,
          },
        },
        {
          segmentId: 'marathahalli',
          flowSegmentData: {
            currentSpeed: 15,
            freeFlowSpeed: 50,
            currentTravelTime: 200,
            freeFlowTravelTime: 60,
            confidence: 0.75,
            roadClosure: true,
          },
        },
      ];

      mockFetchAllSegments.mockResolvedValue(tomtomResponses);
      mockQuery.mockResolvedValue({ rowCount: 3, rows: [], command: '', oid: 0, fields: [] });

      const { runPollCycle } = await import('../src/poller.js');
      await runPollCycle();

      // Verify DB received exactly 3 readings (all have confidence >= 0.5)
      expect(mockQuery).toHaveBeenCalledTimes(1);

      const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('INSERT INTO traffic_readings');
      // 3 readings × 9 columns = 27 params
      expect(values).toHaveLength(27);

      // Verify segment IDs are in the values (at positions 1, 10, 19)
      expect(values[1]).toBe('silk-board');
      expect(values[10]).toBe('bellandur');
      expect(values[19]).toBe('marathahalli');

      // Verify congestion indices were computed correctly
      // silk-board: 1 - (25/60) = 0.5833...
      expect(values[7]).toBeCloseTo(1 - 25 / 60, 5);
      // bellandur: 1 - (40/55) = 0.2727...
      expect(values[16]).toBeCloseTo(1 - 40 / 55, 5);
      // marathahalli: 1 - (15/50) = 0.7
      expect(values[25]).toBeCloseTo(0.7, 5);

      // Verify road_closure was passed through
      expect(values[8]).toBe(false);  // silk-board
      expect(values[17]).toBe(false); // bellandur
      expect(values[26]).toBe(true);  // marathahalli
    });

    it('poll cycle with mixed responses: only valid segments are written', async () => {
      // One valid, one with invalid schema (missing flowSegmentData), one valid
      const tomtomResponses: (TomTomFlowSegment & { segmentId: string })[] = [
        {
          segmentId: 'hsr',
          flowSegmentData: {
            currentSpeed: 45,
            freeFlowSpeed: 60,
            currentTravelTime: 80,
            freeFlowTravelTime: 60,
            confidence: 0.9,
            roadClosure: false,
          },
        },
        // This response will fail Zod validation (negative speed)
        {
          segmentId: 'ibblur',
          flowSegmentData: {
            currentSpeed: -5,
            freeFlowSpeed: 60,
            currentTravelTime: 80,
            freeFlowTravelTime: 60,
            confidence: 0.8,
            roadClosure: false,
          },
        },
        {
          segmentId: 'ecospace',
          flowSegmentData: {
            currentSpeed: 50,
            freeFlowSpeed: 55,
            currentTravelTime: 66,
            freeFlowTravelTime: 60,
            confidence: 0.85,
            roadClosure: false,
          },
        },
      ];

      mockFetchAllSegments.mockResolvedValue(tomtomResponses);
      mockQuery.mockResolvedValue({ rowCount: 2, rows: [], command: '', oid: 0, fields: [] });

      const { runPollCycle } = await import('../src/poller.js');
      await runPollCycle();

      // The invalid reading (negative speed) should be filtered by Zod validation
      // Only 2 valid readings should reach the DB
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [, values] = mockQuery.mock.calls[0] as [string, unknown[]];

      // 2 readings × 9 columns = 18 params
      expect(values).toHaveLength(18);
      expect(values[1]).toBe('hsr');
      expect(values[10]).toBe('ecospace');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 3: Confidence filter discards low-confidence readings at DB level
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Confidence filter prevents low-confidence readings from reaching DB', () => {
    let mockFetchAllSegments: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.resetModules();
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-07-01T08:30:00.000Z'));

      mockQuery.mockReset();
      mockQuery.mockResolvedValue({ rowCount: 0, rows: [], command: '', oid: 0, fields: [] });

      mockFetchAllSegments = vi.fn();

      vi.doMock('../src/db.js', () => ({
        pool: { query: mockQuery },
      }));
      vi.doMock('../src/fetcher.js', () => ({
        fetchAllSegments: mockFetchAllSegments,
      }));
      vi.doMock('../src/logger.js', () => ({
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      }));
    });

    it('readings with confidence < 0.5 are never written to traffic_readings', async () => {
      const tomtomResponses: (TomTomFlowSegment & { segmentId: string })[] = [
        {
          segmentId: 'silk-board',
          flowSegmentData: {
            currentSpeed: 30,
            freeFlowSpeed: 60,
            currentTravelTime: 120,
            freeFlowTravelTime: 60,
            confidence: 0.3, // Below threshold
            roadClosure: false,
          },
        },
        {
          segmentId: 'hsr',
          flowSegmentData: {
            currentSpeed: 40,
            freeFlowSpeed: 60,
            currentTravelTime: 90,
            freeFlowTravelTime: 60,
            confidence: 0.1, // Below threshold
            roadClosure: false,
          },
        },
        {
          segmentId: 'bellandur',
          flowSegmentData: {
            currentSpeed: 45,
            freeFlowSpeed: 60,
            currentTravelTime: 80,
            freeFlowTravelTime: 60,
            confidence: 0.49, // Below threshold (boundary)
            roadClosure: false,
          },
        },
      ];

      mockFetchAllSegments.mockResolvedValue(tomtomResponses);

      const { runPollCycle } = await import('../src/poller.js');
      await runPollCycle();

      // batchInsert is called with an empty array, so no DB query is made
      // (batchInsert short-circuits on empty input)
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('only high-confidence readings pass through; low-confidence are discarded', async () => {
      const tomtomResponses: (TomTomFlowSegment & { segmentId: string })[] = [
        {
          segmentId: 'silk-board',
          flowSegmentData: {
            currentSpeed: 30,
            freeFlowSpeed: 60,
            currentTravelTime: 120,
            freeFlowTravelTime: 60,
            confidence: 0.9, // Above threshold — should be written
            roadClosure: false,
          },
        },
        {
          segmentId: 'hsr',
          flowSegmentData: {
            currentSpeed: 40,
            freeFlowSpeed: 60,
            currentTravelTime: 90,
            freeFlowTravelTime: 60,
            confidence: 0.2, // Below threshold — should NOT be written
            roadClosure: false,
          },
        },
        {
          segmentId: 'bellandur',
          flowSegmentData: {
            currentSpeed: 50,
            freeFlowSpeed: 60,
            currentTravelTime: 72,
            freeFlowTravelTime: 60,
            confidence: 0.5, // Exactly at threshold — should be written
            roadClosure: false,
          },
        },
        {
          segmentId: 'ecospace',
          flowSegmentData: {
            currentSpeed: 35,
            freeFlowSpeed: 55,
            currentTravelTime: 94,
            freeFlowTravelTime: 60,
            confidence: 0.45, // Below threshold — should NOT be written
            roadClosure: false,
          },
        },
      ];

      mockFetchAllSegments.mockResolvedValue(tomtomResponses);
      mockQuery.mockResolvedValue({ rowCount: 2, rows: [], command: '', oid: 0, fields: [] });

      const { runPollCycle } = await import('../src/poller.js');
      await runPollCycle();

      // Only 2 readings (silk-board: 0.9, bellandur: 0.5) should be written
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('INSERT INTO traffic_readings');
      // 2 readings × 9 columns = 18 params
      expect(values).toHaveLength(18);

      // Verify only high-confidence segments made it through
      expect(values[1]).toBe('silk-board');   // confidence 0.9
      expect(values[10]).toBe('bellandur');   // confidence 0.5

      // Verify confidence values stored are the original values
      expect(values[6]).toBe(0.9);   // silk-board confidence
      expect(values[15]).toBe(0.5);  // bellandur confidence

      // Ensure low-confidence segments (hsr: 0.2, ecospace: 0.45) are NOT present
      const allSegmentIds = [];
      for (let i = 1; i < (values as unknown[]).length; i += 9) {
        allSegmentIds.push(values[i]);
      }
      expect(allSegmentIds).not.toContain('hsr');
      expect(allSegmentIds).not.toContain('ecospace');
    });

    it('boundary: confidence exactly 0.5 is included, 0.499 is excluded', async () => {
      const tomtomResponses: (TomTomFlowSegment & { segmentId: string })[] = [
        {
          segmentId: 'doddanekundi',
          flowSegmentData: {
            currentSpeed: 30,
            freeFlowSpeed: 50,
            currentTravelTime: 100,
            freeFlowTravelTime: 60,
            confidence: 0.5, // Exactly at threshold — included
            roadClosure: false,
          },
        },
        {
          segmentId: 'mahadevapura',
          flowSegmentData: {
            currentSpeed: 30,
            freeFlowSpeed: 50,
            currentTravelTime: 100,
            freeFlowTravelTime: 60,
            confidence: 0.499, // Just below threshold — excluded
            roadClosure: false,
          },
        },
      ];

      mockFetchAllSegments.mockResolvedValue(tomtomResponses);
      mockQuery.mockResolvedValue({ rowCount: 1, rows: [], command: '', oid: 0, fields: [] });

      const { runPollCycle } = await import('../src/poller.js');
      await runPollCycle();

      // Only doddanekundi (0.5) should be written
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [, values] = mockQuery.mock.calls[0] as [string, unknown[]];

      // 1 reading × 9 columns = 9 params
      expect(values).toHaveLength(9);
      expect(values[1]).toBe('doddanekundi');
      expect(values[6]).toBe(0.5);
    });
  });
});
