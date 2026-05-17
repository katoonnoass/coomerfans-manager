import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { queryKeys } from '../../lib/query-keys';
import { GlassCard } from '../ui/GlassCard';
import { NeonButton } from '../ui/NeonButton';
import { formatBytes } from '../../lib/utils';

export function SettingsPanel() {
  const queryClient = useQueryClient();
  const [downloadPathDraft, setDownloadPathDraft] = useState('');

  const { data: settings } = useQuery({
    queryKey: queryKeys.settings.get(),
    queryFn: async () => {
      const { data } = await api.get('/settings');
      return data;
    },
  });

  const { data: adminHealth } = useQuery({
    queryKey: ['admin', 'health'],
    queryFn: async () => {
      const { data } = await api.get('/admin/health');
      return data;
    },
    refetchInterval: 10000,
  });

  useEffect(() => {
    setDownloadPathDraft(settings?.downloadPath || '');
  }, [settings?.downloadPath]);

  const updateMutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const { data } = await api.put('/settings', updates);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });

  const adminMutation = useMutation({
    mutationFn: async (path: string) => {
      const { data } = await api.post(path);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.models.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.downloads.all });
      queryClient.invalidateQueries({ queryKey: ['admin', 'health'] });
    },
  });

  return (
    <div className="max-w-2xl mx-auto animate-slide-up space-y-6">
      <h1 className="text-2xl font-bold">
        <span className="neon-text-cyan">⚙</span> Settings
      </h1>

      <GlassCard className="p-6">
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">
          Download Preferences
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Default Quality</p>
              <p className="text-xs text-white/30 font-mono">Video download quality</p>
            </div>
            <select
              value={settings?.defaultQuality || 'HD'}
              onChange={(e) => updateMutation.mutate({ defaultQuality: e.target.value })}
              className="glass-input text-sm"
            >
              <option value="SD">SD (480p)</option>
              <option value="HD">HD (720p)</option>
              <option value="FHD">FHD (1080p)</option>
              <option value="MAX">Max</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Max Concurrent Downloads</p>
              <p className="text-xs text-white/30 font-mono">Limite global da fila</p>
            </div>
            <select
              value={settings?.maxConcurrentDownloads || 3}
              onChange={(e) =>
                updateMutation.mutate({ maxConcurrentDownloads: Number(e.target.value) })
              }
              className="glass-input text-sm"
            >
              {Array.from({ length: 8 }, (_, index) => index + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Modo de download</p>
              <p className="text-xs text-white/30 font-mono">Seguro reduz bloqueios; Turbo aumenta conexões</p>
            </div>
            <select
              value={settings?.downloadMode || 'AUTO'}
              onChange={(e) => updateMutation.mutate({ downloadMode: e.target.value })}
              className="glass-input text-sm"
            >
              <option value="SAFE">Seguro</option>
              <option value="AUTO">Automático</option>
              <option value="TURBO">Turbo</option>
            </select>
          </div>

          {settings?.downloadEngine === 'IDM' && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Modo IDM</p>
                <p className="text-xs text-white/30 font-mono">Monitorar conclusão ou apenas enviar para fila</p>
              </div>
              <select
                value={settings?.idmMonitorMode || 'MONITOR'}
                onChange={(e) => updateMutation.mutate({ idmMonitorMode: e.target.value })}
                className="glass-input text-sm"
              >
                <option value="MONITOR">Monitorar</option>
                <option value="SEND_ONLY">Enviar sem monitorar</option>
                <option value="IMPORT_FILE">Gerar fila .cmd para IDM</option>
              </select>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Partes por vídeo</p>
              <p className="text-xs text-white/30 font-mono">1-16 conexões por arquivo de vídeo</p>
            </div>
            <select
              value={settings?.downloadSegments || 16}
              onChange={(e) =>
                updateMutation.mutate({ downloadSegments: Number(e.target.value) })
              }
              className="glass-input text-sm"
            >
              {[1, 2, 4, 8, 12, 16].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Motor de download</p>
              <p className="text-xs text-white/30 font-mono">Nativo ou Internet Download Manager</p>
            </div>
            <select
              value={settings?.downloadEngine || 'NATIVE'}
              onChange={(e) => updateMutation.mutate({ downloadEngine: e.target.value })}
              className="glass-input text-sm"
            >
              <option value="NATIVE">Nativo</option>
              <option value="IDM">IDM</option>
            </select>
          </div>

          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium">Download Folder</p>
              <p className="text-xs text-white/30 font-mono">Local path used by server downloads</p>
            </div>
            <div className="flex gap-2">
              <input
                value={downloadPathDraft}
                onChange={(e) => setDownloadPathDraft(e.target.value)}
                placeholder="Example: C:/Downloads/CoomerFans"
                className="glass-input min-w-0 flex-1 text-sm"
              />
              <NeonButton
                type="button"
                onClick={() => updateMutation.mutate({ downloadPath: downloadPathDraft.trim() || null })}
                disabled={updateMutation.isPending}
              >
                Save
              </NeonButton>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-xs text-white/30 font-mono">Interface appearance</p>
            </div>
            <select
              value={settings?.theme || 'DARK'}
              onChange={(e) => updateMutation.mutate({ theme: e.target.value })}
              className="glass-input text-sm"
            >
              <option value="DARK">Dark</option>
              <option value="LIGHT">Light</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Notifications</p>
              <p className="text-xs text-white/30 font-mono">Download complete alerts</p>
            </div>
            <button
              onClick={() =>
                updateMutation.mutate({
                  notificationsEnabled: !settings?.notificationsEnabled,
                })
              }
              className={`w-12 h-6 rounded-full transition-colors ${
                settings?.notificationsEnabled ? 'bg-neon-cyan' : 'bg-white/10'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  settings?.notificationsEnabled ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">
          Manutenção
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-xs text-white/35 font-mono">Fila ativa</p>
            <p className="text-xl font-semibold">{adminHealth?.queue?.activeItems ?? 0}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-xs text-white/35 font-mono">Falhas</p>
            <p className="text-xl font-semibold text-neon-pink">{adminHealth?.queue?.failedItems ?? 0}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-xs text-white/35 font-mono">Disco</p>
            <p className="text-xl font-semibold">{formatBytes(adminHealth?.storage?.bytes || 0)}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <NeonButton
            className="px-3 py-2 text-xs"
            disabled={adminMutation.isPending}
            onClick={() => window.confirm('Reenfileirar downloads pendentes?') && adminMutation.mutate('/admin/requeue-downloads')}
          >
            Reenfileirar pendentes
          </NeonButton>
          <NeonButton
            className="px-3 py-2 text-xs"
            disabled={adminMutation.isPending}
            onClick={() => window.confirm('Limpar mídias duplicadas do banco?') && adminMutation.mutate('/admin/dedupe-media')}
          >
            Limpar duplicadas
          </NeonButton>
          <NeonButton
            className="px-3 py-2 text-xs"
            disabled={adminMutation.isPending}
            onClick={() => window.confirm('Recalcular contadores de todos os perfis?') && adminMutation.mutate('/admin/recalculate-counters')}
          >
            Recalcular contadores
          </NeonButton>
          <NeonButton
            className="px-3 py-2 text-xs"
            disabled={adminMutation.isPending}
            onClick={() => window.confirm('Remover arquivos .part antigos?') && adminMutation.mutate('/admin/cleanup-partials')}
          >
            Limpar parciais
          </NeonButton>
        </div>
      </GlassCard>

    </div>
  );
}
