import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../config/socket';
import { useAuthStore } from '../stores/ui.store';
import { useToastStore } from '../stores/toast.store';
import type { WsDownloadProgress, WsDownloadComplete } from '@coomerfans/shared';
import { queryKeys } from '../lib/query-keys';
import { formatBytes } from '../lib/utils';

export function useDownloadSocket() {
  const queryClient = useQueryClient();
  const { isAuthenticated, userId } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    if (!isAuthenticated) return;

    const socket = getSocket();

    socket.on('download:progress', (data: WsDownloadProgress) => {
      queryClient.setQueryData(queryKeys.downloads.list(), (old: any) => {
        if (!old) return old;
        return old.map((job: any) => {
          if (job.id === data.downloadJobId) {
            return {
              ...job,
              status: 'DOWNLOADING',
              downloadedSize: data.jobDownloadedSize ?? job.downloadedSize,
              totalSize: data.jobTotalSize ?? job.totalSize,
              speed: data.jobSpeed ?? job.speed,
              progress: data.jobProgress ?? (
                job.totalItems > 0
                  ? ((job.completedItems + (data.progress / 100)) / job.totalItems) * 100
                  : data.progress
              ),
              media: job.media.map((m: any) =>
                m.id === data.downloadMediaId || m.mediaId === data.mediaId
                  ? {
                      ...m,
                      progress: data.progress,
                      status: data.status,
                      fileSize: data.fileSize ?? m.fileSize,
                      downloadedSize: data.downloadedSize,
                      speed: data.speed,
                    }
                  : m
              ),
            };
          }
          return job;
        });
      });
    });

    socket.on('download:complete', (data: WsDownloadComplete) => {
      queryClient.setQueryData(queryKeys.downloads.list(), (old: any) => {
        if (!old) return old;
        return old.map((job: any) => {
          if (job.id === data.downloadJobId) {
            const total = job.totalItems;
            const completed = data.completedItems ?? Math.min(total, job.completedItems + 1);
            return {
              ...job,
              completedItems: completed,
              failedItems: data.failedItems ?? job.failedItems,
              downloadedSize: data.downloadedSize ?? job.downloadedSize,
              totalSize: data.totalSize ?? job.totalSize,
              speed: data.speed ?? job.speed,
              progress: data.progress ?? Math.round((completed / total) * 100),
              status: data.status ?? (completed >= total ? 'COMPLETED' : job.status),
              media: job.media.map((m: any) =>
                m.id === data.downloadMediaId || m.mediaId === data.mediaId
                  ? {
                      ...m,
                      status: 'COMPLETED',
                      progress: 100,
                      filePath: data.filePath,
                      fileSize: data.fileSize,
                      downloadedSize: data.fileSize,
                      speed: 0,
                    }
                  : m
              ),
            };
          }
          return job;
        });
      });

      addToast({
        title: 'Download Complete',
        message: `${formatBytes(data.fileSize)} downloaded`,
        type: 'download',
        duration: 4000,
      });

      queryClient.invalidateQueries({ queryKey: queryKeys.downloads.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.models.all });
    });

    socket.on('download:job-update', (data: { downloadJobId: string; status: string; progress: number }) => {
      queryClient.setQueryData(queryKeys.downloads.list(), (old: any) => {
        if (!old) return old;
        return old.map((job: any) =>
          job.id === data.downloadJobId
            ? { ...job, status: data.status, progress: data.progress }
            : job
        );
      });

      if (data.status === 'COMPLETED') {
        addToast({
          title: 'All Downloads Finished',
          message: `Job completed successfully`,
          type: 'success',
          duration: 4000,
        });
      }

      if (data.status === 'FAILED') {
        addToast({
          title: 'Download Failed',
          message: 'One or more downloads encountered an error',
          type: 'error',
          duration: 6000,
        });
      }
    });

    socket.on('notification', (data: { title: string; message: string; type: string }) => {
      addToast({
        title: data.title,
        message: data.message,
        type: data.type === 'error' ? 'error' : data.type === 'success' ? 'success' : 'info',
        duration: 4000,
      });

      if ('Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification(data.title, { body: data.message });
        } else if (Notification.permission === 'default') {
          Notification.requestPermission().then((permission) => {
            if (permission === 'granted') new Notification(data.title, { body: data.message });
          }).catch(() => {});
        }
      }
    });

    return () => {
      socket.off('download:progress');
      socket.off('download:complete');
      socket.off('download:job-update');
      socket.off('notification');
    };
  }, [isAuthenticated, userId, queryClient, addToast]);
}
