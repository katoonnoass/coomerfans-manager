import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFavorites } from '../../hooks/useAuth';
import { GlassCard } from '../ui/GlassCard';
import { NeonButton } from '../ui/NeonButton';
import { Badge } from '../ui/Badge';
import { formatNumber, truncate } from '../../lib/utils';

const PAGE_SIZE_OPTIONS = [12, 24, 48];
const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Todos' },
  { value: 'PENDING', label: 'Pendente' },
  { value: 'IN_PROGRESS', label: 'Andamento' },
  { value: 'COMPLETED_WAITING_UPDATES', label: 'Finalizado/aguardando' },
];

function fallbackThumb(model: any) {
  return `/api/models/${model.slug}/thumbnail`;
}

function profileGroupKey(model: any) {
  return String(model.name || model.slug || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function FavoritesGrid() {
  const { favorites, removeFavorite, updateFavoriteDownloadStatus, isUpdatingFavoriteStatus } = useFavorites();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [groupProfiles, setGroupProfiles] = useState(true);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);

  const filteredFavorites = useMemo(() => {
    const term = search.trim().toLowerCase();
    return favorites.filter((model: any) =>
      (statusFilter === 'ALL' || model.favoriteDownloadStatus === statusFilter)
      && (
        !term
        || model.name?.toLowerCase().includes(term)
        || model.service?.toLowerCase().includes(term)
        || model.slug?.toLowerCase().includes(term)
      )
    );
  }, [favorites, search, statusFilter]);

  const groupedFavorites = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const model of filteredFavorites) {
      const key = profileGroupKey(model) || model.id;
      groups.set(key, [...(groups.get(key) || []), model]);
    }
    return Array.from(groups.entries()).map(([key, models]) => ({
      key,
      name: models[0]?.name || key,
      models: models.sort((a, b) => String(a.service).localeCompare(String(b.service))),
      postCount: models.reduce((sum, model) => sum + (model.postCount || 0), 0),
      mediaCount: models.reduce((sum, model) => sum + (model.mediaCount || 0), 0),
      services: Array.from(new Set(models.map((model) => model.service).filter(Boolean))),
    }));
  }, [filteredFavorites]);

  const pagedItems = groupProfiles ? groupedFavorites : filteredFavorites;
  const totalPages = Math.max(1, Math.ceil(pagedItems.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleItems = pagedItems.slice((safePage - 1) * pageSize, safePage * pageSize);

  const runSearch = () => {
    setSearch(searchDraft);
    setPage(1);
  };

  const clearSearch = () => {
    setSearchDraft('');
    setSearch('');
    setPage(1);
  };

  if (favorites.length === 0) {
    return (
      <div className="max-w-3xl mx-auto">
        <GlassCard className="p-12 text-center animate-slide-up">
          <span className="text-6xl block mb-4 opacity-20">♥</span>
          <p className="text-white/40">No favorites yet</p>
          <p className="text-xs text-white/20 font-mono mt-1">
            Click the heart icon on any model to add them here
          </p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="animate-slide-up">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 gap-2">
          <input
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') runSearch();
            }}
            placeholder="Buscar favorito"
            className="glass-input min-w-0 flex-1 text-sm"
          />
          <NeonButton type="button" className="px-4 py-2 text-sm" onClick={runSearch}>
            Buscar
          </NeonButton>
          {search && (
            <NeonButton type="button" variant="ghost" className="px-3 py-2 text-sm" onClick={clearSearch}>
              Limpar
            </NeonButton>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setGroupProfiles((current) => !current);
              setPage(1);
            }}
            className={`h-9 rounded-lg px-3 text-xs font-mono ${groupProfiles ? 'bg-glass-active text-white neon-text-cyan' : 'bg-glass-bg text-white/50'}`}
          >
            Agrupar
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`h-9 rounded-lg px-3 text-xs font-mono ${viewMode === 'grid' ? 'bg-glass-active text-white neon-text-cyan' : 'bg-glass-bg text-white/50'}`}
          >
            Grade
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`h-9 rounded-lg px-3 text-xs font-mono ${viewMode === 'list' ? 'bg-glass-active text-white neon-text-cyan' : 'bg-glass-bg text-white/50'}`}
          >
            Lista
          </button>
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
            className="glass-input h-9 text-xs"
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status.value} value={status.value}>{status.label}</option>
            ))}
          </select>
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
        <span>{filteredFavorites.length} perfis{groupProfiles ? ` · ${groupedFavorites.length} grupos` : ''}</span>
        <span>Página {safePage}/{totalPages}</span>
      </div>

      {visibleItems.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <p className="text-white/40">Nenhum favorito encontrado</p>
        </GlassCard>
      ) : groupProfiles ? (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3' : 'space-y-2'}>
          {visibleItems.map((group: any) => (
            <GlassCard key={group.key} className="p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{truncate(group.name, 48)}</p>
                  <p className="text-xs text-white/40 font-mono">
                    {group.models.length} perfis · {formatNumber(group.postCount)} posts · {formatNumber(group.mediaCount)} media
                  </p>
                </div>
                <div className="flex -space-x-2">
                  {group.models.slice(0, 3).map((model: any) => (
                    <img
                      key={model.id}
                      src={fallbackThumb(model)}
                      alt={model.name}
                      className="h-10 w-10 rounded-lg border border-void-900 object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                {group.models.map((model: any) => (
                  <div key={model.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/15 p-2">
                    <Link to={`/model/${model.slug}`} className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg bg-glass-bg">
                      <img src={fallbackThumb(model)} alt={model.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                    </Link>
                    <Link to={`/model/${model.slug}`} className="min-w-0 flex-1 hover:text-neon-cyan">
                      <div className="truncate text-sm font-medium">{model.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-white/40 font-mono">
                        <Badge variant="cyan">{model.service}</Badge>
                        <span>{formatNumber(model.mediaCount)} media</span>
                      </div>
                    </Link>
                    <select
                      value={model.favoriteDownloadStatus || 'PENDING'}
                      disabled={isUpdatingFavoriteStatus}
                      onChange={(event) => updateFavoriteDownloadStatus({ modelId: model.id, status: event.target.value })}
                      className="max-w-36 rounded-md border border-white/10 bg-void-900 px-2 py-2 text-[11px] text-white/70"
                    >
                      {STATUS_OPTIONS.filter((status) => status.value !== 'ALL').map((status) => (
                        <option key={status.value} value={status.value}>{status.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </GlassCard>
          ))}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
          {visibleItems.map((model: any) => (
            <div key={model.id} className="glass-card overflow-hidden hover:border-neon-cyan/40">
              <Link to={`/model/${model.slug}`} className="block aspect-square overflow-hidden">
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
              </Link>
              <div className="p-2">
                <Link to={`/model/${model.slug}`} className="mb-1 block truncate text-sm font-semibold hover:text-neon-cyan">
                  {model.name}
                </Link>
                <div className="flex items-center justify-between gap-2 text-[10px] text-white/40 font-mono">
                  <span>{formatNumber(model.postCount)} posts</span>
                  <span>{formatNumber(model.mediaCount)} media</span>
                </div>
                <select
                  value={model.favoriteDownloadStatus || 'PENDING'}
                  disabled={isUpdatingFavoriteStatus}
                  onChange={(event) => updateFavoriteDownloadStatus({ modelId: model.id, status: event.target.value })}
                  className="mt-2 w-full rounded-md border border-white/10 bg-void-900 px-2 py-1 text-[10px] text-white/70"
                >
                  {STATUS_OPTIONS.filter((status) => status.value !== 'ALL').map((status) => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleItems.map((model: any) => (
            <GlassCard key={model.id} className="p-3">
              <div className="flex items-center gap-3">
                <Link to={`/model/${model.slug}`} className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-glass-bg">
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
                </Link>
                <Link to={`/model/${model.slug}`} className="min-w-0 flex-1 hover:text-neon-cyan">
                  <div className="truncate font-semibold">{truncate(model.name, 52)}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/40 font-mono">
                    <Badge variant="cyan">{model.service}</Badge>
                    <span>{formatNumber(model.postCount)} posts</span>
                    <span>{formatNumber(model.mediaCount)} media</span>
                  </div>
                </Link>
                <select
                  value={model.favoriteDownloadStatus || 'PENDING'}
                  disabled={isUpdatingFavoriteStatus}
                  onChange={(event) => updateFavoriteDownloadStatus({ modelId: model.id, status: event.target.value })}
                  className="rounded-md border border-white/10 bg-void-900 px-2 py-2 text-xs text-white/70"
                >
                  {STATUS_OPTIONS.filter((status) => status.value !== 'ALL').map((status) => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>
                <NeonButton
                  type="button"
                  variant="ghost"
                  className="px-3 py-2 text-xs text-neon-pink"
                  onClick={() => removeFavorite(model.id)}
                >
                  Remover
                </NeonButton>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={safePage === 1}
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
                className={`h-10 min-w-10 rounded-xl px-3 text-sm font-mono ${pageNumber === safePage ? 'bg-glass-active text-white neon-text-cyan' : 'bg-glass-bg text-white/70'}`}
              >
                {pageNumber}
              </button>
            );
          })}
          <button
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={safePage === totalPages}
            className="rounded-xl bg-glass-bg px-3 py-2 text-sm text-white/70 disabled:opacity-35"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
