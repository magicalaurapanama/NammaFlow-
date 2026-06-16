import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TrafficReading } from '@orr-pulse/shared';

// Use vi.hoisted so the mock fn is available when vi.mock factory runs
const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('../src/db.js', () => ({
  pool: { query: mockQuery },
}));

vi.mock('../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { batchInsert } from '../src/writer.js';

// ───────────────────────────────────────────────────────────────────────────────
// Test 2: Writer builds correct multi-row INSERT SQL
// ───────────────────────────────────────────────────────────────────────────────

describe('Writer builds correct multi-row INSERT SQL', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('builds correct INSERT statement for multiple readings', async () => {
    mockQuery.mockResolvedValue({ rowCount: 2, rows: [], command: '', oid: 0, fields: [] });

    const readings: TrafficReading[] = [
      {
        segmentId: 'silk-board',
        time: '2024-06-15T10:00:00.000Z',
        currentSpeed: 30,
        freeFlowSpeed: 60,
        currentTravelTime: 120,
        freeFlowTravelTime: 60,
        confidence: 0.9,
        congestionIndex: 0.5,
        roadClosure: false,
      },
      {
        segmentId: 'hsr',
        time: '2024-06-15T10:00:00.000Z',
        currentSpeed: 50,
        freeFlowSpeed: 60,
        currentTravelTime: 72,
        freeFlowTravelTime: 60,
        confidence: 0.8,
        congestionIndex: 0.167,
        roadClosure: false,
      },
    ];

    const result = await batchInsert(readings);

    expect(result).toBe(2);
    expect(mockQuery).toHaveBeenCalledTimes(1);

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    // Verify SQL has correct INSERT INTO syntax with proper column names
    expect(sql).toContain('INSERT INTO traffic_readings');
    expect(sql).toContain('time');
    expect(sql).toContain('segment_id');
    expect(sql).toContain('current_speed');
    expect(sql).toContain('free_flow_speed');
    expect(sql).toContain('current_travel_time');
    expect(sql).toContain('free_flow_travel_time');
    expect(sql).toContain('confidence');
    expect(sql).toContain('congestion_index');
    expect(sql).toContain('road_closure');

    // 9 params per reading × 2 readings = 18 values
    expect(values).toHaveLength(18);

    // Verify first reading values (offset 0–8)
    expect(values[0]).toBe('2024-06-15T10:00:00.000Z'); // time
    expect(values[1]).toBe('silk-board');                // segment_id
    expect(values[2]).toBe(30);                         // current_speed
    expect(values[3]).toBe(60);                         // free_flow_speed
    expect(values[4]).toBe(120);                        // current_travel_time
    expect(values[5]).toBe(60);                         // free_flow_travel_time
    expect(values[6]).toBe(0.9);                        // confidence
    expect(values[7]).toBe(0.5);                        // congestion_index
    expect(values[8]).toBe(false);                      // road_closure

    // Verify second reading values (offset 9–17)
    expect(values[9]).toBe('2024-06-15T10:00:00.000Z');
    expect(values[10]).toBe('hsr');
    expect(values[11]).toBe(50);
  });

  it('returns 0 and skips query for empty readings array', async () => {
    const result = await batchInsert([]);

    expect(result).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('generates correct parameterized placeholders for single reading', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1, rows: [], command: '', oid: 0, fields: [] });

    const readings: TrafficReading[] = [
      {
        segmentId: 'marathahalli',
        time: '2024-06-15T10:15:00.000Z',
        currentSpeed: 20,
        freeFlowSpeed: 55,
        currentTravelTime: 165,
        freeFlowTravelTime: 60,
        confidence: 0.7,
        congestionIndex: 0.636,
        roadClosure: true,
      },
    ];

    await batchInsert(readings);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    // Single row: should have 9 values and VALUES clause with placeholders
    expect(sql).toContain('VALUES');
    expect(values).toHaveLength(9);

    // Verify values order matches columns
    expect(values[0]).toBe('2024-06-15T10:15:00.000Z'); // time
    expect(values[1]).toBe('marathahalli');              // segment_id
    expect(values[2]).toBe(20);                         // current_speed
    expect(values[3]).toBe(55);                         // free_flow_speed
    expect(values[4]).toBe(165);                        // current_travel_time
    expect(values[5]).toBe(60);                         // free_flow_travel_time
    expect(values[6]).toBe(0.7);                        // confidence
    expect(values[7]).toBe(0.636);                      // congestion_index
    expect(values[8]).toBe(true);                       // road_closure
  });
});
