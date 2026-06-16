'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { SEGMENTS } from '@orr-pulse/shared';

interface SegmentReading {
  time: string;
  congestionIndex: number;
}

interface SegmentHistoryResponse {
  segmentId: string;
  readings: SegmentReading[];
  hours: number;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const SEGMENT_COLORS = [
  '#22c55e', // green
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#ef4444', // red
  '#a855f7', // purple
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
];

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function SkeletonChart() {
  return (
    <div className="card animate-pulse">
      <div className="mb-3 h-4 w-40 rounded bg-surface-overlay" />
      <div className="h-64 w-full rounded bg-surface-overlay" />
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

function SegmentToggle({
  segment,
  color,
  active,
  onToggle,
}: {
  segment: { id: string; name: string };
  color: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-opacity ${
        active ? 'opacity-100' : 'opacity-40'
      }`}
      style={{ borderColor: color, border: '1px solid' }}
    >
      <span
        className="w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: active ? color : 'transparent', border: `1px solid ${color}` }}
      />
      <span className="text-gray-300">{segment.name}</span>
    </button>
  );
}

export function SegmentTrend() {
  const [activeSegments, setActiveSegments] = useState<Set<string>>(
    () => new Set(SEGMENTS.slice(0, 3).map((s) => s.id))
  );

  const toggleSegment = (id: string) => {
    setActiveSegments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Fetch history for each active segment
  const activeIds = Array.from(activeSegments);

  return (
    <div className="card">
      <h2 className="mb-3 text-sm font-semibold text-gray-300 uppercase tracking-wide">
        Segment Trends (48h)
      </h2>

      {/* Segment toggles */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {SEGMENTS.map((seg, i) => (
          <SegmentToggle
            key={seg.id}
            segment={seg}
            color={SEGMENT_COLORS[i]}
            active={activeSegments.has(seg.id)}
            onToggle={() => toggleSegment(seg.id)}
          />
        ))}
      </div>

      {activeIds.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-gray-500 text-sm">
          Select at least one segment to view trends
        </div>
      ) : (
        <SegmentTrendChart activeIds={activeIds} />
      )}
    </div>
  );
}

function SegmentTrendChart({ activeIds }: { activeIds: string[] }) {
  // Fetch all active segments in parallel using SWR
  const results = activeIds.map((id) => ({
    id,
    // eslint-disable-next-line react-hooks/rules-of-hooks
    ...useSWR<SegmentHistoryResponse>(
      `/api/segments/${id}/history?hours=48`,
      fetcher,
      { refreshInterval: 300000, revalidateOnFocus: false }
    ),
  }));

  const isLoading = results.some((r) => r.isLoading);
  const hasError = results.some((r) => r.error);

  if (isLoading) {
    return <div className="h-64 rounded bg-surface-overlay animate-pulse" />;
  }

  if (hasError) {
    return <ErrorState message="Unable to load segment history" />;
  }

  // Merge all readings into a unified time series
  const timeMap = new Map<string, Record<string, number>>();

  for (const result of results) {
    if (!result.data?.readings) continue;
    const segId = result.id;
    for (const reading of result.data.readings) {
      const existing = timeMap.get(reading.time) ?? {};
      existing[segId] = reading.congestionIndex;
      timeMap.set(reading.time, existing);
    }
  }

  // Sort by time and build chart data
  const chartData = Array.from(timeMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, values]) => ({
      time,
      displayTime: formatTime(time),
      ...values,
    }));

  if (chartData.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-500 text-sm">
        No data available for selected segments
      </div>
    );
  }

  return (
    <div className="h-64">
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
                return new Date(payload[0].payload.time).toLocaleString();
              }
              return '';
            }}
          />
          <Legend wrapperStyle={{ fontSize: '11px', color: '#9ca3af' }} />
          {activeIds.map((id) => {
            const segIdx = SEGMENTS.findIndex((s) => s.id === id);
            const seg = SEGMENTS[segIdx];
            return (
              <Line
                key={id}
                type="monotone"
                dataKey={id}
                name={seg?.name ?? id}
                stroke={SEGMENT_COLORS[segIdx] ?? '#6b7280'}
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
