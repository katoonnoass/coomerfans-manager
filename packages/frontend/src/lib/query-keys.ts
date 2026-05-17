export const queryKeys = {
  models: {
    all: ['models'] as const,
    list: (params: Record<string, unknown>) => [...queryKeys.models.all, 'list', params] as const,
    detail: (slug: string) => [...queryKeys.models.all, 'detail', slug] as const,
    posts: (slug: string, page: number) => [...queryKeys.models.all, 'posts', slug, page] as const,
  },
  search: {
    all: ['search'] as const,
    query: (q: string, params?: Record<string, unknown>) => [...queryKeys.search.all, q, params] as const,
  },
  downloads: {
    all: ['downloads'] as const,
    list: () => [...queryKeys.downloads.all] as const,
    detail: (id: string) => [...queryKeys.downloads.all, id] as const,
  },
  favorites: {
    all: ['favorites'] as const,
    list: () => [...queryKeys.favorites.all] as const,
  },
  auth: {
    me: ['auth', 'me'] as const,
  },
  settings: {
    all: ['settings'] as const,
    get: () => [...queryKeys.settings.all] as const,
  },
} as const;
