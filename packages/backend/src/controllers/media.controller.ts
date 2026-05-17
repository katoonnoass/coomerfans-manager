import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { AuthRequest, GUEST_USER_ID } from '../middleware/auth.middleware';
import fs from 'fs';
import { getCachedMediaThumbnailPath } from '../services/media-thumbnail-cache.service';

function userId(req: AuthRequest) {
  return req.userId || GUEST_USER_ID;
}

export async function getSettings(req: AuthRequest, res: Response) {
  const settings = await prisma.userSetting.findUnique({
    where: { userId: userId(req) },
  });

  res.json(settings ?? {});
}

export async function updateSettings(req: AuthRequest, res: Response) {
  const updates = { ...req.body };
  if (updates.maxConcurrentDownloads !== undefined) {
    const value = Number(updates.maxConcurrentDownloads);
    updates.maxConcurrentDownloads = Number.isFinite(value)
      ? Math.max(1, Math.min(20, Math.round(value)))
      : 3;
  }
  if (updates.downloadSegments !== undefined) {
    const value = Number(updates.downloadSegments);
    updates.downloadSegments = Number.isFinite(value)
      ? Math.max(1, Math.min(16, Math.round(value)))
      : 16;
  }
  if (updates.downloadEngine !== undefined) {
    const engine = String(updates.downloadEngine).toUpperCase();
    updates.downloadEngine = engine === 'IDM' ? 'IDM' : 'NATIVE';
  }
  if (updates.idmMonitorMode !== undefined) {
    const mode = String(updates.idmMonitorMode).toUpperCase();
    updates.idmMonitorMode = mode === 'SEND_ONLY' || mode === 'IMPORT_FILE' ? mode : 'MONITOR';
  }
  if (updates.downloadMode !== undefined) {
    const mode = String(updates.downloadMode).toUpperCase();
    updates.downloadMode = mode === 'SAFE' || mode === 'TURBO' ? mode : 'AUTO';
  }

  const settings = await prisma.userSetting.upsert({
    where: { userId: userId(req) },
    create: { userId: userId(req), ...updates },
    update: updates,
  });

  res.json(settings);
}

export async function streamMedia(req: Request, res: Response) {
  const media = await prisma.media.findUnique({
    where: { id: req.params.mediaId },
  });

  if (!media || !media.storagePath) {
    res.status(404).json({ error: 'Media not available' });
    return;
  }

  const fs = await import('fs');
  const path = await import('path');
  const filePath = media.storagePath;

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;

    const stream = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': media.mimeType || 'video/mp4',
    });
    stream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': media.mimeType || 'video/mp4',
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

export async function getThumbnail(req: Request, res: Response) {
  const media = await prisma.media.findUnique({
    where: { id: req.params.mediaId },
  });

  if (!media) {
    res.status(404).json({ error: 'Thumbnail not available' });
    return;
  }

  if (media.thumbnailKey && fs.existsSync(media.thumbnailKey)) {
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.sendFile(media.thumbnailKey, { root: process.cwd() });
    return;
  }

  const cachedPath = await getCachedMediaThumbnailPath({
    id: media.id,
    type: media.type,
    url: media.url,
  });

  if (!cachedPath || !fs.existsSync(cachedPath)) {
    res.status(404).json({ error: 'Thumbnail not available' });
    return;
  }

  res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  res.type('image/webp');
  res.sendFile(cachedPath);
}
