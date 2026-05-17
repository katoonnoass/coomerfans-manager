import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import { formatNumber, formatDate } from '../../lib/utils';
import { Link } from 'react-router-dom';

interface DashboardStats {
  totals: {
    models: number;
    media: number;
    downloads: number;
    activeDownloads: number;
    completedDownloads: number;
    favorites: number;
    storageUsed: number;
    storageLimit: number;
  };
  recentDownloads: Array<{
    id: string;
    modelName: string;
    status: string;
    progress: number;
    totalItems: number;
    completedItems: number;
    createdAt: string;
  }>;
  topModels: Array<{
    id: string;
    name: string;
    slug: string;
    postCount: number;
    mediaCount: number;
    thumbnailUrl: string | null;
  }>;
}

const statCards = [
  { key: 'models', label: 'Models', icon: '▣', color: 'text-neon-cyan' },
  { key: 'media', label: 'Media', icon: '◈', color: 'text-neon-pink' },
  { key: 'downloads', label: 'Downloads', icon: '⇣', color: 'text-neon-orange' },
  { key: 'completedDownloads', label: 'Completed', icon: '✓', color: 'text-neon-green' },
  { key: 'activeDownloads', label: 'Active', icon: '↻', color: 'text-neon-cyan' },
  { key: 'favorites', label: 'Favorites', icon: '♥', color: 'text-neon-pink' },
] as const;

export function Dashboard() {
  const { data, isLoading } = useQuery<DashboardStats>({
    queryKey: ['stats'],
    queryFn: async () => {
      const { data } = await api.get('/stats');
      return data;
    },
    refetchInterval: 10000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {Array.from({ length: 6 }).map((_, i) => (
          <GlassCard key={i} className="p-4 animate-pulse">
            <div className="h-8 bg-glass-bg rounded mb-2" />
            <div className="h-4 bg-glass-bg rounded w-1/2" />
          </GlassCard>
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="animate-slide-up space-y-8">
      <h1 className="text-2xl font-bold">
        <span className="neon-text-cyan">◆</span> Dashboard
      </h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((card) => (
          <GlassCard key={card.key} className="p-4">
            <span className={`text-2xl ${card.color}`}>{card.icon}</span>
            <p className="text-2xl font-bold mt-2">
              {formatNumber(data.totals[card.key as keyof typeof data.totals] as number)}
            </p>
            <p className="text-xs text-white/40 font-mono">{card.label}</p>
          </GlassCard>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Downloads */}
        <GlassCard className="p-6">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">
            Recent Downloads
          </h2>
          {data.recentDownloads.length === 0 ? (
            <p className="text-white/30 text-sm font-mono">No downloads yet</p>
          ) : (
            <div className="space-y-3">
              {data.recentDownloads.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div className="min-w-0 flex-1 mr-4">
                    <p className="text-sm truncate">{d.modelName}</p>
                    <p className="text-xs text-white/30 font-mono">{formatDate(d.createdAt)}</p>
                  </div>
                  <Badge variant={
                    d.status === 'COMPLETED' ? 'green' :
                    d.status === 'FAILED' ? 'pink' :
                    d.status === 'DOWNLOADING' ? 'cyan' : 'purple'
                  }>
                    {d.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        {/* Top Models */}
        <GlassCard className="p-6">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">
            Top Models
          </h2>
          {data.topModels.length === 0 ? (
            <p className="text-white/30 text-sm font-mono">No models yet</p>
          ) : (
            <div className="space-y-3">
              {data.topModels.map((m, i) => (
                <Link
                  key={m.id}
                  to={`/model/${m.slug}`}
                  className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0 hover:bg-glass-bg rounded-lg px-2 -mx-2 transition-colors"
                >
                  <span className="text-sm font-mono text-white/20 w-5">#{i + 1}</span>
                  {m.thumbnailUrl ? (
                    <img src={`/api/models/${m.slug}/thumbnail`} alt="" className="w-8 h-8 rounded-lg object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-glass-bg flex items-center justify-center">
                      <span className="text-white/20 text-xs">◈</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{m.name}</p>
                    <p className="text-xs text-white/30 font-mono">
                      {formatNumber(m.postCount)} posts · {formatNumber(m.mediaCount)} media
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
