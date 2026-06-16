import type { TrafficReading } from '@orr-pulse/shared';
import { pool } from './db.js';
import { logger } from './logger.js';

/**
 * Batch-inserts traffic readings into the traffic_readings hypertable.
 * Uses a multi-row INSERT with parameterized queries for safety and performance.
 * Returns the number of rows inserted.
 */
export async function batchInsert(readings: TrafficReading[]): Promise<number> {
  if (readings.length === 0) {
    return 0;
  }

  const columns = [
    'time',
    'segment_id',
    'current_speed',
    'free_flow_speed',
    'current_travel_time',
    'free_flow_travel_time',
    'confidence',
    'congestion_index',
    'road_closure',
  ];

  const values: unknown[] = [];
  const rowPlaceholders: string[] = [];

  for (let i = 0; i < readings.length; i++) {
    const r = readings[i];
    const offset = i * 9;
    rowPlaceholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`,
    );
    values.push(
      r.time,
      r.segmentId,
      r.currentSpeed,
      r.freeFlowSpeed,
      r.currentTravelTime,
      r.freeFlowTravelTime,
      r.confidence,
      r.congestionIndex,
      r.roadClosure,
    );
  }

  const sql = `INSERT INTO traffic_readings (${columns.join(', ')}) VALUES ${rowPlaceholders.join(', ')}`;

  const result = await pool.query(sql, values);

  logger.info({ rowCount: result.rowCount }, 'Batch insert completed');

  return result.rowCount ?? readings.length;
}
