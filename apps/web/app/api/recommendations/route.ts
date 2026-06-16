import { NextResponse } from 'next/server';
import { SEGMENT_IDS, SEGMENTS } from '@orr-pulse/shared';
import type { SegmentId } from '@orr-pulse/shared';
import { pool } from '@/lib/db';
import { computeRecommendations, getSegmentPositions } from '@/lib/recommendations';
import type { MedianCiRow } from '@/lib/recommendations';

export interface RecommendationsResponse {
  recommendations: Array<{
    dayOfWeek: number;
    dayName: string;
    best: { startHour: number; endHour: number; avgCongestionIndex: number };
    worst: { startHour: number; endHour: number; avgCongestionIndex: number };
  }>;
  from: SegmentId;
  to: SegmentId;
}

/**
 * Remap PostgreSQL EXTRACT(dow) (0=Sunday, 1=Monday...6=Saturday)
 * to our format (0=Monday, 1=Tuesday...6=Sunday).
 */
function remapDow(pgDow: number): number {
  return pgDow === 0 ? 6 : pgDow - 1;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');

    // Default to full corridor
    let fromId: SegmentId = 'silk-board';
    let toId: SegmentId = 'kr-puram';

    // Validate from/to params if provided
    if (fromParam !== null) {
      if (!SEGMENT_IDS.includes(fromParam as SegmentId)) {
        return NextResponse.json(
          { error: `Invalid 'from' segment: ${fromParam}`, code: 'INVALID_SEGMENT' },
          { status: 400 }
        );
      }
      fromId = fromParam as SegmentId;
    }

    if (toParam !== null) {
      if (!SEGMENT_IDS.includes(toParam as SegmentId)) {
        return NextResponse.json(
          { error: `Invalid 'to' segment: ${toParam}`, code: 'INVALID_SEGMENT' },
          { status: 400 }
        );
      }
      toId = toParam as SegmentId;
    }

    // Get positions for filtering
    const positions = getSegmentPositions(fromId, toId);
    if (!positions) {
      return NextResponse.json(
        { error: 'Unable to determine segment positions', code: 'INVALID_SEGMENT' },
        { status: 400 }
      );
    }

    const [fromPosition, toPosition] = positions;

    // Get segment IDs in range for the SQL query
    const segmentIdsInRange = SEGMENTS
      .filter((s) => s.position >= fromPosition && s.position <= toPosition)
      .map((s) => s.id);

    interface MedianRow {
      segment_id: string;
      day_of_week: string;
      hour: string;
      median_ci: string;
    }

    const { rows } = await pool.query<MedianRow>(
      `SELECT
        segment_id,
        EXTRACT(dow FROM bucket) AS day_of_week,
        EXTRACT(hour FROM bucket) AS hour,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY avg_ci) AS median_ci
      FROM hourly_segment_stats
      WHERE bucket >= NOW() - INTERVAL '4 weeks'
        AND segment_id = ANY($1)
      GROUP BY segment_id, day_of_week, hour`,
      [segmentIdsInRange]
    );

    // Transform DB rows to MedianCiRow format
    const medianData: MedianCiRow[] = rows.map((row) => ({
      segmentId: row.segment_id,
      dayOfWeek: remapDow(Number(row.day_of_week)),
      hour: Number(row.hour),
      medianCi: Number(row.median_ci),
    }));

    const recommendations = computeRecommendations(medianData, fromPosition, toPosition);

    const response: RecommendationsResponse = {
      recommendations,
      from: fromId,
      to: toId,
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Failed to fetch recommendations:', error);
    return NextResponse.json(
      { error: 'Service temporarily unavailable', code: 'DB_ERROR' },
      { status: 503 }
    );
  }
}
