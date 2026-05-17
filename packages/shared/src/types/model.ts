export type ServiceType = 'onlyfans' | 'fansly' | 'patreon' | 'other';

export interface ModelProfile {
  id: string;
  externalId: string;
  service: ServiceType;
  name: string;
  slug: string;
  description: string | null;
  thumbnailUrl: string | null;
  bannerUrl: string | null;
  postCount: number;
  mediaCount: number;
  likesCount: number;
  isVerified: boolean;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
  lastScrapedAt: string | null;
  createdAt: string;
  updatedAt: string;
  favoriteDownloadStatus?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED_WAITING_UPDATES';
}

export interface ModelPost {
  id: string;
  externalId: string;
  modelId: string;
  title: string | null;
  description: string | null;
  postedAt: string | null;
  scrapedAt: string;
  metadata: Record<string, unknown> | null;
  media: MediaItem[];
}

export type MediaType = 'IMAGE' | 'VIDEO' | 'GIF' | 'AUDIO';

export interface MediaItem {
  id: string;
  postId: string;
  type: MediaType;
  url: string;
  thumbnailKey: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  mimeType: string | null;
  quality: VideoQuality | null;
  isDownloaded: boolean;
  createdAt: string;
}

export type VideoQuality = 'SD' | 'HD' | 'FHD' | 'MAX';

export interface ModelWithPosts extends ModelProfile {
  posts: ModelPost[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
