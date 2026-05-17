import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { VirtuosoGrid } from 'react-virtuoso';
import {
  fetchModelPosts,
  MODEL_POSTS_PAGE_SIZE,
  modelPostsQueryKey,
  useFilteredModelPosts,
  useModel,
  useRefreshModelPosts,
} from '../../hooks/useModels';
import { useFavorites, useDownloads } from '../../hooks/useAuth';
import { useToastStore } from '../../stores/toast.store';
import { GlassCard } from '../ui/GlassCard';
import { NeonButton } from '../ui/NeonButton';
import { Badge } from '../ui/Badge';
import { Shimmer } from '../ui/Shimmer';
import { ImageLightbox } from '../gallery/ImageLightbox';
import { DownloadOptionsModal, type DownloadOptions } from '../downloads/DownloadOptionsModal';
import { formatNumber, formatDate } from '../../lib/utils';
import { queryClient } from '../../config/query-client';
import { queryKeys } from '../../lib/query-keys';
import api from '../../lib/api';
import { getSocket } from '../../config/socket';

function formatVideoDuration(seconds?: number | null) {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null;
  const totalSeconds = Math.max(1, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function ModelDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: model, isLoading } = useModel(slug!);
  const [page, setPage] = useState(1);
  const [mediaType, setMediaType] = useState<'all' | 'IMAGE' | 'VIDEO' | 'GIF'>('all');
  const [downloadedFilter, setDownloadedFilter] = useState<'all' | 'downloaded' | 'pending'>('all');
  const [sortMedia, setSortMedia] = useState<'date' | 'type' | 'size'>('date');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [isSelectingCategory, setIsSelectingCategory] = useState(false);
  const [refreshMode, setRefreshMode] = useState<'FAST' | 'FULL'>('FAST');
  const [refreshProgress, setRefreshProgress] = useState<{
    active: boolean;
    current: number;
    max: number;
    checked: number;
    posts: number;
    media: number;
    postCount: number;
    mediaCount: number;
    status?: 'running' | 'completed' | 'failed';
    done: boolean;
    error?: string;
    mode?: 'FAST' | 'FULL';
    pageLogs?: Array<{
      page: number;
      ms: number;
      postsImported: number;
      mediaImported: number;
      status: 'ok' | 'skipped' | 'failed';
      error?: string;
    }>;
  } | null>(null);
  const { data: postsData, isFetching: isFetchingPosts, isLoading: isLoadingPosts } = useFilteredModelPosts(slug!, page, mediaType);
  const refreshProfile = useRefreshModelPosts(slug!);
  const { isFavorited, addFavorite, removeFavorite } = useFavorites();
  const { createDownload, createModelDownload, isCreating } = useDownloads();
  const addToast = useToastStore((s) => s.addToast);
  const { data: settings } = useQuery({
    queryKey: queryKeys.settings.get(),
    queryFn: async () => (await api.get('/settings')).data,
  });

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const allMedia = useMemo(() => {
    if (!postsData?.data) return [];
    const media = postsData.data.flatMap((post) =>
      post.media.map((m) => ({
        url: m.url,
        type: (m.type === 'VIDEO' ? 'VIDEO' : 'IMAGE') as 'IMAGE' | 'VIDEO',
        mediaType: m.type,
        title: post.title || undefined,
        id: m.id,
        duration: m.duration,
        isDownloaded: m.isDownloaded,
        fileSize: m.fileSize || 0,
        createdAt: m.createdAt,
      }))
    );
    return media
      .filter((m) => downloadedFilter === 'all' || (downloadedFilter === 'downloaded' ? m.isDownloaded : !m.isDownloaded))
      .sort((a, b) => {
        if (sortMedia === 'type') return String(a.mediaType).localeCompare(String(b.mediaType));
        if (sortMedia === 'size') return (b.fileSize || 0) - (a.fileSize || 0);
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [postsData, downloadedFilter, sortMedia]);

  const selectedCount = selectedMediaIds.length;
  const totalPages = Math.max(1, Math.ceil((postsData?.total || 0) / MODEL_POSTS_PAGE_SIZE));
  const pageNumbers = useMemo(() => {
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [page, totalPages]);

  useEffect(() => {
    if (!slug || !postsData) return;
    const pagesToPrefetch = [
      page > 1 ? page - 1 : null,
      postsData.hasMore ? page + 1 : null,
    ].filter((value): value is number => Boolean(value));

    for (const pageToPrefetch of pagesToPrefetch) {
      queryClient.prefetchQuery({
        queryKey: modelPostsQueryKey(slug, pageToPrefetch, mediaType),
        queryFn: () => fetchModelPosts(slug, pageToPrefetch, mediaType),
        staleTime: 30 * 60_000,
        gcTime: 60 * 60_000,
      });
    }
  }, [slug, page, mediaType, postsData]);

  useEffect(() => {
    if (!slug) return;
    const socket = getSocket();
    const eventName = 'model-refresh:progress';

    const handleProgress = (progress: {
      slug: string;
      status: 'running' | 'completed' | 'failed';
      currentPage: number;
      pagesChecked: number;
      maxPages: number;
      hasMorePages: boolean;
      postsImported: number;
      mediaImported: number;
      postCount: number;
      mediaCount: number;
      error?: string;
      mode?: 'FAST' | 'FULL';
      pageLogs?: Array<{
        page: number;
        ms: number;
        postsImported: number;
        mediaImported: number;
        status: 'ok' | 'skipped' | 'failed';
        error?: string;
      }>;
    }) => {
      if (progress.slug !== slug) return;
      setRefreshProgress({
        active: progress.status === 'running',
        current: progress.currentPage || progress.pagesChecked || 1,
        max: progress.maxPages || 50,
        checked: progress.pagesChecked || 0,
        posts: progress.postsImported || 0,
        media: progress.mediaImported || 0,
        postCount: progress.postCount || 0,
        mediaCount: progress.mediaCount || 0,
        status: progress.status,
        done: progress.status === 'completed',
        error: progress.error,
        mode: progress.mode,
        pageLogs: progress.pageLogs || [],
      });

      queryClient.invalidateQueries({ queryKey: queryKeys.models.detail(slug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.models.posts(slug, page) });

      if (progress.status === 'completed') {
        setPage(1);
        setSelectedMediaIds([]);
        queryClient.invalidateQueries({ queryKey: queryKeys.models.all });
        addToast({
          title: 'Perfil atualizado',
          message: `${progress.postCount} posts / ${progress.mediaCount} mídias no banco`,
          type: 'success',
          duration: 4000,
        });
      }

      if (progress.status === 'failed') {
        addToast({
          title: 'Falha ao verificar',
          message: progress.error || 'Não foi possível verificar as páginas deste perfil agora.',
          type: 'error',
          duration: 5000,
        });
      }
    };

    socket.emit('subscribe:model-refresh', slug);
    socket.on(eventName, handleProgress);

    const poll = window.setInterval(async () => {
      if (!refreshProgress?.active) return;
      try {
        const { data } = await api.get(`/models/${slug}/refresh/status`);
        handleProgress(data);
      } catch {
        setRefreshProgress((current) => current?.active ? { ...current, active: false, status: 'failed', done: false } : current);
      }
    }, 5000);

    return () => {
      window.clearInterval(poll);
      socket.off(eventName, handleProgress);
    };
  }, [slug, page, addToast, refreshProgress?.active]);

  if (isLoading) return <Shimmer />;
  if (!model) return <div className="text-center py-20 text-white/40">Model not found</div>;

  const favorited = isFavorited(model.id);

  const startDownloadWithOptions = async (options: DownloadOptions) => {
    if (!postsData) return;
    const allMediaIds = selectedCount > 0 ? selectedMediaIds : postsData.data.flatMap((p) => p.media.map((m) => m.id));
    if (selectedCount > 0 || allMediaIds.length > 0) {
      try {
        await api.put('/settings', {
          downloadPath: options.downloadPath,
          downloadEngine: options.downloadEngine,
          idmMonitorMode: options.idmMonitorMode,
          downloadMode: options.downloadMode,
        });
        const result = selectedCount > 0
          ? await createDownload({ modelId: model.id, mediaIds: allMediaIds, downloadPath: options.downloadPath, priority: options.priority })
          : await createModelDownload({
              modelId: model.id,
              mediaType: options.mediaType,
              downloadPath: options.downloadPath,
              onlyNotDownloaded: true,
              priority: options.priority,
            });
        addToast({
          title: result.idmImport ? 'Arquivo IDM gerado' : result.enqueued > 0 ? 'Download Queued' : 'Download já existe',
          message: result.idmImport
            ? result.idmImport.ef2Path
            : result.enqueued > 0
            ? `${result.enqueued} items added to queue${result.skipped ? ` · ${result.skipped} já baixados` : ''}`
            : `${result.skipped || allMediaIds.length} links já foram baixados`,
          type: result.idmImport || result.enqueued > 0 ? 'download' : 'info',
          duration: result.idmImport ? 8000 : 3000,
        });
        setDownloadModalOpen(false);
      } catch (error: any) {
        addToast({
          title: 'Download não iniciado',
          message: error?.response?.data?.error || error?.message || 'Erro ao criar download',
          type: 'error',
          duration: 5000,
        });
      }
    }
  };

  const handleMediaClick = (globalIndex: number) => {
    setLightboxIndex(globalIndex);
    setLightboxOpen(true);
  };

  const toggleMedia = (id: string) => {
    setSelectedMediaIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const toggleAllCategory = async () => {
    if (!slug || !postsData) return;
    if (selectedCount > 0) {
      setSelectedMediaIds([]);
      return;
    }

    setIsSelectingCategory(true);
    try {
      const ids = new Set<string>();
      let nextPage = 1;
      let hasMore = true;

      while (hasMore) {
        const data = nextPage === page
          ? postsData
          : await queryClient.fetchQuery({
              queryKey: modelPostsQueryKey(slug, nextPage, mediaType),
              queryFn: () => fetchModelPosts(slug, nextPage, mediaType),
              staleTime: 30 * 60_000,
              gcTime: 60 * 60_000,
            });

        data.data.forEach((post) => {
          post.media.forEach((media) => ids.add(media.id));
        });

        hasMore = data.hasMore;
        nextPage += 1;
      }

      setSelectedMediaIds(Array.from(ids));
      addToast({
        title: 'Categoria selecionada',
        message: `${ids.size} mídias selecionadas em todas as páginas`,
        type: 'success',
        duration: 3000,
      });
    } catch {
      addToast({
        title: 'Falha na seleção',
        message: 'Não foi possível carregar todas as páginas desta categoria.',
        type: 'error',
        duration: 4000,
      });
    } finally {
      setIsSelectingCategory(false);
    }
  };

  const changeMediaType = (next: 'all' | 'IMAGE' | 'VIDEO' | 'GIF') => {
    setMediaType(next);
    setPage(1);
    setSelectedMediaIds([]);
  };

  const goToPage = (nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;
    setPage(nextPage);
  };

  const forceRefreshProfile = async () => {
    const maxPages = 50;
    try {
      setRefreshProgress({
        active: true,
        current: 1,
        max: maxPages,
        checked: 0,
        posts: 0,
        media: 0,
        postCount: model.postCount,
        mediaCount: model.mediaCount,
        status: 'running',
        done: false,
        mode: refreshMode,
        pageLogs: [],
      });

      await refreshProfile.mutateAsync({ pages: maxPages, mode: refreshMode });
      addToast({
        title: 'Verificação iniciada',
        message: 'A tela será atualizada em tempo real.',
        type: 'info',
        duration: 2500,
      });
    } catch (error: any) {
      addToast({
        title: 'Falha ao iniciar',
        message: error?.response?.data?.error || error?.message || 'Não foi possível iniciar a verificação.',
        type: 'error',
        duration: 4000,
      });
      setRefreshProgress((current) => current ? { ...current, active: false, done: false } : current);
    }
  };

  const stopRefreshProfile = async (reason: 'paused' | 'cancelled') => {
    if (!slug) return;
    try {
      await api.post(`/models/${slug}/refresh/stop`, { reason });
      setRefreshProgress((current) => current ? {
        ...current,
        active: false,
        status: 'failed',
        done: false,
        error: reason === 'paused' ? 'Varredura pausada' : 'Varredura cancelada',
      } : current);
    } catch {}
  };

  const repairCurrentProfile = async () => {
    try {
      await api.post('/admin/dedupe-media');
      await api.post('/admin/recalculate-counters');
      queryClient.invalidateQueries({ queryKey: queryKeys.models.detail(slug!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.models.posts(slug!, page) });
      addToast({ title: 'Perfil reparado', message: 'Deduplicação e contadores recalculados.', type: 'success', duration: 3000 });
    } catch (error: any) {
      addToast({ title: 'Falha no reparo', message: error?.message || 'Erro ao reparar perfil', type: 'error', duration: 4000 });
    }
  };

  return (
    <div className="max-w-6xl mx-auto animate-slide-up">
      {/* Hero Banner */}
      <div className="relative h-64 rounded-glass overflow-hidden mb-8">
        {model.bannerUrl ? (
          <img src={model.bannerUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-r from-neon-pink/20 via-neon-cyan/20 to-neon-orange/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-void-900 via-void-900/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 flex items-end gap-4">
          {model.thumbnailUrl && (
            <img
              src={model.thumbnailUrl}
              alt={model.name}
              className="w-24 h-24 rounded-xl border-2 border-white/10 object-cover"
            />
          )}
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold">{model.name}</h1>
              <Badge variant="cyan">{model.service}</Badge>
              {model.isVerified && <Badge variant="green">Verified</Badge>}
            </div>
            <div className="flex items-center gap-4 text-sm text-white/50 font-mono">
              <span>{formatNumber(model.postCount)} posts</span>
              <span>{formatNumber(model.mediaCount)} media</span>
              <span>{formatNumber(model.likesCount)} likes</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <NeonButton
          onClick={() => {
            if (favorited) {
              removeFavorite(model.id);
              addToast({ title: 'Removed', message: `${model.name} removed from favorites`, type: 'info', duration: 2000 });
            } else {
              addFavorite(model.id);
              addToast({ title: 'Favorited', message: `${model.name} added to favorites`, type: 'success', duration: 2000 });
            }
          }}
        >
          {favorited ? '♥ Unfavorite' : '♡ Favorite'}
        </NeonButton>
        <NeonButton onClick={() => setDownloadModalOpen(true)} disabled={isCreating}>
          {isCreating ? 'Adding...' : selectedCount > 0 ? `⇣ Download ${selectedCount}` : '⇣ Download All'}
        </NeonButton>
        <select
          value={refreshMode}
          disabled={Boolean(refreshProgress?.active)}
          onChange={(event) => setRefreshMode(event.target.value as 'FAST' | 'FULL')}
          className="glass-input h-11 text-sm"
        >
          <option value="FAST">Varredura rápida</option>
          <option value="FULL">Varredura completa</option>
        </select>
        <NeonButton onClick={forceRefreshProfile} disabled={Boolean(refreshProgress?.active)}>
          {refreshProgress?.active ? '↻ Atualizando...' : '↻ Atualizar perfil'}
        </NeonButton>
        {refreshProgress?.active && (
          <>
            <NeonButton variant="ghost" className="px-3 py-2 text-xs" onClick={() => stopRefreshProfile('paused')}>
              Pausar
            </NeonButton>
            <NeonButton variant="ghost" className="px-3 py-2 text-xs text-neon-pink" onClick={() => stopRefreshProfile('cancelled')}>
              Cancelar
            </NeonButton>
          </>
        )}
        <NeonButton variant="ghost" className="px-3 py-2 text-xs" onClick={repairCurrentProfile}>
          Reparar perfil
        </NeonButton>
      </div>

      <DownloadOptionsModal
        open={downloadModalOpen}
        selectedCount={selectedCount}
        totalCount={postsData?.total || allMedia.length}
        currentPath={settings?.downloadPath || ''}
        currentMediaType={mediaType}
        settings={settings}
        onClose={() => setDownloadModalOpen(false)}
        onConfirm={startDownloadWithOptions}
      />

      {refreshProgress && (
        <div className="glass-card mb-8 p-4">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs font-mono text-white/55">
            <span>
              {refreshProgress.status === 'failed'
                ? `Falhou na página ${refreshProgress.current}`
                : refreshProgress.done
                ? `Concluído: ${refreshProgress.checked} páginas`
                : `Atualizando página ${refreshProgress.current} de ${refreshProgress.max}`}
            </span>
            <span>
              {refreshProgress.postCount} posts / {refreshProgress.mediaCount} mídias no banco
              {refreshProgress.media > 0 ? ` · ${refreshProgress.media} novas` : ''}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-neon-cyan via-neon-pink to-neon-orange transition-all duration-300"
              style={{
                width: `${refreshProgress.done || refreshProgress.status === 'failed' ? 100 : Math.max(3, Math.min(100, (refreshProgress.current / refreshProgress.max) * 100))}%`,
              }}
            />
          </div>
          {refreshProgress.status === 'failed' && refreshProgress.error && (
            <p className="mt-2 text-xs font-mono text-neon-pink">{refreshProgress.error}</p>
          )}
          {refreshProgress.pageLogs && refreshProgress.pageLogs.length > 0 && (
            <div className="mt-3 max-h-36 overflow-y-auto rounded-xl border border-white/5 bg-black/15 p-2">
              {refreshProgress.pageLogs.slice(-8).map((log) => (
                <div key={`${log.page}-${log.ms}`} className="flex flex-wrap justify-between gap-2 border-b border-white/5 py-1 text-[11px] font-mono text-white/45 last:border-0">
                  <span>pág. {log.page} · {(log.ms / 1000).toFixed(1)}s</span>
                  <span className={log.status === 'failed' ? 'text-neon-pink' : 'text-white/45'}>
                    {log.postsImported} posts · {log.mediaImported} mídias
                    {log.error ? ` · ${log.error}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="sticky top-0 z-30 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-void-900/95 p-3 backdrop-blur">
        <div className="flex flex-wrap gap-2">
          {[
            ['all', 'Todos'],
            ['IMAGE', 'Fotos'],
            ['VIDEO', 'Vídeos'],
            ['GIF', 'GIFs'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => changeMediaType(value as 'all' | 'IMAGE' | 'VIDEO' | 'GIF')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                mediaType === value
                  ? 'bg-glass-active text-white neon-text-cyan'
                  : 'text-white/40 hover:text-white hover:bg-glass-bg'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode((current) => current === 'grid' ? 'list' : 'grid')}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white/70 bg-glass-bg hover:text-white"
          >
            {viewMode === 'grid' ? 'Lista' : 'Grade'}
          </button>
          <select
            value={downloadedFilter}
            onChange={(event) => setDownloadedFilter(event.target.value as any)}
            className="glass-input h-10 text-xs"
          >
            <option value="all">Todos</option>
            <option value="pending">Não baixados</option>
            <option value="downloaded">Baixados</option>
          </select>
          <select
            value={sortMedia}
            onChange={(event) => setSortMedia(event.target.value as any)}
            className="glass-input h-10 text-xs"
          >
            <option value="date">Data</option>
            <option value="type">Tipo</option>
            <option value="size">Tamanho</option>
          </select>
          <button
            onClick={toggleAllCategory}
            disabled={!allMedia.length || isSelectingCategory}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white/70 bg-glass-bg hover:text-white disabled:opacity-40"
          >
            {isSelectingCategory ? 'Selecionando...' : selectedCount > 0 ? 'Limpar seleção' : 'Selecionar tudo'}
          </button>
          <span className="text-xs text-white/35 font-mono">{selectedCount} selecionados</span>
        </div>
      </div>

      {selectedCount > 0 && (
        <div className="fixed bottom-24 left-1/2 z-[70] flex w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 flex-wrap items-center justify-center gap-3 rounded-xl border border-neon-cyan/30 bg-void-900/95 px-4 py-3 shadow-neon-cyan/20 backdrop-blur">
          <span className="text-sm font-mono text-white/75">{selectedCount} selecionados</span>
          <NeonButton className="px-3 py-2 text-xs" onClick={() => setDownloadModalOpen(true)} disabled={isCreating}>
            Baixar
          </NeonButton>
          <NeonButton variant="ghost" className="px-3 py-2 text-xs" onClick={() => setSelectedMediaIds([])}>
            Limpar
          </NeonButton>
        </div>
      )}

      {/* Gallery Grid */}
      {(isLoadingPosts || (isFetchingPosts && !allMedia.length)) ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="glass-card aspect-square flex flex-col items-center justify-center gap-3">
              <div className="h-10 w-10 rounded-full border-2 border-neon-cyan/20 border-t-neon-cyan animate-spin" />
              <span className="text-xs text-white/45 font-mono">Carregando posts...</span>
            </div>
          ))}
        </div>
      ) : allMedia.length && viewMode === 'list' ? (
        <div className="overflow-hidden rounded-xl border border-white/10">
          {allMedia.map((media, index) => (
            <div key={media.id} className="grid grid-cols-[44px_1fr_96px_96px] items-center gap-3 border-b border-white/5 bg-black/15 px-3 py-2 text-sm last:border-b-0">
              <button
                onClick={() => toggleMedia(media.id)}
                className={`h-8 w-8 rounded-lg border text-sm font-bold ${
                  selectedMediaIds.includes(media.id)
                    ? 'bg-neon-cyan text-void-950 border-neon-cyan'
                    : 'bg-black/50 text-white/70 border-white/20'
                }`}
              >
                {selectedMediaIds.includes(media.id) ? '✓' : ''}
              </button>
              <button onClick={() => handleMediaClick(index)} className="truncate text-left text-white/75">
                {media.title || media.id}
              </button>
              <span className="text-xs text-white/45 font-mono">{media.mediaType}</span>
              <span className="text-xs text-white/45 font-mono">{formatVideoDuration(media.duration) ?? '--'}</span>
            </div>
          ))}
        </div>
      ) : allMedia.length ? (
        <VirtuosoGrid
          useWindowScroll
          data={allMedia}
          listClassName="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
          itemContent={(i, media) => (
            <div
              key={media.id}
              className={`glass-card overflow-hidden group cursor-pointer relative ${
                selectedMediaIds.includes(media.id) ? 'ring-2 ring-neon-cyan' : ''
              }`}
            >
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleMedia(media.id);
                }}
                className={`absolute top-2 left-2 z-10 h-8 w-8 rounded-lg border text-sm font-bold ${
                  selectedMediaIds.includes(media.id)
                    ? 'bg-neon-cyan text-void-950 border-neon-cyan'
                    : 'bg-black/50 text-white/70 border-white/20'
                }`}
                title="Selecionar"
              >
                {selectedMediaIds.includes(media.id) ? '✓' : ''}
              </button>
              {media.mediaType !== 'VIDEO' ? (
                <div className="aspect-square relative overflow-hidden" onClick={() => handleMediaClick(i)}>
                  <img
                    src={`/api/media/${media.id}/thumbnail`}
                    alt=""
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  <span className="absolute top-2 right-2 text-xs px-2 py-1 rounded-full bg-black/50 text-white/60">
                    {media.mediaType === 'GIF' ? 'GIF' : 'IMG'}
                  </span>
                </div>
              ) : (
                <div className="aspect-square relative overflow-hidden bg-glass-bg flex items-center justify-center" onClick={() => handleMediaClick(i)}>
                  <img
                    src={`/api/media/${media.id}/thumbnail`}
                    alt={media.title || ''}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-black/10" />
                  <span className="relative z-[1] text-4xl text-white/75 drop-shadow-lg">▶</span>
                  <span className="absolute top-2 right-2 text-xs px-2 py-1 rounded-full bg-black/50 text-white/60">
                    VID
                  </span>
                  <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-1 font-mono text-xs text-white/85">
                    {formatVideoDuration(media.duration) ?? '--:--'}
                  </span>
                </div>
              )}
            </div>
          )}
        />
      ) : (
        <div className="glass-card py-16 text-center">
          <p className="text-white/45 font-mono text-sm">Nenhum post encontrado para este filtro.</p>
        </div>
      )}

      {postsData && totalPages > 1 && (
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page === 1 || isFetchingPosts}
            className="px-3 py-2 rounded-xl bg-glass-bg text-sm font-medium text-white/70 hover:text-white disabled:opacity-35"
          >
            Anterior
          </button>
          {pageNumbers[0] > 1 && (
            <>
              <button
                onClick={() => goToPage(1)}
                className="h-10 min-w-10 rounded-xl bg-glass-bg px-3 text-sm font-mono text-white/70 hover:text-white"
              >
                1
              </button>
              <span className="px-1 text-white/35">...</span>
            </>
          )}
          {pageNumbers.map((pageNumber) => (
            <button
              key={pageNumber}
              onClick={() => goToPage(pageNumber)}
              className={`h-10 min-w-10 rounded-xl px-3 text-sm font-mono transition-all ${
                pageNumber === page
                  ? 'bg-glass-active text-white neon-text-cyan'
                  : 'bg-glass-bg text-white/70 hover:text-white'
              }`}
            >
              {pageNumber}
            </button>
          ))}
          {pageNumbers[pageNumbers.length - 1] < totalPages && (
            <>
              <span className="px-1 text-white/35">...</span>
              <button
                onClick={() => goToPage(totalPages)}
                className="h-10 min-w-10 rounded-xl bg-glass-bg px-3 text-sm font-mono text-white/70 hover:text-white"
              >
                {totalPages}
              </button>
            </>
          )}
          <button
            onClick={() => goToPage(page + 1)}
            disabled={page === totalPages || isFetchingPosts}
            className="px-3 py-2 rounded-xl bg-glass-bg text-sm font-medium text-white/70 hover:text-white disabled:opacity-35"
          >
            Próxima
          </button>
          {isFetchingPosts && (
            <span className="ml-2 text-xs font-mono text-white/35">Atualizando...</span>
          )}
        </div>
      )}

      <ImageLightbox
        images={allMedia}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </div>
  );
}
