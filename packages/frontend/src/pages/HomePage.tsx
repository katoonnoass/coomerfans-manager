import { GlassCard } from '../components/ui/GlassCard';
import { NeonButton } from '../components/ui/NeonButton';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { formatNumber, truncate } from '../lib/utils';
import { useEffect, useMemo, useState } from 'react';
import { useModels } from '../hooks/useModels';
import { Badge } from '../components/ui/Badge';

const PAGE_SIZE_OPTIONS = [12, 24, 48];

function fallbackThumb(model: any) {
  return `/api/models/${model.slug}/thumbnail`;
}

export function HomePage() {
  const navigate = useNavigate();
  const [content, setContent] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const { data: stats } = useQuery({
    queryKey: ['home-stats'],
    queryFn: async () => {
      const { data } = await api.get('/stats');
      return data.totals as { models: number; media: number; downloads: number };
    },
    staleTime: 60_000,
  });
  const {
    data: modelsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useModels({ content, sort: 'updated' });

  const models = useMemo(() => modelsData?.pages.flatMap((modelPage) => modelPage.data) || [], [modelsData]);
  const total = modelsData?.pages[0]?.total || models.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const neededItems = safePage * pageSize;
  const visibleModels = models.slice((safePage - 1) * pageSize, neededItems);

  useEffect(() => {
    setPage(1);
  }, [content]);

  useEffect(() => {
    if (models.length >= neededItems || !hasNextPage || isFetchingNextPage) return;
    fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, models.length, neededItems]);

  return (
    <div className="animate-slide-up">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-glass mb-12">
        <div className="absolute inset-0 bg-gradient-to-br from-neon-pink/10 via-neon-cyan/5 to-neon-orange/10" />
        <div className="relative p-12 md:p-20 text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-4">
            <span className="neon-text-pink">Premium</span>{' '}
            <span className="neon-text-cyan">Content</span>
          </h1>
          <p className="text-lg text-white/50 mb-2 max-w-lg mx-auto">
            Browse, search, and download content from your favorite creators
          </p>
          <p className="text-sm text-white/20 font-mono mb-8">
            OnlyFans · Fansly · Patreon
          </p>
          <div className="flex items-center justify-center gap-4">
            <NeonButton onClick={() => navigate('/browse')}>
              Browse Models
            </NeonButton>
            <NeonButton variant="ghost" onClick={() => navigate('/search')}>
              Search
            </NeonButton>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-4 mb-12">
        <GlassCard className="p-4 text-center">
          <p className="text-xl font-bold neon-text-cyan">{formatNumber(stats?.models ?? 0)}</p>
          <p className="text-xs text-white/40 font-mono">Models Indexed</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <p className="text-xl font-bold neon-text-pink">{formatNumber(stats?.media ?? 0)}</p>
          <p className="text-xs text-white/40 font-mono">Media Files</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <p className="text-xl font-bold neon-text-orange">{formatNumber(stats?.downloads ?? 0)}</p>
          <p className="text-xs text-white/40 font-mono">Parallel Downloads</p>
        </GlassCard>
      </div>

      {/* Trending */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h2 className="text-lg font-bold mb-1">
            <span className="neon-text-cyan">✦</span> Trending Models
          </h2>
          <p className="text-sm text-white/30 font-mono">Recently updated profiles</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            ['all', 'Todos'],
            ['WITH_POSTS', 'Com posts'],
            ['IMAGE', 'Fotos'],
            ['VIDEO', 'Vídeos'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setContent(value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                content === value
                  ? 'bg-glass-active text-white neon-text-cyan'
                  : 'text-white/40 hover:text-white hover:bg-glass-bg'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-2 rounded-xl text-xs font-mono ${viewMode === 'grid' ? 'bg-glass-active text-white neon-text-cyan' : 'text-white/40 hover:text-white hover:bg-glass-bg'}`}
          >
            Grade
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-2 rounded-xl text-xs font-mono ${viewMode === 'list' ? 'bg-glass-active text-white neon-text-cyan' : 'text-white/40 hover:text-white hover:bg-glass-bg'}`}
          >
            Lista
          </button>
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
            className="glass-input h-9 text-xs"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between text-xs text-white/40 font-mono">
        <span>{formatNumber(total)} modelos</span>
        <span>Página {safePage}/{totalPages}</span>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
          {Array.from({ length: 16 }).map((_, index) => (
            <div key={index} className="glass-card aspect-square animate-pulse bg-white/5" />
          ))}
        </div>
      ) : visibleModels.length === 0 ? (
        <div className="text-center py-20">
          <span className="text-6xl block mb-4 opacity-20">◈</span>
          <p className="text-white/40">No models found</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
          {visibleModels.map((model: any) => (
            <Link key={model.id} to={`/model/${model.slug}`} className="glass-card overflow-hidden hover:border-neon-cyan/40">
              <div className="aspect-square overflow-hidden">
                <img
                  src={fallbackThumb(model)}
                  alt={model.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                  onError={(event) => {
                    const img = event.currentTarget;
                    const fallback = fallbackThumb(model);
                    if (img.src.endsWith(fallback)) return;
                    img.src = fallback;
                  }}
                />
              </div>
              <div className="p-2">
                <div className="mb-1 truncate text-sm font-semibold">{model.name}</div>
                <div className="flex items-center justify-between gap-2 text-[10px] text-white/40 font-mono">
                  <span>{formatNumber(model.postCount)} posts</span>
                  <span>{formatNumber(model.mediaCount)} media</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleModels.map((model: any) => (
            <GlassCard key={model.id} className="p-3">
              <Link to={`/model/${model.slug}`} className="flex items-center gap-3 hover:text-neon-cyan">
                <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-glass-bg">
                  <img
                    src={fallbackThumb(model)}
                    alt={model.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                    onError={(event) => {
                      const img = event.currentTarget;
                      const fallback = fallbackThumb(model);
                      if (img.src.endsWith(fallback)) return;
                      img.src = fallback;
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{truncate(model.name, 52)}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/40 font-mono">
                    <Badge variant="cyan">{model.service}</Badge>
                    <span>{formatNumber(model.postCount)} posts</span>
                    <span>{formatNumber(model.mediaCount)} media</span>
                  </div>
                </div>
              </Link>
            </GlassCard>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={safePage === 1 || isFetchingNextPage}
            className="rounded-xl bg-glass-bg px-3 py-2 text-sm text-white/70 disabled:opacity-35"
          >
            Anterior
          </button>
          {Array.from({ length: Math.min(7, totalPages) }, (_, index) => {
            const start = Math.max(1, Math.min(safePage - 3, totalPages - 6));
            const pageNumber = start + index;
            return (
              <button
                key={pageNumber}
                onClick={() => setPage(pageNumber)}
                disabled={isFetchingNextPage}
                className={`h-10 min-w-10 rounded-xl px-3 text-sm font-mono ${pageNumber === safePage ? 'bg-glass-active text-white neon-text-cyan' : 'bg-glass-bg text-white/70'}`}
              >
                {pageNumber}
              </button>
            );
          })}
          <button
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={safePage === totalPages || isFetchingNextPage}
            className="rounded-xl bg-glass-bg px-3 py-2 text-sm text-white/70 disabled:opacity-35"
          >
            {isFetchingNextPage ? 'Carregando...' : 'Próxima'}
          </button>
        </div>
      )}
    </div>
  );
}
