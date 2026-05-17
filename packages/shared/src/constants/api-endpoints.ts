export const API = {
  AUTH: {
    LOGIN: '/api/auth/login',
    REGISTER: '/api/auth/register',
    REFRESH: '/api/auth/refresh',
    LOGOUT: '/api/auth/logout',
    ME: '/api/auth/me',
  },
  MODELS: {
    LIST: '/api/models',
    DETAIL: (slug: string) => `/api/models/${slug}`,
    POSTS: (slug: string) => `/api/models/${slug}/posts`,
    SCRAPE: (slug: string) => `/api/models/${slug}/scrape`,
    SCRAPE_STATUS: (slug: string) => `/api/models/${slug}/scrape`,
  },
  SEARCH: {
    QUERY: '/api/search',
  },
  DOWNLOADS: {
    LIST: '/api/downloads',
    CREATE: '/api/downloads',
    DETAIL: (id: string) => `/api/downloads/${id}`,
    CANCEL: (id: string) => `/api/downloads/${id}/cancel`,
    RETRY: (id: string) => `/api/downloads/${id}/retry`,
  },
  FAVORITES: {
    LIST: '/api/favorites',
    ADD: (modelId: string) => `/api/favorites/${modelId}`,
    REMOVE: (modelId: string) => `/api/favorites/${modelId}`,
  },
  MEDIA: {
    STREAM: (mediaId: string) => `/api/media/${mediaId}/stream`,
    THUMBNAIL: (mediaId: string) => `/api/media/${mediaId}/thumbnail`,
  },
  SETTINGS: {
    GET: '/api/settings',
    UPDATE: '/api/settings',
  },
  HEALTH: '/api/health',
} as const;
