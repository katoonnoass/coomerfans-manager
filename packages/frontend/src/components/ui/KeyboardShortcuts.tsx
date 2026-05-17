import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface Shortcut {
  keys: string[];
  description: string;
  action: () => void;
}

export function KeyboardShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showHelp, setShowHelp] = useState(false);

  const shortcuts: Shortcut[] = [
    { keys: ['Ctrl', 'K'], description: 'Open search', action: () => navigate('/search') },
    { keys: ['Ctrl', 'B'], description: 'Browse models', action: () => navigate('/browse') },
    { keys: ['Ctrl', 'D'], description: 'Downloads', action: () => navigate('/downloads') },
    { keys: ['Ctrl', 'H'], description: 'Home', action: () => navigate('/') },
    { keys: ['Ctrl', 'F'], description: 'Favorites', action: () => navigate('/favorites') },
    { keys: ['?'], description: 'Show shortcuts', action: () => setShowHelp((s) => !s) },
    { keys: ['Escape'], description: 'Close modal / Go back', action: () => { setShowHelp(false); if (location.pathname !== '/') navigate(-1); } },
  ];

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const key = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;

    for (const shortcut of shortcuts) {
      const match = shortcut.keys.every((k) => {
        const lower = k.toLowerCase();
        if (lower === 'ctrl') return ctrl;
        if (lower === 'escape') return key === 'escape';
        return key === lower;
      });

      if (match) {
        e.preventDefault();
        shortcut.action();
        return;
      }
    }
  }, [shortcuts, location.pathname, navigate]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      {/* Help Modal */}
      <AnimatePresence>
        {showHelp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowHelp(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass max-w-md w-full p-6 mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">
                  <span className="neon-text-cyan">⌨</span> Keyboard Shortcuts
                </h2>
                <button
                  onClick={() => setShowHelp(false)}
                  className="text-white/40 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-2">
                {shortcuts.map((s) => (
                  <div key={s.description} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <span className="text-sm text-white/60">{s.description}</span>
                    <div className="flex gap-1">
                      {s.keys.map((k) => (
                        <kbd key={k} className="px-2 py-0.5 text-xs font-mono rounded bg-glass-active text-neon-cyan border border-white/10">
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-white/20 font-mono mt-4 text-center">
                Press <kbd className="px-1.5 py-0.5 rounded bg-glass-active text-neon-cyan">?</kbd> anytime to show this
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
