import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export interface HeatmapResponse {
  matrix: Array<{
    dayOfWeek: number; // 0=Monday, 6=Sunday
    hour: number; // 0–23
    avgCongestionIndex: number;
  }>;
  days: number;
  generatedAt: string;
}

/**
 * Remap PostgreSQL EXTRACT(dow) (0=Sunday, 1=Monday...6=Saturday)
 * to our format (0=Monday, 1=Tuesday...6=Sunday).
 */
function remapDow(pgDow: number): number {
  // PG: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  // Ours: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
  return pgDow === 0 ? 6 : pgDow - 1;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const daysParam = url.searchParams.get('days');
    const days = daysParam ? Math.max(1, Math.floor(Number(daysParam))) || 7 : 7;

    interface HeatmapRow {
      day_of_week: string;
      hour: string;
      avg_congestion_index: string;
    }

    const { rows } = await pool.query<HeatmapRow>(
      `SELECT
        EXTRACT(dow FROM bucket) AS day_of_week,
        EXTRACT(hour FROM bucket) AS hour,
        AVG(avg_ci) AS avg_congestion_index
      FROM hourly_segment_stats
      WHERE bucket >= NOW() - INTERVAL '1 day' * $1
      GROUP BY day_of_week, hour
      ORDER BY day_of_week, hour`,
      [days]
    );

    const matrix = rows.map((row) => ({
      dayOfWeek: remapDow(Number(row.day_of_week)),
      hour: Number(row.hour),
      avgCongestionIndex: Number(Number(row.avg_congestion_index).toFixed(4)),
    }));

    const response: HeatmapResponse = {
      matrix,
      days,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Failed to fetch heatmap data:', error);
    return NextResponse.json(
      { error: 'Service temporarily unavailable', code: 'DB_ERROR' },
      { status: 503 }
    );
  }
}
