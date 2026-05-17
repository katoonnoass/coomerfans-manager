import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useDownloads } from '../../hooks/useAuth';
import api from '../../lib/api';
import { formatBytes, formatSpeed } from '../../lib/utils';

export function ActivityDock() {
  const { downloads } = useDownloads();
  const { data: health } = useQuery({
    queryKey: ['admin', 'health', 'dock'],
    queryFn: async () => {
      const { data } = await api.get('/admin/health');
      return data;
    },
    refetchInterval: 15000,
  });

  const active = downloads.filter((job: any) => ['PENDING', 'DOWNLOADING', 'PAUSED'].includes(job.status));
  const failed = downloads.filter((job: any) => job.status === 'FAILED');
  const speed = active.reduce((sum: number, job: any) => sum + (job.speed || 0), 0);
  const downloaded = active.reduce((sum: number, job: any) => sum + (job.downloadedSize || 0), 0);

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(980px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-white/10 bg-void-900/95 px-4 py-3 shadow-2xl backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-white/55">
        <Link to="/downloads" className="hover:text-neon-cyan">
          Downloads: {active.length} ativos · {failed.length} falhas · {formatSpeed(speed)}
        </Link>
        <span>{formatBytes(downloaded)} nesta fila</span>
        <Link to="/diagnostics" className="hover:text-neon-cyan">
          Banco: {health?.media?.downloaded || 0} baixadas / {health?.media?.pending || 0} pendentes
        </Link>
        {health?.lastSyncRun && (
          <span className={health.lastSyncRun.status === 'FAILED' ? 'text-neon-pink' : 'text-white/45'}>
            Sync: {health.lastSyncRun.slug} p.{health.lastSyncRun.pagesChecked}
          </span>
        )}
      </div>
    </div>
  );
}
