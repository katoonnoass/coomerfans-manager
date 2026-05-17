import { useModels } from '../../hooks/useModels';
import { ModelCard } from './ModelCard';
import { CardSkeleton } from '../ui/Shimmer';

interface ModelGridProps {
  service?: string;
  content?: string;
  sort?: string;
  q?: string;
  className?: string;
}

export function ModelGrid({ service, content, sort, q, className }: ModelGridProps) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useModels({ service, content, sort, q });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {data?.pages.map((page) =>
          page.data.map((model) => (
            <ModelCard key={model.id} model={model} />
          ))
        )}
      </div>

      {hasNextPage && (
        <div className="flex justify-center mt-8">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="neon-btn neon-btn-primary"
          >
            {isFetchingNextPage ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}

      {!data?.pages?.[0]?.data.length && (
        <div className="text-center py-20">
          <span className="text-6xl block mb-4 opacity-20">◈</span>
          <p className="text-white/40">No models found</p>
        </div>
      )}
    </div>
  );
}
