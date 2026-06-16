'use client';

import useSWR from 'swr';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface SegmentReading {
  time: string;
  currentSpeed: number;
  freeFlowSpeed: number;
  congestionIndex: number;
  currentTravelTime: number;
  freeFlowTravelTime: number;
  confidence: number;
  roadClosure: boolean;
}

interface SegmentHistoryResponse {
  segmentId: string;
  readings: SegmentReading[];
  hours: number;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatFullTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function SkeletonChart() {
  return (
    <div className="card animate-pulse">
      <div className="mb-3 h-4 w-48 rounded bg-surface-overlay" />
      <div className="h-72 w-full rounded bg-surface-overlay" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="card border-accent-red/30">
      <p className="text-sm text-gray-400">
        <span className="text-accent-red font-medium">Error:</span> {message}
      </p>
    </div>
  );
}

export function SegmentHistoryChart({ segmentId }: { segmentId: string }) {
  const { data, error, isLoading } = useSWR<SegmentHistoryResponse>(
    `/api/segments/${segmentId}/history?hours=48`,
    fetcher,
    { refreshInterval: 300000, revalidateOnFocus: false }
  );

  if (isLoading) return <SkeletonChart />;
  if (error) return <ErrorState message="Unable to load segment history" />;
  if (!data || !data.readings || data.readings.length === 0) {
    return (
      <div className="card">
        <h2 className="mb-3 text-sm font-semibold text-gray-300 uppercase tracking-wide">
          48-Hour History
        </h2>
        <div className="h-72 flex items-center justify-center text-gray-500 text-sm">
          No data available for this segment
        </div>
      </div>
    );
  }

  const chartData = data.readings.map((r) => ({
    time: r.time,
    displayTime: formatTime(r.time),
    ci: r.congestionIndex,
  }));

  return (
    <div className="card">
      <h2 className="mb-3 text-sm font-semibold text-gray-300 uppercase tracking-wide">
        48-Hour History
      </h2>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#243447" />
            <XAxis
              dataKey="displayTime"
              stroke="#6b7280"
              fontSize={10}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, 1]}
              stroke="#6b7280"
              fontSize={10}
              tickLine={false}
              tickFormatter={(v: number) => v.toFixed(1)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1a2332',
                border: '1px solid #243447',
                borderRadius: '6px',
                fontSize: '12px',
              }}
              labelStyle={{ color: '#9ca3af' }}
              labelFormatter={(_, payload) => {
                if (payload?.[0]?.payload?.time) {
                  return formatFullTime(payload[0].payload.time);
                }
                return '';
              }}
              formatter={(value: number) => [value.toFixed(3), 'Congestion Index']}
            />
            <Line
              type="monotone"
              dataKey="ci"
              name="Congestion Index"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
