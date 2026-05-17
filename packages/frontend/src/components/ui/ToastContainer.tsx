import { motion, AnimatePresence } from 'framer-motion';
import { useToastStore, type ToastType } from '../../stores/toast.store';

const icons: Record<ToastType, string> = {
  success: '✓',
  error: '✗',
  info: '◈',
  download: '⇣',
};

const borders: Record<ToastType, string> = {
  success: 'border-neon-green/30 shadow-neon-green/10',
  error: 'border-neon-pink/30 shadow-neon-pink/10',
  info: 'border-neon-cyan/30 shadow-neon-cyan/10',
  download: 'border-neon-orange/30 shadow-neon-orange/10',
};

const textColors: Record<ToastType, string> = {
  success: 'text-neon-green',
  error: 'text-neon-pink',
  info: 'text-neon-cyan',
  download: 'text-neon-orange',
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 80, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80, scale: 0.95 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={`
              glass-card p-4 cursor-pointer
              border ${borders[toast.type] || borders.info}
              hover:bg-glass-hover
            `}
            onClick={() => removeToast(toast.id)}
          >
            <div className="flex items-start gap-3">
              <span className={`text-lg ${textColors[toast.type]}`}>
                {icons[toast.type]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{toast.title}</p>
                <p className="text-xs text-white/50 mt-0.5 truncate">{toast.message}</p>
              </div>
              <button className="text-white/20 hover:text-white/60 text-sm">✕</button>
            </div>
            <div className="mt-2 h-0.5 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${
                  toast.type === 'success' ? 'bg-neon-green' :
                  toast.type === 'error' ? 'bg-neon-pink' :
                  toast.type === 'download' ? 'bg-neon-orange' :
                  'bg-neon-cyan'
                }`}
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: (toast.duration ?? 5000) / 1000, ease: 'linear' }}
              />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
