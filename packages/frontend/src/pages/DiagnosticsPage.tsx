import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { GlassCard } from '../components/ui/GlassCard';
import { NeonButton } from '../components/ui/NeonButton';
import { formatBytes } from '../lib/utils';

const actions = [
  ['/admin/recalculate-counters', 'Recalcular contadores'],
  ['/admin/dedupe-media', 'Deduplicar mídias'],
  ['/admin/requeue-downloads', 'Reprocessar pendentes'],
  ['/admin/cleanup-partials', 'Limpar parciais'],
] as const;

export function DiagnosticsPage() {
  const queryClient = useQueryClient();
  const { data: health } = useQuery({
    queryKey: ['admin', 'health'],
    queryFn: async () => (await api.get('/admin/health')).data,
    refetchInterval: 10000,
  });
  const { data: idmFiles } = useQuery({
    queryKey: ['admin', 'idm-import-files'],
    queryFn: async () => (await api.get('/admin/idm-import-files')).data,
    refetchInterval: 10000,
  });
  const actionMutation = useMutation({
    mutationFn: async (path: string) => (await api.post(path)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  return (
    <div className="mx-auto max-w-6xl animate-slide-up space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold">Diagnósticos</h1>
        <p className="text-xs text-white/40 font-mono">Operação, reparo e arquivos IDM</p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <GlassCard className="p-4">
          <p className="text-xs text-white/40 font-mono">Fila Redis</p>
          <p className="mt-1 text-xl font-bold neon-text-cyan">{health?.queue?.waiting || 0}</p>
          <p className="text-xs text-white/35">aguardando</p>
        </GlassCard>
        <GlassCard className="p-4">
          <p className="text-xs text-white/40 font-mono">Itens ativos</p>
          <p className="mt-1 text-xl font-bold neon-text-orange">{health?.queue?.activeItems || 0}</p>
          <p className="text-xs text-white/35">baixando/pendente</p>
        </GlassCard>
        <GlassCard className="p-4">
          <p className="text-xs text-white/40 font-mono">Falhas</p>
          <p className="mt-1 text-xl font-bold neon-text-pink">{health?.queue?.failedItems || 0}</p>
          <p className="text-xs text-white/35">mídias com erro</p>
        </GlassCard>
        <GlassCard className="p-4">
          <p className="text-xs text-white/40 font-mono">Storage</p>
          <p className="mt-1 text-xl font-bold neon-text-green">{formatBytes(health?.storage?.bytes || 0)}</p>
          <p className="truncate text-xs text-white/35" title={health?.storage?.path}>{health?.storage?.path}</p>
        </GlassCard>
      </div>

      <GlassCard className="p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/60">Ações de reparo</h2>
        <div className="flex flex-wrap gap-2">
          {actions.map(([path, label]) => (
            <NeonButton key={path} className="px-4 py-2 text-xs" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate(path)}>
              {label}
            </NeonButton>
          ))}
        </div>
        {actionMutation.data && (
          <pre className="mt-3 max-h-40 overflow-auto rounded-xl bg-black/20 p-3 text-xs text-white/45">{JSON.stringify(actionMutation.data, null, 2)}</pre>
        )}
      </GlassCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/60">Últimos erros</h2>
          <div className="space-y-3 text-xs font-mono text-white/45">
            <div className="rounded-xl border border-white/5 bg-black/15 p-3">
              <p className="text-white/70">Download</p>
              <p>{health?.lastFailedDownload?.modelName || 'sem erro recente'}</p>
              <p className="text-neon-pink">{health?.lastFailedDownload?.errorMessage}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-black/15 p-3">
              <p className="text-white/70">Varredura</p>
              <p>{health?.lastSyncRun?.slug || 'sem varredura recente'} · {health?.lastSyncRun?.status}</p>
              <p className="text-neon-pink">{health?.lastSyncRun?.errorMessage}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/60">Arquivos IDM</h2>
          <p className="mb-3 truncate text-xs text-white/35 font-mono" title={idmFiles?.path}>{idmFiles?.path}</p>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {idmFiles?.files?.length ? idmFiles.files.map((file: any) => (
              <div key={file.path} className="rounded-xl border border-white/5 bg-black/15 p-3 text-xs">
                <p className="font-mono text-white/70">{file.name}</p>
                <p className="truncate text-white/35" title={file.path}>{file.path}</p>
                <p className="text-white/30">{formatBytes(file.bytes)} · {new Date(file.updatedAt).toLocaleString()}</p>
              </div>
            )) : <p className="py-6 text-center text-sm text-white/35">Nenhum arquivo IDM gerado</p>}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
