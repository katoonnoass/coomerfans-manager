import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'download';

export interface Toast {
  id: string;
  title: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  history: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  clearHistory: () => void;
}

let idCounter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  history: [],
  addToast: (toast) => {
    const id = `toast-${++idCounter}`;
    const entry = { ...toast, id };
    set((s) => ({ toasts: [...s.toasts, entry], history: [entry, ...s.history].slice(0, 100) }));
    const duration = toast.duration ?? 5000;
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clearHistory: () => set({ history: [] }),
}));
