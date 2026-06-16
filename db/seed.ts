/**
 * Seed script for synthetic traffic data
 * Generates 14 days of readings at 15-minute intervals for all 10 ORR segments.
 *
 * Congestion patterns:
 * - Morning peak (8–10 AM): CI 0.6–0.9
 * - Evening peak (5–7 PM): CI 0.5–0.8
 * - Off-peak: CI 0.1–0.3
 * - Weekends: 30% lower CI
 * - Random noise: ±0.05
 * - Downstream segments slightly more congested during peaks
 *
 * Requirements: 14.4
 */

import { Pool } from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/orr_pulse';

const SEGMENT_IDS = [
  'silk-board',
  'hsr',
  'ibblur',
  'bellandur',
  'ecospace',
  'kadubeesanahalli',
  'marathahalli',
  'doddanekundi',
  'mahadevapura',
  'kr-puram',
] as const;

const BATCH_SIZE = 1000;
const DAYS = 14;
const INTERVALS_PER_DAY = 96; // 24h * 4 (every 15 min)

interface Reading {
  time: Date;
  segmentId: string;
  currentSpeed: number;
  freeFlowSpeed: number;
  currentTravelTime: number;
  freeFlowTravelTime: number;
  confidence: number;
  congestionIndex: number;
  roadClosure: boolean;
}

/**
 * Get the base congestion index for a given hour based on time-of-day pattern.
 */
function getBaseCongestionIndex(hour: number): { min: number; max: number } {
  if (hour >= 8 && hour < 10) {
    // Morning peak
    return { min: 0.6, max: 0.9 };
  } else if (hour >= 17 && hour < 19) {
    // Evening peak
    return { min: 0.5, max: 0.8 };
  } else {
    // Off-peak
    return { min: 0.1, max: 0.3 };
  }
}

/**
 * Determine if a given date falls on a weekend (Saturday=6, Sunday=0).
 */
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Generate a random number within [min, max].
 */
function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Clamp a value between min and max.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Generate a single reading for a segment at a given time.
 */
function generateReading(time: Date, segmentId: string, segmentPosition: number): Reading {
  const hour = time.getHours();
  const { min, max } = getBaseCongestionIndex(hour);

  // Base CI randomly within the range
  let ci = randomInRange(min, max);

  // Weekend reduction: 30% lower
  if (isWeekend(time)) {
    ci *= 0.7;
  }

  // Downstream segments more congested during peaks
  const isPeak = (hour >= 8 && hour < 10) || (hour >= 17 && hour < 19);
  if (isPeak) {
    // Add up to 0.05 extra CI for downstream segments (position 0-9)
    ci += (segmentPosition / 9) * 0.05;
  }

  // Random noise ±0.05
  ci += randomInRange(-0.05, 0.05);

  // Clamp CI to [0, 1]
  ci = clamp(ci, 0, 1);

  // Derive speeds from CI
  const freeFlowSpeed = randomInRange(60, 80); // km/h
  const currentSpeed = freeFlowSpeed * (1 - ci);

  // Derive travel times (assume segment length ~2-3 km)
  const segmentLength = randomInRange(2, 3); // km
  const freeFlowTravelTime = (segmentLength / freeFlowSpeed) * 3600; // seconds
  const currentTravelTime = ci < 1 ? (segmentLength / currentSpeed) * 3600 : freeFlowTravelTime * 10; // seconds

  // Confidence: random between 0.5 and 1.0 (only high-confidence readings)
  const confidence = randomInRange(0.5, 1.0);

  return {
    time,
    segmentId,
    currentSpeed: Math.round(currentSpeed * 100) / 100,
    freeFlowSpeed: Math.round(freeFlowSpeed * 100) / 100,
    currentTravelTime: Math.round(currentTravelTime * 100) / 100,
    freeFlowTravelTime: Math.round(freeFlowTravelTime * 100) / 100,
    confidence: Math.round(confidence * 1000) / 1000,
    congestionIndex: Math.round(ci * 1000) / 1000,
    roadClosure: false,
  };
}

/**
 * Build a batched INSERT query for multiple readings.
 */
function buildInsertQuery(readings: Reading[]): { text: string; values: unknown[] } {
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
  const placeholders: string[] = [];

  for (let i = 0; i < readings.length; i++) {
    const r = readings[i];
    const offset = i * 9;
    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`
    );
    values.push(
      r.time.toISOString(),
      r.segmentId,
      r.currentSpeed,
      r.freeFlowSpeed,
      r.currentTravelTime,
      r.freeFlowTravelTime,
      r.confidence,
      r.congestionIndex,
      r.roadClosure
    );
  }

  const text = `INSERT INTO traffic_readings (${columns.join(', ')}) VALUES ${placeholders.join(', ')}`;
  return { text, values };
}

async function seed(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });

  console.log('🌱 Starting seed: generating 14 days of synthetic traffic data...');
  console.log(`   Database: ${DATABASE_URL.replace(/\/\/.*@/, '//***@')}`);

  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - DAYS);
  startDate.setHours(0, 0, 0, 0);

  let totalInserted = 0;
  let batch: Reading[] = [];

  for (let day = 0; day < DAYS; day++) {
    const dayDate = new Date(startDate);
    dayDate.setDate(dayDate.getDate() + day);

    for (let interval = 0; interval < INTERVALS_PER_DAY; interval++) {
      const time = new Date(dayDate);
      time.setMinutes(time.getMinutes() + interval * 15);

      for (let segIdx = 0; segIdx < SEGMENT_IDS.length; segIdx++) {
        const reading = generateReading(time, SEGMENT_IDS[segIdx], segIdx);
        batch.push(reading);

        if (batch.length >= BATCH_SIZE) {
          const query = buildInsertQuery(batch);
          await pool.query(query.text, query.values);
          totalInserted += batch.length;
          batch = [];

          if (totalInserted % 5000 === 0) {
            console.log(`   Inserted ${totalInserted} readings...`);
          }
        }
      }
    }
  }

  // Insert remaining batch
  if (batch.length > 0) {
    const query = buildInsertQuery(batch);
    await pool.query(query.text, query.values);
    totalInserted += batch.length;
  }

  console.log(`✅ Inserted ${totalInserted} readings total.`);

  // Refresh the continuous aggregate
  console.log('🔄 Refreshing continuous aggregate (hourly_segment_stats)...');
  await pool.query(`CALL refresh_continuous_aggregate('hourly_segment_stats', NULL, NULL);`);
  console.log('✅ Continuous aggregate refreshed.');

  await pool.end();
  console.log('🎉 Seed complete!');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
