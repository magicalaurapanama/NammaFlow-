import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { SEGMENT_IDS, type SegmentId } from '@orr-pulse/shared';

export interface SegmentHistoryResponse {
  segmentId: SegmentId;
  readings: Array<{
    time: string;
    currentSpeed: number;
    freeFlowSpeed: number;
    congestionIndex: number;
    currentTravelTime: number;
    freeFlowTravelTime: number;
    confidence: number;
    roadClosure: boolean;
  }>;
  hours: number;
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const segmentId = params.id;

  if (!SEGMENT_IDS.includes(segmentId as SegmentId)) {
    return NextResponse.json(
      { error: 'Segment not found', code: 'INVALID_SEGMENT' },
      { status: 404 }
    );
  }

  const url = new URL(request.url);
  const hours = Number(url.searchParams.get('hours') ?? 48);

  try {
    interface HistoryRow {
      time: Date;
      current_speed: number;
      free_flow_speed: number;
      congestion_index: number;
      current_travel_time: number;
      free_flow_travel_time: number;
      confidence: number;
      road_closure: boolean;
    }

    const { rows } = await pool.query<HistoryRow>(
      `SELECT time, current_speed, free_flow_speed, congestion_index,
              current_travel_time, free_flow_travel_time, confidence, road_closure
       FROM traffic_readings
       WHERE segment_id = $1 AND time >= NOW() - INTERVAL '1 hour' * $2
       ORDER BY time ASC`,
      [segmentId, hours]
    );

    const readings = rows.map((row) => ({
      time: row.time.toISOString(),
      currentSpeed: row.current_speed,
      freeFlowSpeed: row.free_flow_speed,
      congestionIndex: row.congestion_index,
      currentTravelTime: row.current_travel_time,
      freeFlowTravelTime: row.free_flow_travel_time,
      confidence: row.confidence,
      roadClosure: row.road_closure,
    }));

    const response: SegmentHistoryResponse = {
      segmentId: segmentId as SegmentId,
      readings,
      hours,
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error('Failed to fetch segment history:', error);
    return NextResponse.json(
      { error: 'Service temporarily unavailable', code: 'DB_ERROR' },
      { status: 503 }
    );
  }
}
