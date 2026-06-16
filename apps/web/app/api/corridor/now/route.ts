import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { SEGMENTS, type SegmentId } from '@orr-pulse/shared';

export interface CorridorNowResponse {
  segments: Array<{
    id: SegmentId;
    name: string;
    currentSpeed: number;
    freeFlowSpeed: number;
    congestionIndex: number;
    currentTravelTime: number;
    freeFlowTravelTime: number;
    confidence: number;
    roadClosure: boolean;
    timestamp: string;
  }>;
  updatedAt: string;
}

const segmentNameMap = new Map(SEGMENTS.map((s) => [s.id, s.name]));

export async function GET() {
  try {
    interface TrafficRow {
      segment_id: string;
      current_speed: number;
      free_flow_speed: number;
      current_travel_time: number;
      free_flow_travel_time: number;
      confidence: number;
      congestion_index: number;
      road_closure: boolean;
      time: Date;
    }

    const { rows } = await pool.query<TrafficRow>(`
      SELECT DISTINCT ON (segment_id)
        segment_id, current_speed, free_flow_speed,
        current_travel_time, free_flow_travel_time,
        confidence, congestion_index, road_closure, time
      FROM traffic_readings
      ORDER BY segment_id, time DESC
    `);

    const segments = rows.map((row) => ({
      id: row.segment_id as SegmentId,
      name: segmentNameMap.get(row.segment_id as SegmentId) ?? row.segment_id,
      currentSpeed: row.current_speed,
      freeFlowSpeed: row.free_flow_speed,
      congestionIndex: row.congestion_index,
      currentTravelTime: row.current_travel_time,
      freeFlowTravelTime: row.free_flow_travel_time,
      confidence: row.confidence,
      roadClosure: row.road_closure,
      timestamp: row.time.toISOString(),
    }));

    const response: CorridorNowResponse = {
      segments,
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
      },
    });
  } catch (error) {
    console.error('Failed to fetch corridor data:', error);
    return NextResponse.json(
      { error: 'Service temporarily unavailable', code: 'DB_ERROR' },
      { status: 503 }
    );
  }
}
