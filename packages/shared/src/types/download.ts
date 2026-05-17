export type DownloadStatus = 'PENDING' | 'DOWNLOADING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type DownloadPriority = 'LOW' | 'NORMAL' | 'HIGH';

export interface DownloadJob {
  id: string;
  userId: string;
  modelId: string;
  modelName: string;
  status: DownloadStatus;
  priority: DownloadPriority;
  progress: number;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  totalSize: number | null;
  downloadedSize: number;
  speed: number | null;
  errorMessage: string | null;
  retryCount: number;
  maxRetries: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  media: DownloadMedia[];
  model?: {
    slug: string;
  };
}

export interface DownloadMedia {
  id: string;
  mediaId: string;
  downloadJobId: string;
  url: string;
  type: 'IMAGE' | 'VIDEO';
  status: DownloadStatus;
  progress: number;
  filePath: string | null;
  fileSize: number | null;
  downloadedSize?: number;
  speed?: number | null;
  errorMessage: string | null;
}
