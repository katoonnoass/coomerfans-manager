import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import https from 'https';
import http from 'http';
import { AddressInfo } from 'net';

const IDM_CANDIDATES = [
  process.env.IDM_PATH,
  'C:\\Program Files (x86)\\Internet Download Manager\\IDMan.exe',
  'C:\\Program Files\\Internet Download Manager\\IDMan.exe',
].filter(Boolean) as string[];

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  Accept: '*/*',
  Referer: 'https://coomerfans.com/',
  Origin: 'https://coomerfans.com',
};

export interface IdmDownloadResult {
  filePath: string;
  fileSize: number;
  averageSpeed: number;
}

export function isIdmAvailable() {
  return Boolean(findIdmPath());
}

export async function enqueueIdmDownload(
  url: string,
  filePath: string,
  onProgress?: (progress: { progress: number; downloadedBytes: number; totalBytes: number | null; speed: number }) => void,
  options: { timeoutMs?: number; stableMs?: number; monitor?: boolean; shouldContinue?: () => Promise<boolean> } = {}
): Promise<IdmDownloadResult> {
  const idmPath = findIdmPath();
  if (!idmPath) {
    throw new Error('IDM not found. Install IDM or set IDM_PATH.');
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const proxy = await createIdmProxy(url);
  const args = [
    '/d',
    proxy.url,
    '/p',
    path.dirname(filePath),
    '/f',
    path.basename(filePath),
    '/n',
    '/s',
  ];

  try {
    await new Promise<void>((resolve, reject) => {
      execFile(idmPath, args, { windowsHide: true }, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    if (options.monitor === false) {
      return {
        filePath,
        fileSize: 0,
        averageSpeed: 0,
      };
    }

    return await monitorIdmFile(proxy.url, filePath, onProgress, options);
  } finally {
    proxy.close();
  }
}

function findIdmPath() {
  return IDM_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || null;
}

async function monitorIdmFile(
  url: string,
  filePath: string,
  onProgress?: (progress: { progress: number; downloadedBytes: number; totalBytes: number | null; speed: number }) => void,
  options: { timeoutMs?: number; stableMs?: number; shouldContinue?: () => Promise<boolean> } = {}
) {
  const totalBytes = await resolveContentLength(url);
  const timeoutMs = options.timeoutMs ?? 12 * 60 * 60 * 1000;
  const stableMs = options.stableMs ?? 5000;
  const noActivityMs = 30000;
  const startedAt = Date.now();
  let lastSize = 0;
  let lastTick = Date.now();
  let stableSince = 0;
  let lastActivityAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (options.shouldContinue && !(await options.shouldContinue())) {
      throw new Error('Download paused or cancelled');
    }

    const size = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    const now = Date.now();
    const elapsedSeconds = Math.max((now - lastTick) / 1000, 0.001);
    const speed = Math.max(0, (size - lastSize) / elapsedSeconds);
    const progress = totalBytes && totalBytes > 0 ? Math.min(100, (size / totalBytes) * 100) : 0;
    onProgress?.({ progress, downloadedBytes: size, totalBytes, speed });

    if (size > 0 && totalBytes && size >= totalBytes) {
      return {
        filePath,
        fileSize: size,
        averageSpeed: size / Math.max((now - startedAt) / 1000, 1),
      };
    }

    if (size > 0 && size === lastSize) {
      stableSince ||= now;
      if (!totalBytes && now - stableSince >= stableMs) {
        return {
          filePath,
          fileSize: size,
          averageSpeed: size / Math.max((now - startedAt) / 1000, 1),
        };
      }
    } else {
      stableSince = 0;
      if (size > lastSize) lastActivityAt = now;
    }

    if (size === 0 && now - lastActivityAt >= noActivityMs) {
      throw new Error('IDM did not start writing the file');
    }

    lastSize = size;
    lastTick = now;
    await sleep(1000);
  }

  throw new Error('IDM download timeout');
}

function resolveContentLength(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const client = url.startsWith('https:') ? https : http;
    const request = client.request(url, { method: 'HEAD', timeout: 10000 }, (response) => {
      const length = Number(response.headers['content-length']);
      resolve(Number.isFinite(length) && length > 0 ? length : null);
      response.resume();
    });
    request.on('timeout', () => {
      request.destroy();
      resolve(null);
    });
    request.on('error', () => resolve(null));
    request.end();
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createIdmProxy(sourceUrl: string) {
  const server = http.createServer((clientReq, clientRes) => {
    if (!clientReq.url?.startsWith('/download')) {
      clientRes.writeHead(404);
      clientRes.end();
      return;
    }

    proxyRequest(sourceUrl, clientReq, clientRes, 0).catch((error) => {
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
      }
      clientRes.end(error?.message || 'proxy failed');
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}/download`,
    close: () => server.close(),
  };
}

async function proxyRequest(
  sourceUrl: string,
  clientReq: http.IncomingMessage,
  clientRes: http.ServerResponse,
  redirects: number
) {
  if (redirects > 5) throw new Error('Too many redirects');

  const parsed = new URL(sourceUrl);
  const upstreamClient = parsed.protocol === 'https:' ? https : http;
  const range = clientReq.headers.range;

  await new Promise<void>((resolve, reject) => {
    const upstreamReq = upstreamClient.request(
      parsed,
      {
        method: clientReq.method === 'HEAD' ? 'HEAD' : 'GET',
        timeout: 120000,
        headers: {
          ...REQUEST_HEADERS,
          ...(typeof range === 'string' ? { Range: range } : {}),
        },
      },
      (upstreamRes) => {
        const status = upstreamRes.statusCode || 502;
        const location = upstreamRes.headers.location;

        if ([301, 302, 303, 307, 308].includes(status) && location) {
          upstreamRes.resume();
          proxyRequest(new URL(location, sourceUrl).toString(), clientReq, clientRes, redirects + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        const headers: Record<string, string | number | string[]> = {};
        for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
          const value = upstreamRes.headers[key];
          if (value !== undefined) headers[key] = value;
        }

        clientRes.writeHead(status, headers);
        if (clientReq.method === 'HEAD') {
          upstreamRes.resume();
          clientRes.end();
          resolve();
          return;
        }

        upstreamRes.pipe(clientRes);
        upstreamRes.on('end', resolve);
        upstreamRes.on('error', reject);
      }
    );

    upstreamReq.on('timeout', () => upstreamReq.destroy(new Error('Proxy upstream timeout')));
    upstreamReq.on('error', reject);
    clientReq.on('close', () => upstreamReq.destroy());
    upstreamReq.end();
  });
}
