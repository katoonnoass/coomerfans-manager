import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { queryKeys } from '../lib/query-keys';
import { useAuthStore } from '../stores/ui.store';

export function useAuth() {
  const { isAuthenticated, login: storeLogin, logout: storeLogout } = useAuthStore();

  const { data: user } = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: async () => {
      const { data } = await api.get('/auth/me');
      return data;
    },
    enabled: isAuthenticated,
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const { data } = await api.post('/auth/login', credentials);
      return data;
    },
    onSuccess: (data) => {
      storeLogin(data.accessToken, data.refreshToken, data.user.id, data.user.username);
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: { email: string; username: string; password: string }) => {
      const { data } = await api.post('/auth/register', credentials);
      return data;
    },
    onSuccess: (data) => {
      storeLogin(data.accessToken, data.refreshToken, data.user.id, data.user.username);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await api.post('/auth/logout');
    },
    onSuccess: () => {
      storeLogout();
    },
  });

  return {
    user,
    isAuthenticated,
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    logout: logoutMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    isRegistering: registerMutation.isPending,
    loginError: loginMutation.error,
    registerError: registerMutation.error,
  };
}

export function useFavorites(status?: string) {
  const queryClient = useQueryClient();

  const { data: favorites = [] } = useQuery({
    queryKey: [...queryKeys.favorites.list(), status || 'all'],
    queryFn: async () => {
      const { data } = await api.get('/favorites', {
        params: status && status !== 'ALL' ? { status } : undefined,
      });
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async (modelId: string) => {
      await api.post(`/favorites/${modelId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.favorites.all });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (modelId: string) => {
      await api.delete(`/favorites/${modelId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.favorites.all });
    },
  });

  const importCoomerMutation = useMutation({
    mutationFn: async (payload: { creators: unknown[] }) => {
      const { data } = await api.post('/favorites/import/coomer', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.favorites.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.models.all });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (params: { modelId: string; status: string }) => {
      const { data } = await api.patch(`/favorites/${params.modelId}/status`, { status: params.status });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.favorites.all });
    },
  });

  return {
    favorites,
    addFavorite: addMutation.mutate,
    removeFavorite: removeMutation.mutate,
    updateFavoriteDownloadStatus: updateStatusMutation.mutateAsync,
    importCoomerFavorites: importCoomerMutation.mutateAsync,
    isImportingCoomerFavorites: importCoomerMutation.isPending,
    isUpdatingFavoriteStatus: updateStatusMutation.isPending,
    isFavorited: (modelId: string) => favorites.some((f: any) => f.id === modelId),
  };
}

export function useDownloads() {
  const queryClient = useQueryClient();

  const { data: downloads = [] } = useQuery({
    queryKey: queryKeys.downloads.list(),
    queryFn: async () => {
      const { data } = await api.get('/downloads');
      return data;
    },
    refetchInterval: (query) => {
      const current = query.state.data as any[] | undefined;
      return current?.some((download) => ['PENDING', 'DOWNLOADING', 'PAUSED'].includes(download.status))
        ? 5000
        : false;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (params: { modelId: string; mediaIds: string[]; downloadPath?: string | null; priority?: 'LOW' | 'NORMAL' | 'HIGH' }) => {
      const { data } = await api.post('/downloads', params);
      return data;
    },
  });

  const createModelMutation = useMutation({
    mutationFn: async (params: { modelId: string; mediaType?: string; downloadPath?: string | null; onlyNotDownloaded?: boolean; priority?: 'LOW' | 'NORMAL' | 'HIGH' }) => {
      const { data } = await api.post(`/downloads/model/${params.modelId}`, params);
      return data;
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async (downloadId: string) => {
      const { data } = await api.post(`/downloads/${downloadId}/pause`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.downloads.all }),
  });

  const resumeMutation = useMutation({
    mutationFn: async (downloadId: string) => {
      const { data } = await api.post(`/downloads/${downloadId}/resume`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.downloads.all }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (downloadId: string) => {
      const { data } = await api.post(`/downloads/${downloadId}/cancel`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.downloads.all }),
  });

  const retryMutation = useMutation({
    mutationFn: async (downloadId: string) => {
      const { data } = await api.post(`/downloads/${downloadId}/retry`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.downloads.all }),
  });

  const retryAllFailedMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/downloads/retry-failed');
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.downloads.all }),
  });

  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.delete('/downloads/history');
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.downloads.all }),
  });

  return {
    downloads,
    createDownload: createMutation.mutateAsync,
    createModelDownload: createModelMutation.mutateAsync,
    pauseDownload: pauseMutation.mutateAsync,
    resumeDownload: resumeMutation.mutateAsync,
    cancelDownload: cancelMutation.mutateAsync,
    retryDownload: retryMutation.mutateAsync,
    retryAllFailedDownloads: retryAllFailedMutation.mutateAsync,
    clearDownloadHistory: clearHistoryMutation.mutateAsync,
    isCreating: createMutation.isPending || createModelMutation.isPending,
    isUpdatingDownload:
      pauseMutation.isPending
      || resumeMutation.isPending
      || cancelMutation.isPending
      || retryMutation.isPending
      || retryAllFailedMutation.isPending
      || clearHistoryMutation.isPending,
  };
}
