import { cn } from '../../lib/utils';

interface NeonProgressProps {
  progress: number;
  className?: string;
  showLabel?: boolean;
}

export function NeonProgress({ progress, className, showLabel }: NeonProgressProps) {
  const clamped = Math.min(100, Math.max(0, progress));
  return (
    <div className={cn('space-y-1', className)}>
      <div className="neon-progress">
        <div
          className="neon-progress-bar"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-white/50 font-mono">{clamped.toFixed(1)}%</span>
      )}
    </div>
  );
}
