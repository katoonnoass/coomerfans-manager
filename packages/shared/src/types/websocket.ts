export interface WsDownloadProgress {
  downloadJobId: string;
  downloadMediaId: string;
  mediaId: string;
  progress: number;
  downloadedSize: number;
  speed: number;
  status: string;
  fileSize?: number | null;
  jobProgress?: number;
  jobDownloadedSize?: number;
  jobTotalSize?: number | null;
  jobSpeed?: number;
}

export interface WsDownloadComplete {
  downloadJobId: string;
  downloadMediaId: string;
  mediaId: string;
  filePath: string;
  fileSize: number;
  completedItems?: number;
  failedItems?: number;
  progress?: number;
  status?: string;
  downloadedSize?: number;
  totalSize?: number | null;
  speed?: number;
}

export interface WsScrapeProgress {
  modelId: string;
  modelName: string;
  postsFound: number;
  mediaFound: number;
  status: 'scraping' | 'completed' | 'failed';
}

export type WsEventMap = {
  'download:progress': WsDownloadProgress;
  'download:complete': WsDownloadComplete;
  'download:job-update': { downloadJobId: string; status: string; progress: number };
  'scrape:progress': WsScrapeProgress;
  'notification': { title: string; message: string; type: 'info' | 'success' | 'error' };
};
