import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';

export interface FileDownloadProgress {
  progress: number;
  downloadedBytes: number;
  totalBytes: number | null;
  speed: number;
}

export interface FileDownloadResult {
  filePath: string;
  fileSize: number;
  averageSpeed: number;
  totalBytes: number | null;
}

export interface DownloadToFileOptions {
  shouldContinue?: () => Promise<boolean> | boolean;
  keepPartialOnAbort?: boolean;
  segments?: number;
  mode?: 'SAFE' | 'AUTO' | 'TURBO';
  headers?: Record<string, string>;
  expectedType?: 'IMAGE' | 'VIDEO' | 'GIF';
  onDiagnostic?: (event: DownloadDiagnostic) => void;
}

export interface DownloadDiagnostic {
  phase: string;
  url: string;
  status?: number;
  contentType?: string;
  contentLength?: number | null;
  message?: string;
}

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  Accept: '*/*',
  Referer: 'https://coomerfans.com/',
};

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 30 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 30 });
const hostLimits = new Map<string, { active: number; cooldownUntil: number; failures: number }>();

function parseContentRangeTotal(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const total = raw?.match(/\/(\d+)$/)?.[1];
  return total ? Number.parseInt(total, 10) : null;
}

function removeIfExists(filePath: string) {
  if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
}

function headersFor(options: DownloadToFileOptions, extra: Record<string, string> = {}) {
  return { ...REQUEST_HEADERS, ...(options.headers || {}), ...extra };
}

function hostKey(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return 'unknown';
  }
}

function maxPerHost(options: DownloadToFileOptions) {
  if (options.mode === 'TURBO') return 4;
  if (options.mode === 'SAFE') return 1;
  return 2;
}

async function acquireHost(url: string, options: DownloadToFileOptions) {
  const key = hostKey(url);
  const limit = maxPerHost(options);
  for (;;) {
    const state = hostLimits.get(key) || { active: 0, cooldownUntil: 0, failures: 0 };
    const now = Date.now();
    if (state.cooldownUntil > now) {
      await sleep(Math.min(5000, state.cooldownUntil - now));
      continue;
    }
    if (state.active < limit) {
      state.active += 1;
      hostLimits.set(key, state);
      return () => {
        const current = hostLimits.get(key);
        if (!current) return;
        current.active = Math.max(0, current.active - 1);
        hostLimits.set(key, current);
      };
    }
    await sleep(250);
  }
}

function recordHostFailure(url: string, status?: number) {
  if (!status || ![403, 429, 500, 502, 503, 504].includes(status)) return;
  const key = hostKey(url);
  const state = hostLimits.get(key) || { active: 0, cooldownUntil: 0, failures: 0 };
  state.failures += 1;
  const base = status === 429 || status === 403 ? 30000 : 10000;
  state.cooldownUntil = Date.now() + Math.min(180000, base * state.failures);
  hostLimits.set(key, state);
}

function recordHostSuccess(url: string) {
  const key = hostKey(url);
  const state = hostLimits.get(key);
  if (!state) return;
  state.failures = Math.max(0, state.failures - 1);
  if (state.failures === 0) state.cooldownUntil = 0;
  hostLimits.set(key, state);
}

function assertValidDownloadedFile(filePath: string, options: DownloadToFileOptions, contentType?: string) {
  const stat = fs.statSync(filePath);
  if (stat.size <= 0) throw new Error('Downloaded file is empty');
  const header = Buffer.alloc(Math.min(512, stat.size));
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, header, 0, header.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  const sample = header.toString('utf8').trimStart().slice(0, 160).toLowerCase();
  if (sample.startsWith('<!doctype html') || sample.startsWith('<html') || sample.includes('<title>')) {
    throw new Error('Downloaded response is HTML, not media');
  }
  const ext = path.extname(filePath).toLowerCase();
  if (options.expectedType === 'IMAGE') {
    const looksImage = header[0] === 0xff && header[1] === 0xd8
      || header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47
      || header.toString('ascii', 0, 4) === 'RIFF'
      || header.toString('ascii', 0, 6).startsWith('GIF')
      || contentType?.startsWith('image/')
      || /\.(jpg|jpeg|png|webp|gif)$/i.test(ext);
    if (!looksImage) throw new Error(`Invalid image payload (${contentType || 'unknown content-type'})`);
  }
  if (options.expectedType === 'VIDEO') {
    const looksVideo = header.includes(Buffer.from('ftyp'))
      || header.toString('ascii', 0, 4) === 'RIFF'
      || contentType?.startsWith('video/')
      || contentType?.includes('octet-stream')
      || /\.(mp4|webm|mov|mkv|m4v)$/i.test(ext);
    if (!looksVideo) throw new Error(`Invalid video payload (${contentType || 'unknown content-type'})`);
  }
}

export function downloadToFile(
  url: string,
  filePath: string,
  onProgress: (progress: FileDownloadProgress) => void,
  options: DownloadToFileOptions = {},
  redirects = 0
): Promise<FileDownloadResult> {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('Too many redirects'));
      return;
    }

    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;
    const startedAt = Date.now();
    const tempPath = `${filePath}.part`;
    let existingBytes = fs.existsSync(tempPath) ? fs.statSync(tempPath).size : 0;
    let downloadedBytes = existingBytes;
    let totalBytes: number | null = null;
    let lastEmit = 0;
    let responseContentType: string | undefined;

    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    let output: fs.WriteStream | null = null;
    let abortedByControl = false;
    let request: http.ClientRequest;

    const cleanupPartial = () => {
      if (!options.keepPartialOnAbort && fs.existsSync(tempPath)) {
        fs.rmSync(tempPath, { force: true });
      }
    };

    const abortControlled = (message: string) => {
      abortedByControl = true;
      request.destroy(new Error(message));
    };

    acquireHost(url, options).then((releaseHost) => {
    request = client.get(
      parsed,
      {
        timeout: 120000,
        agent: isHttps ? httpsAgent : httpAgent,
        headers: headersFor(options, existingBytes > 0 ? { Range: `bytes=${existingBytes}-` } : {}),
      },
      (response) => {
        const status = response.statusCode || 0;
        const location = response.headers.location;
        responseContentType = String(response.headers['content-type'] || '');
        options.onDiagnostic?.({
          phase: 'native-response',
          url,
          status,
          contentType: responseContentType,
          contentLength: Number(response.headers['content-length']) || null,
        });

        if ([301, 302, 303, 307, 308].includes(status) && location) {
          response.resume();
          const redirectUrl = new URL(location, url).toString();
          downloadToFile(redirectUrl, filePath, onProgress, options, redirects + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (status < 200 || status >= 300) {
          response.resume();
          recordHostFailure(url, status);
          reject(new Error(`HTTP ${status}`));
          return;
        }

        const lengthHeader = response.headers['content-length'];
        const parsedLength = Array.isArray(lengthHeader) ? lengthHeader[0] : lengthHeader;
        const length = Number.parseInt(parsedLength || '0', 10);
        if (existingBytes > 0 && status === 206) {
          totalBytes = Number.isFinite(length) && length > 0 ? existingBytes + length : null;
        } else {
          existingBytes = 0;
          downloadedBytes = 0;
          if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
          totalBytes = Number.isFinite(length) && length > 0 ? length : null;
        }

        output = fs.createWriteStream(tempPath, { flags: status === 206 ? 'a' : 'w' });

        const emitProgress = (force = false) => {
          const now = Date.now();
          if (!force && now - lastEmit < 1000) return;
          lastEmit = now;
          const elapsedSeconds = Math.max(0.001, (now - startedAt) / 1000);
          const progress = totalBytes
            ? Math.min(99, Math.round((downloadedBytes / totalBytes) * 100))
            : 0;

          onProgress({
            progress,
            downloadedBytes,
            totalBytes,
            speed: downloadedBytes / elapsedSeconds,
          });
        };

        response.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          if (!output?.write(chunk)) {
            response.pause();
            output?.once('drain', () => response.resume());
          }
          emitProgress();

          if (options.shouldContinue) {
            response.pause();
            Promise.resolve(options.shouldContinue())
              .then((allowed) => {
                if (!allowed) {
                  abortControlled('Download paused or cancelled');
                  return;
                }
                response.resume();
              })
              .catch((error) => abortControlled(error?.message || 'Download interrupted'));
          }
        });

        response.on('end', () => {
          output?.end(() => {
            try {
              if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
              fs.renameSync(tempPath, filePath);
              assertValidDownloadedFile(filePath, options, responseContentType);
              const elapsedSeconds = Math.max(0.001, (Date.now() - startedAt) / 1000);
              onProgress({
                progress: 100,
                downloadedBytes,
                totalBytes,
                speed: downloadedBytes / elapsedSeconds,
              });
              recordHostSuccess(url);
              resolve({
                filePath,
                fileSize: downloadedBytes,
                averageSpeed: downloadedBytes / elapsedSeconds,
                totalBytes,
              });
            } catch (error) {
              reject(error);
            }
          });
        });

        response.on('aborted', () => {
          output?.destroy();
          cleanupPartial();
          reject(new Error('Download aborted'));
        });

        response.on('error', (error) => {
          output?.destroy();
          cleanupPartial();
          reject(error);
        });
      }
    );

    request.on('timeout', () => request.destroy(new Error('Download timeout')));
    request.on('error', (error) => {
      cleanupPartial();
      reject(abortedByControl ? new Error(error.message) : error);
    });
    request.on('close', releaseHost);
    }).catch(reject);
  });
}

async function probeRange(url: string) {
  return new Promise<{ totalBytes: number | null; supportsRanges: boolean; finalUrl: string }>((resolve) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;
    const req = client.get(
      parsed,
      {
        timeout: 20000,
        agent: isHttps ? httpsAgent : httpAgent,
        headers: headersFor({}, { Range: 'bytes=0-0' }),
      },
      (response) => {
        const status = response.statusCode || 0;
        const location = response.headers.location;
        if ([301, 302, 303, 307, 308].includes(status) && location) {
          response.resume();
          resolve(probeRange(new URL(location, url).toString()));
          return;
        }
        const totalBytes = parseContentRangeTotal(response.headers['content-range'])
          || Number.parseInt(String(response.headers['content-length'] || ''), 10)
          || null;
        response.resume();
        resolve({ totalBytes, supportsRanges: status === 206 && Boolean(totalBytes), finalUrl: url });
      }
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve({ totalBytes: null, supportsRanges: false, finalUrl: url }));
  });
}

export async function downloadToFileSegmented(
  url: string,
  filePath: string,
  onProgress: (progress: FileDownloadProgress) => void,
  options: DownloadToFileOptions = {}
): Promise<FileDownloadResult> {
  const maxSegments = options.mode === 'TURBO' ? 8 : options.mode === 'SAFE' ? 2 : 4;
  const requestedSegments = Math.max(1, Math.min(maxSegments, Number(options.segments || maxSegments)));
  if (requestedSegments <= 1) return downloadToFile(url, filePath, onProgress, options);

  const probe = await probeRange(url);
  if (!probe.supportsRanges || !probe.totalBytes || probe.totalBytes < 20 * 1024 * 1024) {
    return downloadToFile(url, filePath, onProgress, options);
  }

  const totalBytes = probe.totalBytes;
  const segmentCount = Math.min(requestedSegments, Math.ceil(totalBytes / (8 * 1024 * 1024)));
  const segmentSize = Math.ceil(totalBytes / segmentCount);
  const startedAt = Date.now();
  const tempPath = `${filePath}.part`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const segments = Array.from({ length: segmentCount }, (_, index) => {
    const start = index * segmentSize;
    const end = Math.min(totalBytes - 1, start + segmentSize - 1);
    const partPath = `${tempPath}.${index}`;
    const existing = fs.existsSync(partPath) ? Math.min(fs.statSync(partPath).size, end - start + 1) : 0;
    return { index, start, end, partPath, downloaded: existing };
  });

  let lastEmit = 0;
  const currentDownloaded = () => segments.reduce((sum, segment) => sum + segment.downloaded, 0);
  const emitProgress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastEmit < 1000) return;
    lastEmit = now;
    const downloadedBytes = currentDownloaded();
    const elapsedSeconds = Math.max(0.001, (now - startedAt) / 1000);
    onProgress({
      progress: Math.min(99, Math.round((downloadedBytes / totalBytes) * 100)),
      downloadedBytes,
      totalBytes,
      speed: downloadedBytes / elapsedSeconds,
    });
  };

  await Promise.all(segments.map((segment) => downloadSegmentWithRetry(probe.finalUrl, segment, options, emitProgress)));

  removeIfExists(tempPath);
  const output = fs.createWriteStream(tempPath);
  output.setMaxListeners(segmentCount + 5);
  for (const segment of segments) {
    await new Promise<void>((resolve, reject) => {
      const input = fs.createReadStream(segment.partPath);
      input.on('error', reject);
      output.on('error', reject);
      input.on('end', resolve);
      input.pipe(output, { end: false });
    });
  }
  await new Promise<void>((resolve) => output.end(resolve));
  removeIfExists(filePath);
  fs.renameSync(tempPath, filePath);
  assertValidDownloadedFile(filePath, options);
  for (const segment of segments) removeIfExists(segment.partPath);

  const elapsedSeconds = Math.max(0.001, (Date.now() - startedAt) / 1000);
  onProgress({ progress: 100, downloadedBytes: totalBytes, totalBytes, speed: totalBytes / elapsedSeconds });
  return { filePath, fileSize: totalBytes, averageSpeed: totalBytes / elapsedSeconds, totalBytes };
}

async function downloadSegmentWithRetry(
  url: string,
  segment: { index: number; start: number; end: number; partPath: string; downloaded: number },
  options: DownloadToFileOptions,
  emitProgress: () => void
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await downloadSegment(url, segment, options, emitProgress);
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/HTTP 50[234]|timeout|aborted|ECONNRESET|incomplete/i.test(message) || attempt === 3) break;
      await sleep(1000 * attempt);
    }
  }
  throw lastError;
}

function downloadSegment(
  url: string,
  segment: { index: number; start: number; end: number; partPath: string; downloaded: number },
  options: DownloadToFileOptions,
  emitProgress: () => void
) {
  return new Promise<void>((resolve, reject) => {
    const expectedSize = segment.end - segment.start + 1;
    if (segment.downloaded >= expectedSize) {
      resolve();
      return;
    }

    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;
    let request: http.ClientRequest;
    let output: fs.WriteStream | null = null;

    const abortControlled = (message: string) => request.destroy(new Error(message));
    const rangeStart = segment.start + segment.downloaded;

    request = client.get(
      parsed,
      {
        timeout: 120000,
        agent: isHttps ? httpsAgent : httpAgent,
        headers: headersFor(options, { Range: `bytes=${rangeStart}-${segment.end}` }),
      },
      (response) => {
        const status = response.statusCode || 0;
        options.onDiagnostic?.({
          phase: `segment-${segment.index}`,
          url,
          status,
          contentType: String(response.headers['content-type'] || ''),
          contentLength: Number(response.headers['content-length']) || null,
        });
        if (status !== 206) {
          response.resume();
          recordHostFailure(url, status);
          reject(new Error(`Segment ${segment.index} HTTP ${status}`));
          return;
        }

        output = fs.createWriteStream(segment.partPath, { flags: segment.downloaded > 0 ? 'a' : 'w' });
        response.on('data', (chunk: Buffer) => {
          segment.downloaded += chunk.length;
          if (!output?.write(chunk)) {
            response.pause();
            output?.once('drain', () => response.resume());
          }
          emitProgress();

          if (options.shouldContinue) {
            response.pause();
            Promise.resolve(options.shouldContinue())
              .then((allowed) => allowed ? response.resume() : abortControlled('Download paused or cancelled'))
              .catch((error) => abortControlled(error?.message || 'Download interrupted'));
          }
        });
        response.on('end', () => {
          output?.end(() => {
            if (segment.downloaded >= expectedSize) resolve();
            else reject(new Error(`Segment ${segment.index} incomplete`));
          });
        });
        response.on('error', (error) => {
          output?.destroy();
          reject(error);
        });
      }
    );

    request.on('timeout', () => request.destroy(new Error(`Segment ${segment.index} timeout`)));
    request.on('error', reject);
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
