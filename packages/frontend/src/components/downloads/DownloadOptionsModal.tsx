import { useEffect, useState } from 'react';
import { NeonButton } from '../ui/NeonButton';

export interface DownloadOptions {
  downloadPath: string | null;
  mediaType: 'all' | 'IMAGE' | 'VIDEO' | 'GIF';
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  downloadEngine: 'NATIVE' | 'IDM';
  idmMonitorMode: 'MONITOR' | 'SEND_ONLY' | 'IMPORT_FILE';
  downloadMode: 'SAFE' | 'AUTO' | 'TURBO';
}

interface DownloadOptionsModalProps {
  open: boolean;
  selectedCount: number;
  totalCount: number;
  currentPath?: string;
  currentMediaType: 'all' | 'IMAGE' | 'VIDEO' | 'GIF';
  settings?: any;
  onClose: () => void;
  onConfirm: (options: DownloadOptions) => void;
}

export function DownloadOptionsModal({
  open,
  selectedCount,
  totalCount,
  currentPath = '',
  currentMediaType,
  settings,
  onClose,
  onConfirm,
}: DownloadOptionsModalProps) {
  const [downloadPath, setDownloadPath] = useState(currentPath);
  const [mediaType, setMediaType] = useState<'all' | 'IMAGE' | 'VIDEO' | 'GIF'>(currentMediaType);
  const [priority, setPriority] = useState<'LOW' | 'NORMAL' | 'HIGH'>(selectedCount > 0 ? 'HIGH' : 'NORMAL');
  const [downloadEngine, setDownloadEngine] = useState<'NATIVE' | 'IDM'>('NATIVE');
  const [idmMonitorMode, setIdmMonitorMode] = useState<'MONITOR' | 'SEND_ONLY' | 'IMPORT_FILE'>('MONITOR');
  const [downloadMode, setDownloadMode] = useState<'SAFE' | 'AUTO' | 'TURBO'>('AUTO');

  useEffect(() => {
    if (!open) return;
    setDownloadPath(currentPath || settings?.downloadPath || '');
    setMediaType(currentMediaType);
    setPriority(selectedCount > 0 ? 'HIGH' : 'NORMAL');
    setDownloadEngine(settings?.downloadEngine === 'IDM' ? 'IDM' : 'NATIVE');
    setIdmMonitorMode(settings?.idmMonitorMode === 'IMPORT_FILE' || settings?.idmMonitorMode === 'SEND_ONLY' ? settings.idmMonitorMode : 'MONITOR');
    setDownloadMode(settings?.downloadMode === 'SAFE' || settings?.downloadMode === 'TURBO' ? settings.downloadMode : 'AUTO');
  }, [open, currentPath, currentMediaType, selectedCount, settings]);

  if (!open) return null;

  const affected = selectedCount > 0 ? selectedCount : totalCount;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-void-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Configurar download</h2>
            <p className="text-xs text-white/40 font-mono">{affected} itens serão processados</p>
          </div>
          <button className="text-white/35 hover:text-white" onClick={onClose}>✕</button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 md:col-span-2">
            <span className="text-xs text-white/45 font-mono">Pasta</span>
            <input value={downloadPath} onChange={(event) => setDownloadPath(event.target.value)} className="glass-input w-full text-sm" />
          </label>
          <label className="space-y-2">
            <span className="text-xs text-white/45 font-mono">Tipo</span>
            <select value={mediaType} disabled={selectedCount > 0} onChange={(event) => setMediaType(event.target.value as any)} className="glass-input w-full text-sm">
              <option value="all">Tudo</option>
              <option value="IMAGE">Fotos</option>
              <option value="VIDEO">Vídeos</option>
              <option value="GIF">GIFs</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs text-white/45 font-mono">Prioridade</span>
            <select value={priority} onChange={(event) => setPriority(event.target.value as any)} className="glass-input w-full text-sm">
              <option value="LOW">Baixa</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">Alta</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs text-white/45 font-mono">Motor</span>
            <select value={downloadEngine} onChange={(event) => setDownloadEngine(event.target.value as any)} className="glass-input w-full text-sm">
              <option value="NATIVE">Nativo</option>
              <option value="IDM">IDM</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs text-white/45 font-mono">Modo</span>
            <select value={downloadMode} onChange={(event) => setDownloadMode(event.target.value as any)} className="glass-input w-full text-sm">
              <option value="SAFE">Seguro</option>
              <option value="AUTO">Automático</option>
              <option value="TURBO">Turbo</option>
            </select>
          </label>
          {downloadEngine === 'IDM' && (
            <label className="space-y-2 md:col-span-2">
              <span className="text-xs text-white/45 font-mono">IDM</span>
              <select value={idmMonitorMode} onChange={(event) => setIdmMonitorMode(event.target.value as any)} className="glass-input w-full text-sm">
                <option value="MONITOR">Enviar e monitorar</option>
                <option value="SEND_ONLY">Enviar sem monitorar</option>
                <option value="IMPORT_FILE">Gerar fila .cmd para IDM</option>
              </select>
            </label>
          )}
        </div>

        <div className="mt-5 rounded-xl border border-white/5 bg-black/15 p-3 text-xs text-white/45 font-mono">
          {downloadEngine === 'IDM' && idmMonitorMode === 'IMPORT_FILE'
            ? 'Será gerado um .cmd que adiciona todos os links na fila do IDM.'
            : 'O download será enviado para a fila interna.'}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <NeonButton variant="ghost" onClick={onClose}>Cancelar</NeonButton>
          <NeonButton onClick={() => onConfirm({
            downloadPath: downloadPath.trim() || null,
            mediaType,
            priority,
            downloadEngine,
            idmMonitorMode,
            downloadMode,
          })}>
            Iniciar
          </NeonButton>
        </div>
      </div>
    </div>
  );
}
