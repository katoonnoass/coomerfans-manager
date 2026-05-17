import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { Response } from 'express';
import { prisma } from '../config/database';
import { env } from '../config/env';

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  Accept: '*/*',
  Referer: 'https://coomerfans.com/',
  Origin: 'https://coomerfans.com',
};

export interface IdmImportMediaItem {
  id: string;
  url: string;
}

function secret() {
  return process.env.JWT_SECRET || process.env.SESSION_SECRET || 'coomerfans-idm-import';
}

function signDownloadMediaId(id: string) {
  return crypto.createHmac('sha256', secret()).update(id).digest('hex').slice(0, 32);
}

function verifyDownloadMediaId(id: string, token: string) {
  const expected = signDownloadMediaId(id);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token || ''.padEnd(expected.length, '0').slice(0, expected.length)));
}

function publicBaseUrl() {
  return process.env.IDM_IMPORT_BASE_URL || `http://127.0.0.1:${process.env.PORT || env.PORT || 3001}`;
}

function resolveExtension(url: string, type?: string) {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (/^\.[a-z0-9]{2,6}$/.test(ext)) return ext;
  } catch {}
  return type === 'VIDEO' ? '.mp4' : '.jpg';
}

export function idmProxyUrl(downloadMediaId: string) {
  return `${publicBaseUrl()}/api/downloads/idm-proxy/${downloadMediaId}?token=${signDownloadMediaId(downloadMediaId)}`;
}

export function createIdmImportFiles(options: {
  jobId: string;
  modelName: string;
  downloadRoot?: string | null;
  media: IdmImportMediaItem[];
}) {
  const root = options.downloadRoot?.trim() || process.env.MEDIA_PATH || './media';
  const dir = path.join(path.resolve(root), '_idm_imports');
  fs.mkdirSync(dir, { recursive: true });
  const safeModel = options.modelName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const basename = `${safeModel}-${new Date().toISOString().replace(/[:.]/g, '-')}-${options.jobId}`;
  const lines = options.media.map((item) => idmProxyUrl(item.id));
  const content = `${lines.join('\r\n')}\r\n`;
  const ef2Path = path.join(dir, `${basename}.ef2`);
  const iefPath = path.join(dir, `${basename}.ief`);
  fs.writeFileSync(ef2Path, content, 'utf8');
  fs.writeFileSync(iefPath, content, 'utf8');
  return { ef2Path, iefPath, count: lines.length };
}

export async function streamIdmProxyDownload(downloadMediaId: string, token: string, res: Response) {
  if (!verifyDownloadMediaId(downloadMediaId, token)) {
    res.status(403).send('Invalid IDM token');
    return;
  }

  const row = await prisma.downloadMedia.findUnique({
    where: { id: downloadMediaId },
    include: { media: true, downloadJob: true },
  });

  if (!row) {
    res.status(404).send('Download media not found');
    return;
  }

  const sourceUrl = row.url || row.media.url;
  const filename = `${downloadMediaId}${resolveExtension(sourceUrl, row.type)}`;
  await proxySource(sourceUrl, filename, res, 0);
}

async function proxySource(sourceUrl: string, filename: string, res: Response, redirects: number) {
  if (redirects > 5) {
    res.status(508).send('Too many redirects');
    return;
  }

  const parsed = new URL(sourceUrl);
  const client = parsed.protocol === 'https:' ? https : http;
  const range = res.req.headers.range;

  await new Promise<void>((resolve) => {
    const req = client.request(
      parsed,
      {
        method: 'GET',
        timeout: 120000,
        headers: {
          ...REQUEST_HEADERS,
          ...(typeof range === 'string' ? { Range: range } : {}),
        },
      },
      (upstream) => {
        const status = upstream.statusCode || 502;
        const location = upstream.headers.location;

        if ([301, 302, 303, 307, 308].includes(status) && location) {
          upstream.resume();
          proxySource(new URL(location, sourceUrl).toString(), filename, res, redirects + 1).finally(resolve);
          return;
        }

        const headers: Record<string, string | number | string[]> = {};
        for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
          const value = upstream.headers[key];
          if (value !== undefined) headers[key] = value;
        }
        headers['content-disposition'] = `attachment; filename="${filename.replace(/"/g, '')}"`;

        res.writeHead(status, headers);
        upstream.pipe(res);
        upstream.on('end', resolve);
        upstream.on('error', () => {
          if (!res.headersSent) res.status(502);
          res.end();
          resolve();
        });
      }
    );

    req.on('timeout', () => req.destroy(new Error('Proxy upstream timeout')));
    req.on('error', (error) => {
      if (!res.headersSent) res.status(502).send(error.message);
      else res.end();
      resolve();
    });
    res.req.on('close', () => req.destroy());
    req.end();
  });
}
