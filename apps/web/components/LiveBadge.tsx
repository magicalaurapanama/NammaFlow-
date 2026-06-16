'use client';

interface LiveBadgeProps {
  lastUpdated: string | null;
}

export function LiveBadge({ lastUpdated }: LiveBadgeProps) {
  const formatTime = (iso: string): string => {
    try {
      const date = new Date(iso);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '--:--';
    }
  };

  return (
    <div className="badge bg-surface-overlay text-gray-300">
      <span className="pulse-dot" aria-hidden="true" />
      <span className="font-semibold text-accent-green">LIVE</span>
      {lastUpdated && (
        <span className="ml-1 text-gray-400">
          {formatTime(lastUpdated)}
        </span>
      )}
    </div>
  );
}
