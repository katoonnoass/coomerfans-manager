import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDownloads } from '../../hooks/useAuth';
import { GlassCard } from '../ui/GlassCard';
import { NeonProgress } from '../ui/NeonProgress';
import { Badge } from '../ui/Badge';
import { NeonButton } from '../ui/NeonButton';
import { formatBytes, formatSpeed, formatDate } from '../../lib/utils';
import type { DownloadJob } from '@coomerfans/shared';

const statusColors: Record<string, 'cyan' | 'pink' | 'green' | 'orange' | 'purple'> = {
  PENDING: 'purple',
  DOWNLOADING: 'cyan',
  PAUSED: 'orange',
  COMPLETED: 'green',
  FAILED: 'pink',
  CANCELLED: 'orange',
};

interface DownloadItemProps {
  job: DownloadJob;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  disabled?: boolean;
}

function DownloadItem({ job, onPause, onResume, onCancel, onRetry, disabled }: DownloadItemProps) {
  const itemCount = job.media?.length || 0;
  const modelSlug = (job as any).model?.slug;
  const canPause = job.status === 'PENDING' || job.status === 'DOWNLOADING';
  const canResume = job.status === 'PAUSED';
  const canCancel = job.status === 'PENDING' || job.status === 'DOWNLOADING' || job.status === 'PAUSED';
  const canRetry = job.status === 'FAILED';

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          {modelSlug ? (
            <Link to={`/model/${modelSlug}`} className="font-semibold hover:text-neon-cyan">
              {job.modelName}
            </Link>
          ) : (
            <h3 className="font-semibold">{job.modelName}</h3>
          )}
          <p className="text-xs text-white/40 font-mono">
            {job.completedItems}/{job.totalItems} items
            {job.totalSize ? ` · ${formatBytes(job.totalSize)}` : ''}
          </p>
        </div>
        <Badge variant={statusColors[job.status] || 'purple'}>
          {job.status}
        </Badge>
      </div>

      {(canPause || canResume || canCancel || canRetry) && (
        <div className="mb-3 flex flex-wrap gap-2">
          {canPause && (
            <NeonButton variant="ghost" className="px-3 py-1 text-xs" disabled={disabled} onClick={() => onPause(job.id)}>
              Pausar
            </NeonButton>
          )}
          {canResume && (
            <NeonButton className="px-3 py-1 text-xs" disabled={disabled} onClick={() => onResume(job.id)}>
              Retomar
            </NeonButton>
          )}
          {canRetry && (
            <NeonButton className="px-3 py-1 text-xs" disabled={disabled} onClick={() => onRetry(job.id)}>
              Tentar novamente
            </NeonButton>
          )}
          {canCancel && (
            <NeonButton variant="ghost" className="px-3 py-1 text-xs text-neon-pink" disabled={disabled} onClick={() => onCancel(job.id)}>
              Cancelar
            </NeonButton>
          )}
        </div>
      )}

      <div className="space-y-1">
        <NeonProgress progress={job.status === 'COMPLETED' ? 100 : job.progress} showLabel />
        <div className="flex flex-wrap justify-between gap-2 text-xs text-white/40 font-mono">
          <span>
            {formatBytes(job.downloadedSize)}
            {job.totalSize ? ` / ${formatBytes(job.totalSize)}` : ''}
          </span>
          <span>{job.speed ? formatSpeed(job.speed) : '0 B/s'}</span>
        </div>
      </div>

      {itemCount > 0 && (
        <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
          {job.media.map((item, index) => {
            const downloadedSize = item.downloadedSize
              ?? (item.fileSize ? Math.floor((item.fileSize * item.progress) / 100) : 0);

            return (
              <div key={item.id} className="rounded-xl border border-white/5 bg-black/15 p-3">
                <div className="mb-2 flex items-center justify-between gap-3 text-xs font-mono">
                  <span className="text-white/60">#{index + 1} {item.type}</span>
                  <span className="text-white/35">{item.status}</span>
                </div>
                <NeonProgress progress={item.status === 'COMPLETED' ? 100 : item.progress} />
                <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-white/35 font-mono">
                  <span>
                    {formatBytes(downloadedSize)}
                    {item.fileSize ? ` / ${formatBytes(item.fileSize)}` : ''}
                  </span>
                  <span>{item.speed ? formatSpeed(item.speed) : ''}</span>
                </div>
                {item.filePath && (
                  <p className="mt-1 truncate text-[11px] text-white/25 font-mono" title={item.filePath}>
                    {item.filePath}
                  </p>
                )}
                {item.errorMessage && (
                  <p className="mt-1 text-[11px] text-neon-pink font-mono">
                    {item.errorMessage}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {job.errorMessage && (
        <p className="text-xs text-neon-pink mt-2 font-mono">{job.errorMessage}</p>
      )}

      <div className="flex items-center justify-between mt-3 text-xs text-white/30 font-mono">
        <span>{formatDate(job.createdAt)}</span>
        <span>{job.retryCount} retries</span>
      </div>
    </GlassCard>
  );
}

export function DownloadQueue() {
  const {
    downloads,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    retryDownload,
    retryAllFailedDownloads,
    clearDownloadHistory,
    isUpdatingDownload,
  } = useDownloads();
  const active = downloads.filter((d: any) => d.status === 'DOWNLOADING' || d.status === 'PENDING' || d.status === 'PAUSED');
  const completed = downloads.filter((d: any) => d.status === 'COMPLETED');
  const failed = downloads.filter((d: any) => d.status === 'FAILED');
  const cancelled = downloads.filter((d: any) => d.status === 'CANCELLED');
  const [tab, setTab] = useState<'active' | 'failed' | 'completed' | 'all'>('active');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const visibleDownloads = tab === 'active'
    ? active
    : tab === 'failed'
      ? failed
      : tab === 'completed'
        ? completed
        : downloads;
  const groupedDownloads = useMemo(() => {
    const groups = new Map<string, any[]>();
    visibleDownloads.forEach((job: any) => {
      const key = job.modelName || 'Sem modelo';
      groups.set(key, [...(groups.get(key) || []), job]);
    });
    return Array.from(groups.entries()).map(([modelName, jobs]) => {
      const totalItems = jobs.reduce((sum, job) => sum + (job.totalItems || 0), 0);
      const completedItems = jobs.reduce((sum, job) => sum + (job.completedItems || 0), 0);
      const activeJobs = jobs.filter((job) => ['PENDING', 'DOWNLOADING', 'PAUSED'].includes(job.status)).length;
      const speed = jobs.reduce((sum, job) => sum + (job.speed || 0), 0);
      const downloadedSize = jobs.reduce((sum, job) => sum + (job.downloadedSize || 0), 0);
      const totalSize = jobs.reduce((sum, job) => sum + (job.totalSize || 0), 0);
      const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
      return {
        modelName,
        modelSlug: jobs.find((job) => job.model?.slug)?.model?.slug,
        jobs,
        totalItems,
        completedItems,
        activeJobs,
        speed,
        downloadedSize,
        totalSize,
        progress,
      };
    });
  }, [visibleDownloads]);
  const activeDownloaded = active.reduce((sum: number, d: any) => sum + (d.downloadedSize || 0), 0);
  const activeTotal = active.reduce((sum: number, d: any) => sum + (d.totalSize || 0), 0);
  const activeSpeed = active.reduce((sum: number, d: any) => sum + (d.speed || 0), 0);
  const activeProgress = activeTotal > 0
    ? Math.round((activeDownloaded / activeTotal) * 100)
    : active.length > 0
      ? Math.round(active.reduce((sum: number, d: any) => sum + (d.progress || 0), 0) / active.length)
      : 0;

  return (
    <div className="max-w-5xl mx-auto animate-slide-up space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <GlassCard className="p-4 text-center">
          <p className="text-2xl font-bold neon-text-cyan">{downloads.length}</p>
          <p className="text-xs text-white/40 font-mono">Total Jobs</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <p className="text-2xl font-bold neon-text-orange">{active.length}</p>
          <p className="text-xs text-white/40 font-mono">Active</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <p className="text-2xl font-bold neon-text-green">{completed.length}</p>
          <p className="text-xs text-white/40 font-mono">Completed</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <p className="text-2xl font-bold neon-text-pink">{failed.length}</p>
          <p className="text-xs text-white/40 font-mono">Failed</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <p className="text-2xl font-bold neon-text-orange">{cancelled.length}</p>
          <p className="text-xs text-white/40 font-mono">Cancelled</p>
        </GlassCard>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Downloads</h1>
          <p className="text-xs text-white/40 font-mono">Registro de downloads</p>
        </div>
        <NeonButton
          className="px-4 py-2 text-xs"
          disabled={isUpdatingDownload || failed.length === 0}
          onClick={() => retryAllFailedDownloads()}
        >
          Reprocessar falhas
        </NeonButton>
        <NeonButton
          variant="ghost"
          className="px-4 py-2 text-xs text-neon-pink"
          disabled={isUpdatingDownload || downloads.every((d: any) => ['PENDING', 'DOWNLOADING', 'PAUSED'].includes(d.status))}
          onClick={() => clearDownloadHistory()}
        >
          Limpar registro
        </NeonButton>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          ['active', `Ativos (${active.length})`],
          ['failed', `Falhas (${failed.length})`],
          ['completed', `Concluídos (${completed.length})`],
          ['all', `Todos (${downloads.length})`],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value as typeof tab)}
            className={`rounded-xl px-4 py-2 text-sm font-medium ${
              tab === value ? 'bg-glass-active text-white neon-text-cyan' : 'bg-glass-bg text-white/50 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {active.length > 0 && (
        <GlassCard className="p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-white/45 font-mono">
            <span>Progresso geral ativo</span>
            <span>{formatSpeed(activeSpeed)}</span>
          </div>
          <NeonProgress progress={activeProgress} showLabel />
          <div className="mt-2 text-xs text-white/35 font-mono">
            {formatBytes(activeDownloaded)}
            {activeTotal ? ` / ${formatBytes(activeTotal)}` : ''}
          </div>
        </GlassCard>
      )}

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
            Downloads por modelo
          </h2>
          {groupedDownloads.length > 0 && (
            <div className="flex gap-2">
              <button
                className="rounded-lg bg-glass-bg px-3 py-2 text-xs text-white/55 hover:text-white"
                onClick={() => setCollapsedGroups(Object.fromEntries(groupedDownloads.map((group) => [group.modelName, false])))}
              >
                Expandir todos
              </button>
              <button
                className="rounded-lg bg-glass-bg px-3 py-2 text-xs text-white/55 hover:text-white"
                onClick={() => setCollapsedGroups(Object.fromEntries(groupedDownloads.map((group) => [group.modelName, true])))}
              >
                Recolher todos
              </button>
            </div>
          )}
        </div>
        {visibleDownloads.length === 0 ? (
          <GlassCard className="p-12 text-center">
            <span className="text-6xl block mb-4 opacity-20">⇣</span>
            <p className="text-white/40">No downloads yet</p>
            <p className="text-xs text-white/20 font-mono mt-1">
              Browse models and click "Download All" to start
            </p>
          </GlassCard>
        ) : (
          <div className="space-y-5">
            {groupedDownloads.map((group) => {
              const collapsed = Boolean(collapsedGroups[group.modelName]);
              return (
              <section key={group.modelName} className="space-y-3">
                <GlassCard className="p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      {group.modelSlug ? (
                        <Link to={`/model/${group.modelSlug}`} className="font-semibold hover:text-neon-cyan">
                          {group.modelName}
                        </Link>
                      ) : (
                        <h3 className="font-semibold">{group.modelName}</h3>
                      )}
                      <p className="text-xs text-white/40 font-mono">
                        {group.jobs.length} jobs · {group.completedItems}/{group.totalItems} items · {group.activeJobs} ativos
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/45 font-mono">{formatSpeed(group.speed)}</span>
                      <button
                        className="rounded-lg bg-glass-bg px-3 py-2 text-xs text-white/60 hover:text-white disabled:opacity-35"
                        disabled={isUpdatingDownload}
                        onClick={() => group.jobs.filter((job: any) => ['PENDING', 'DOWNLOADING'].includes(job.status)).forEach((job: any) => pauseDownload(job.id))}
                      >
                        Pausar grupo
                      </button>
                      <button
                        className="rounded-lg bg-glass-bg px-3 py-2 text-xs text-white/60 hover:text-white disabled:opacity-35"
                        disabled={isUpdatingDownload}
                        onClick={() => group.jobs.filter((job: any) => job.status === 'PAUSED').forEach((job: any) => resumeDownload(job.id))}
                      >
                        Retomar grupo
                      </button>
                      <button
                        className="rounded-lg bg-glass-bg px-3 py-2 text-xs text-white/60 hover:text-white disabled:opacity-35"
                        disabled={isUpdatingDownload}
                        onClick={() => group.jobs.filter((job: any) => job.status === 'FAILED').forEach((job: any) => retryDownload(job.id))}
                      >
                        Reprocessar grupo
                      </button>
                      <button
                        className="rounded-lg bg-glass-bg px-3 py-2 text-xs text-white/60 hover:text-white"
                        onClick={() => setCollapsedGroups((current) => ({
                          ...current,
                          [group.modelName]: !current[group.modelName],
                        }))}
                      >
                        {collapsed ? 'Expandir' : 'Recolher'}
                      </button>
                    </div>
                  </div>
                  <NeonProgress progress={group.progress} showLabel />
                  <div className="mt-2 text-xs text-white/35 font-mono">
                    {formatBytes(group.downloadedSize)}
                    {group.totalSize ? ` / ${formatBytes(group.totalSize)}` : ''}
                  </div>
                </GlassCard>
                {!collapsed && (
                  <div className="grid gap-3 xl:grid-cols-2">
                    {group.jobs.map((job: any) => (
                      <DownloadItem
                        key={job.id}
                        job={job}
                        onPause={pauseDownload}
                        onResume={resumeDownload}
                        onCancel={cancelDownload}
                        onRetry={retryDownload}
                        disabled={isUpdatingDownload}
                      />
                    ))}
                  </div>
                )}
              </section>
            )})}
          </div>
        )}
      </div>
    </div>
  );
}
