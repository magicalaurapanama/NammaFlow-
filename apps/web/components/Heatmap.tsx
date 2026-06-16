'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { getCongestionColor } from '@/lib/color';

interface HeatmapCell {
  dayOfWeek: number; // 0=Monday, 6=Sunday
  hour: number; // 0-23
  avgCongestionIndex: number;
}

interface HeatmapResponse {
  matrix: HeatmapCell[];
  days: number;
  generatedAt: string;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function SkeletonHeatmap() {
  return (
    <div className="card animate-pulse">
      <div className="mb-3 h-4 w-40 rounded bg-surface-overlay" />
      <div className="h-48 w-full rounded bg-surface-overlay" />
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

export function Heatmap() {
  const { data, error, isLoading } = useSWR<HeatmapResponse>(
    '/api/heatmap',
    fetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
  );

  const [tooltip, setTooltip] = useState<{
    day: string;
    hour: number;
    ci: number;
    x: number;
    y: number;
  } | null>(null);

  if (isLoading) return <SkeletonHeatmap />;
  if (error) return <ErrorState message="Unable to load heatmap data" />;
  if (!data || !data.matrix || data.matrix.length === 0) {
    return <ErrorState message="No heatmap data available" />;
  }

  // Build a lookup: [dayOfWeek][hour] -> avgCongestionIndex
  const grid: (number | null)[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => null)
  );

  for (const cell of data.matrix) {
    if (cell.dayOfWeek >= 0 && cell.dayOfWeek <= 6 && cell.hour >= 0 && cell.hour <= 23) {
      grid[cell.dayOfWeek][cell.hour] = cell.avgCongestionIndex;
    }
  }

  return (
    <div className="card">
      <h2 className="mb-3 text-sm font-semibold text-gray-300 uppercase tracking-wide">
        Weekly Congestion Heatmap
      </h2>
      <div className="overflow-x-auto -mx-4 px-4 relative">
        <div
          className="grid min-w-[640px]"
          style={{
            gridTemplateColumns: `48px repeat(24, 1fr)`,
            gridTemplateRows: `24px repeat(7, 32px)`,
            gap: '2px',
          }}
        >
          {/* Top-left empty corner */}
          <div />

          {/* Hour labels (top row) */}
          {Array.from({ length: 24 }, (_, h) => (
            <div
              key={`hour-${h}`}
              className="flex items-center justify-center text-[10px] text-gray-500"
            >
              {h}
            </div>
          ))}

          {/* Day rows */}
          {DAY_LABELS.map((dayLabel, dayIdx) => (
            <>
              {/* Day label */}
              <div
                key={`day-label-${dayIdx}`}
                className="flex items-center text-xs text-gray-400 pr-2"
              >
                {dayLabel}
              </div>

              {/* Hour cells for this day */}
              {Array.from({ length: 24 }, (_, h) => {
                const ci = grid[dayIdx][h];
                const bgColor = ci !== null ? getCongestionColor(ci) : undefined;

                return (
                  <div
                    key={`cell-${dayIdx}-${h}`}
                    className="rounded-sm cursor-pointer transition-opacity hover:opacity-80"
                    style={{
                      backgroundColor: bgColor ?? 'var(--tw-surface-overlay, #243447)',
                      minHeight: '100%',
                    }}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({
                        day: DAY_LABELS[dayIdx],
                        hour: h,
                        ci: ci ?? 0,
                        x: rect.left + rect.width / 2,
                        y: rect.top,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                    role="gridcell"
                    aria-label={`${DAY_LABELS[dayIdx]} ${h}:00-${h + 1}:00, CI: ${ci !== null ? ci.toFixed(2) : 'N/A'}`}
                  />
                );
              })}
            </>
          ))}
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="fixed z-50 pointer-events-none px-2.5 py-1.5 rounded bg-surface-overlay border border-surface-overlay text-xs text-gray-100 shadow-lg"
            style={{
              left: tooltip.x,
              top: tooltip.y - 40,
              transform: 'translateX(-50%)',
            }}
          >
            <span className="font-medium">{tooltip.day}</span>{' '}
            <span className="text-gray-400">
              {tooltip.hour}:00–{tooltip.hour + 1}:00
            </span>{' '}
            <span className="font-semibold">{tooltip.ci.toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
