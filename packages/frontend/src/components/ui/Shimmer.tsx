export function Shimmer() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-48 bg-glass-bg rounded-glass" />
      <div className="space-y-2">
        <div className="h-4 bg-glass-bg rounded w-3/4" />
        <div className="h-3 bg-glass-bg rounded w-1/2" />
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="glass-card p-4 animate-pulse">
      <div className="aspect-[3/4] bg-glass-bg rounded-lg mb-3" />
      <div className="h-4 bg-glass-bg rounded w-3/4 mb-2" />
      <div className="h-3 bg-glass-bg rounded w-1/2" />
    </div>
  );
}
