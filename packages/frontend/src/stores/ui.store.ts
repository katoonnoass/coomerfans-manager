import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  username: string | null;
  isAuthenticated: boolean;
  login: (access: string, refresh: string, userId: string, username: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: localStorage.getItem('accessToken') || 'guest-access',
  refreshToken: localStorage.getItem('refreshToken') || 'guest-refresh',
  userId: localStorage.getItem('userId') || 'guest',
  username: localStorage.getItem('username') || 'Local User',
  isAuthenticated: true,
  login: (access, refresh, id, username) => {
    localStorage.setItem('accessToken', access);
    localStorage.setItem('refreshToken', refresh);
    localStorage.setItem('userId', id);
    localStorage.setItem('username', username);
    set({ accessToken: access, refreshToken: refresh, userId: id, username, isAuthenticated: true });
  },
  logout: () => {
    set({ accessToken: 'guest-access', refreshToken: 'guest-refresh', userId: 'guest', username: 'Local User', isAuthenticated: true });
  },
}));
