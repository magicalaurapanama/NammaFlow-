'use client';

import useSWR from 'swr';

interface CommuteWindow {
  startHour: number;
  endHour: number;
  avgCongestionIndex: number;
}

interface RecommendationsResponse {
  recommendations: Array<{
    dayOfWeek: number;
    dayName: string;
    best: CommuteWindow;
    worst: CommuteWindow;
  }>;
  from: string;
  to: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function formatHour(hour: number): string {
  if (hour === 0) return '12:00 AM';
  if (hour === 12) return '12:00 PM';
  if (hour < 12) return `${hour}:00 AM`;
  return `${hour - 12}:00 PM`;
}

function formatWindow(window: CommuteWindow): string {
  return `${formatHour(window.startHour)}–${formatHour(window.endHour)}`;
}

function getTodayDayOfWeek(): number {
  // JS getDay(): 0=Sunday, 1=Monday...6=Saturday
  // Our format: 0=Monday, 1=Tuesday...6=Sunday
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function SkeletonCard() {
  return (
    <div className="card animate-pulse">
      <div className="mb-3 h-4 w-48 rounded bg-surface-overlay" />
      <div className="space-y-3">
        <div className="h-12 w-full rounded bg-surface-overlay" />
        <div className="h-12 w-full rounded bg-surface-overlay" />
      </div>
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

export function BestWindowCard() {
  const { data, error, isLoading } = useSWR<RecommendationsResponse>(
    '/api/recommendations',
    fetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
  );

  if (isLoading) return <SkeletonCard />;
  if (error) return <ErrorState message="Unable to load recommendations" />;
  if (!data || !data.recommendations || data.recommendations.length === 0) {
    return <ErrorState message="No recommendation data available" />;
  }

  const todayDow = getTodayDayOfWeek();
  const todayRec = data.recommendations.find((r) => r.dayOfWeek === todayDow);

  if (!todayRec) {
    return <ErrorState message="No recommendation for today" />;
  }

  return (
    <div className="card">
      <h2 className="mb-3 text-sm font-semibold text-gray-300 uppercase tracking-wide">
        Today&apos;s Commute ({todayRec.dayName})
      </h2>

      <div className="space-y-3">
        {/* Best window */}
        <div className="flex items-center gap-3 rounded-md bg-accent-green/10 border border-accent-green/30 px-3 py-2.5">
          <div className="flex-shrink-0 w-2 h-2 rounded-full bg-accent-green" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 mb-0.5">Best window</p>
            <p className="text-sm font-semibold text-gray-100">
              {formatWindow(todayRec.best)}
            </p>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-xs text-gray-400">Avg CI</p>
            <p className="text-sm font-semibold text-accent-green">
              {todayRec.best.avgCongestionIndex.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Worst window */}
        <div className="flex items-center gap-3 rounded-md bg-accent-red/10 border border-accent-red/30 px-3 py-2.5">
          <div className="flex-shrink-0 w-2 h-2 rounded-full bg-accent-red" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 mb-0.5">Avoid</p>
            <p className="text-sm font-semibold text-gray-100">
              {formatWindow(todayRec.worst)}
            </p>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-xs text-gray-400">Avg CI</p>
            <p className="text-sm font-semibold text-accent-red">
              {todayRec.worst.avgCongestionIndex.toFixed(2)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
