import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { queryKeys } from '../lib/query-keys';
import { queryClient } from '../config/query-client';
import type { PaginatedResponse, ModelProfile, ModelPost } from '@coomerfans/shared';

export const MODEL_POSTS_PAGE_SIZE = 24;

type RefreshModelPostsResult = {
  slug: string;
  name: string;
  status?: 'running' | 'completed' | 'failed';
  currentPage?: number;
  maxPages?: number;
  page?: number;
  pagesChecked: number;
  hasMorePages: boolean;
  postsImported: number;
  mediaImported: number;
  postsInDatabase: number;
  mediaCount: number;
  postCount: number;
  lastScrapedAt: string | null;
  mode?: 'FAST' | 'FULL';
  pageLogs?: Array<{
    page: number;
    ms: number;
    postsImported: number;
    mediaImported: number;
    status: 'ok' | 'skipped' | 'failed';
    error?: string;
  }>;
};

type RefreshModelPostPageResult = Omit<RefreshModelPostsResult, 'pagesChecked'> & {
  page: number;
};

export function modelPostsQueryKey(slug: string, page: number, mediaType = 'all') {
  return [...queryKeys.models.posts(slug, page), mediaType] as const;
}

export async function fetchModelPosts(slug: string, page: number, mediaType = 'all') {
  const { data } = await api.get(`/models/${slug}/posts`, {
    params: { page, pageSize: MODEL_POSTS_PAGE_SIZE, mediaType },
  });
  return data as PaginatedResponse<ModelPost>;
}

export function useModels(filters?: { service?: string; content?: string; sort?: string; q?: string }) {
  const service = filters?.service;
  return useInfiniteQuery<PaginatedResponse<ModelProfile>>({
    queryKey: queryKeys.models.list({
      service: service || 'all',
      content: filters?.content || 'all',
      sort: filters?.sort || 'updated',
      q: filters?.q || '',
    }),
    queryFn: async ({ pageParam = 1 }) => {
      const { data } = await api.get('/models', {
        params: { page: pageParam, pageSize: 40, ...filters },
      });
      return data;
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    initialPageParam: 1,
  });
}

export function useModel(slug: string) {
  return useQuery({
    queryKey: queryKeys.models.detail(slug),
    queryFn: async () => {
      const { data } = await api.get(`/models/${slug}`);
      queryClient.prefetchQuery({
        queryKey: modelPostsQueryKey(slug, 1, 'all'),
        queryFn: () => fetchModelPosts(slug, 1, 'all'),
        staleTime: 30 * 60_000,
        gcTime: 60 * 60_000,
      });
      return data as ModelProfile;
    },
    enabled: !!slug,
  });
}

export function useModelPosts(slug: string, page: number = 1) {
  return useFilteredModelPosts(slug, page, 'all');
}

export function useFilteredModelPosts(slug: string, page: number = 1, mediaType = 'all') {
  return useQuery({
    queryKey: modelPostsQueryKey(slug, page, mediaType),
    queryFn: () => fetchModelPosts(slug, page, mediaType),
    enabled: !!slug,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
  });
}

export function useRefreshModelPosts(slug: string) {
  const queryClient = useQueryClient();

  return useMutation<RefreshModelPostsResult, Error, number | { pages?: number; mode?: 'FAST' | 'FULL' } | undefined>({
    mutationFn: async (params = 50) => {
      const payload = typeof params === 'number' ? { pages: params, mode: 'FAST' } : { pages: params?.pages || 50, mode: params?.mode || 'FAST' };
      const { data } = await api.post(`/models/${slug}/refresh`, payload);
      return data as RefreshModelPostsResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.models.all });
    },
  });
}

export function useRefreshModelPostPage(slug: string) {
  return useMutation<RefreshModelPostPageResult, Error, number>({
    mutationFn: async (page) => {
      const { data } = await api.post(`/models/${slug}/refresh-page`, { page });
      return data as RefreshModelPostPageResult;
    },
  });
}
