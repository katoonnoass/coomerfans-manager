import { useState } from 'react';
import { useToastStore, type ToastType } from '../../stores/toast.store';

const colors: Record<ToastType, string> = {
  success: 'text-neon-green',
  error: 'text-neon-pink',
  info: 'text-neon-cyan',
  download: 'text-neon-orange',
};

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const { history, clearHistory } = useToastStore();

  return (
    <div className="fixed right-5 top-5 z-50">
      <button
        className="relative h-10 rounded-xl border border-white/10 bg-void-900/95 px-3 text-sm text-white/70 backdrop-blur hover:text-white"
        onClick={() => setOpen((current) => !current)}
        title="Notificações"
      >
        Avisos
        {history.length > 0 && (
          <span className="ml-2 rounded-full bg-neon-pink px-2 py-0.5 text-[10px] text-white">{history.length}</span>
        )}
      </button>
      {open && (
        <div className="mt-2 w-[360px] rounded-xl border border-white/10 bg-void-900/98 p-3 shadow-2xl backdrop-blur">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Central de notificações</h3>
            <button className="text-xs text-white/45 hover:text-white" onClick={clearHistory}>Limpar</button>
          </div>
          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {history.length === 0 ? (
              <p className="py-6 text-center text-sm text-white/35">Nenhum aviso</p>
            ) : history.map((toast) => (
              <div key={toast.id} className="rounded-lg border border-white/5 bg-black/20 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm font-semibold ${colors[toast.type]}`}>{toast.title}</p>
                  <span className="text-[10px] uppercase text-white/25">{toast.type}</span>
                </div>
                <p className="mt-1 break-words text-xs text-white/50">{toast.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
