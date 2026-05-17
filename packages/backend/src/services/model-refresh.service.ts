import { EventEmitter } from 'events';
import { prisma } from '../config/database';
import { scrapeProfilePosts } from '../scrapers/coomerfans.scraper';

export type ModelRefreshStatus = 'running' | 'completed' | 'failed';
export type ModelRefreshMode = 'FAST' | 'FULL';

export interface ModelRefreshPageLog {
  page: number;
  ms: number;
  postsImported: number;
  mediaImported: number;
  status: 'ok' | 'skipped' | 'failed';
  error?: string;
}

export interface ModelRefreshProgress {
  runId?: string;
  slug: string;
  status: ModelRefreshStatus;
  currentPage: number;
  pagesChecked: number;
  maxPages: number;
  hasMorePages: boolean;
  postsImported: number;
  mediaImported: number;
  postCount: number;
  mediaCount: number;
  lastScrapedAt: string | null;
  mode?: ModelRefreshMode;
  pageLogs?: ModelRefreshPageLog[];
  error?: string;
}

const refreshEvents = new EventEmitter();
const activeRefreshes = new Map<string, ModelRefreshProgress>();
const activeControllers = new Map<string, AbortController>();

refreshEvents.setMaxListeners(100);

export function onModelRefreshProgress(listener: (progress: ModelRefreshProgress) => void) {
  refreshEvents.on('progress', listener);
  return () => refreshEvents.off('progress', listener);
}

export function getModelRefresh(slug: string) {
  return activeRefreshes.get(slug) || null;
}

export function startModelRefresh(slug: string, maxPages: number, mode: ModelRefreshMode = 'FAST') {
  const existing = activeRefreshes.get(slug);
  if (existing?.status === 'running') return existing;

  const controller = new AbortController();
  activeControllers.set(slug, controller);
  const initial: ModelRefreshProgress = {
    slug,
    status: 'running',
    currentPage: 1,
    pagesChecked: 0,
    maxPages,
    hasMorePages: true,
    postsImported: 0,
    mediaImported: 0,
    postCount: 0,
    mediaCount: 0,
    lastScrapedAt: null,
    mode,
    pageLogs: [],
  };

  activeRefreshes.set(slug, initial);
  refreshEvents.emit('progress', initial);
  runModelRefresh(slug, maxPages, mode, controller).catch(() => undefined);
  return initial;
}

export function stopModelRefresh(slug: string, reason: 'cancelled' | 'paused' = 'cancelled') {
  const controller = activeControllers.get(slug);
  if (!controller) return null;
  controller.abort(reason);
  const current = activeRefreshes.get(slug);
  if (current) {
    const stopped = {
      ...current,
      status: 'failed' as const,
      active: false,
      error: reason === 'paused' ? 'Varredura pausada' : 'Varredura cancelada',
    };
    activeRefreshes.set(slug, stopped);
    refreshEvents.emit('progress', stopped);
    return stopped;
  }
  return null;
}

async function currentCounts(slug: string) {
  const model = await prisma.model.findUnique({
    where: { slug },
    select: {
      postCount: true,
      mediaCount: true,
      lastScrapedAt: true,
      _count: { select: { posts: true } },
    },
  });

  if (!model) throw new Error('Model not found');

  return {
    postCount: model.postCount || model._count.posts,
    mediaCount: model.mediaCount,
    lastScrapedAt: model.lastScrapedAt?.toISOString() ?? null,
  };
}

async function emitProgress(progress: ModelRefreshProgress) {
  activeRefreshes.set(progress.slug, progress);
  refreshEvents.emit('progress', progress);
}

async function runModelRefresh(slug: string, maxPages: number, mode: ModelRefreshMode, controller: AbortController) {
  let totalPostsImported = 0;
  let totalMediaImported = 0;
  let pagesChecked = 0;
  let hasMorePages = true;
  let runId: string | undefined;
  let consecutivePageFailures = 0;
  const pageErrors: string[] = [];
  const pageLogs: ModelRefreshPageLog[] = [];
  let emptyPages = 0;

  try {
    const initialModel = await prisma.model.findUnique({
      where: { slug },
      select: { id: true, postCount: true, mediaCount: true },
    });
    if (!initialModel) throw new Error('Model not found');

    const latestIncompleteRun = await prisma.syncRun.findFirst({
      where: {
        slug,
        status: { in: ['FAILED', 'RUNNING'] },
        pagesChecked: { lt: maxPages },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        pagesChecked: true,
        postsImported: true,
        mediaImported: true,
        errorMessage: true,
      },
    });
    const startPage = Math.max(1, Math.min(maxPages, (latestIncompleteRun?.pagesChecked || 0) + 1));
    pagesChecked = startPage - 1;
    if (latestIncompleteRun?.errorMessage) pageErrors.push(latestIncompleteRun.errorMessage);

    const run = await prisma.syncRun.create({
      data: {
        modelId: initialModel.id,
        slug,
        status: 'RUNNING',
        mode: 'INCREMENTAL',
        currentPage: startPage,
        pagesChecked,
        maxPages,
        postsBefore: initialModel.postCount,
        mediaBefore: initialModel.mediaCount,
        postsAfter: initialModel.postCount,
        mediaAfter: initialModel.mediaCount,
      },
    });
    runId = run.id;

    for (let page = startPage; page <= maxPages; page += 1) {
      const beforeCounts = await currentCounts(slug);
      await emitProgress({
        runId,
        slug,
        status: 'running',
        currentPage: page,
        pagesChecked,
        maxPages,
        hasMorePages,
        postsImported: totalPostsImported,
        mediaImported: totalMediaImported,
        mode,
        pageLogs,
        ...beforeCounts,
      });

      let result: Awaited<ReturnType<typeof scrapeProfilePosts>> | null = null;
      let pageError: string | null = null;
      const pageStartedAt = Date.now();
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          result = await withTimeout(
            (signal) => scrapeProfilePosts(slug, page, {
              signal: AbortSignal.any([signal, controller.signal]),
              mode,
            } as any),
            mode === 'FULL' ? 120000 : 45000,
            `Timeout ao verificar pagina ${page}`
          );
          pageError = null;
          break;
        } catch (error) {
          pageError = error instanceof Error ? error.message : String(error);
          if (attempt < 2) await sleep(1500);
        }
      }

      pagesChecked = page;
      if (result) {
        hasMorePages = result.hasNext;
        totalPostsImported += result.postsImported;
        totalMediaImported += result.mediaImported;
        consecutivePageFailures = 0;
        emptyPages = result.postsImported === 0 && result.mediaImported === 0 ? emptyPages + 1 : 0;
        pageLogs.push({
          page,
          ms: Date.now() - pageStartedAt,
          postsImported: result.postsImported,
          mediaImported: result.mediaImported,
          status: 'ok',
        });
      } else {
        consecutivePageFailures += 1;
        pageErrors.push(pageError || `Falha ao verificar pagina ${page}`);
        pageLogs.push({
          page,
          ms: Date.now() - pageStartedAt,
          postsImported: 0,
          mediaImported: 0,
          status: 'failed',
          error: pageError || `Falha ao verificar pagina ${page}`,
        });
        if (consecutivePageFailures >= 3) throw new Error(pageErrors.slice(-3).join(' | '));
      }

      const counts = await currentCounts(slug);
      await prisma.syncRun.update({
        where: { id: runId },
        data: {
          currentPage: page,
          pagesChecked,
          postsImported: totalPostsImported,
          mediaImported: totalMediaImported,
          postsAfter: counts.postCount,
          mediaAfter: counts.mediaCount,
          errorMessage: pageErrors.length ? pageErrors.slice(-5).join(' | ') : null,
        },
      });
      await emitProgress({
        runId,
        slug,
        status: 'running',
        currentPage: page,
        pagesChecked,
        maxPages,
        hasMorePages,
        postsImported: totalPostsImported,
        mediaImported: totalMediaImported,
        mode,
        pageLogs: pageLogs.slice(-25),
        error: pageError || (pageErrors.length ? pageErrors.slice(-1)[0] : undefined),
        ...counts,
      });

      if (mode === 'FAST' && emptyPages >= 3 && page >= startPage + 2) {
        hasMorePages = false;
        break;
      }
      if (!hasMorePages) break;
    }

    const counts = await currentCounts(slug);
    if (runId) {
      await prisma.syncRun.update({
        where: { id: runId },
        data: {
          status: 'COMPLETED',
          currentPage: pagesChecked,
          pagesChecked,
          postsImported: totalPostsImported,
          mediaImported: totalMediaImported,
          postsAfter: counts.postCount,
          mediaAfter: counts.mediaCount,
          completedAt: new Date(),
        },
      });
    }
    await emitProgress({
      runId,
      slug,
      status: 'completed',
      currentPage: pagesChecked,
      pagesChecked,
      maxPages,
      hasMorePages,
      postsImported: totalPostsImported,
      mediaImported: totalMediaImported,
      mode,
      pageLogs: pageLogs.slice(-25),
      ...counts,
    });
  } catch (error) {
    if (runId) {
      await prisma.syncRun.update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          currentPage: pagesChecked,
          pagesChecked,
          postsImported: totalPostsImported,
          mediaImported: totalMediaImported,
          errorMessage: error instanceof Error ? error.message : String(error),
          completedAt: new Date(),
        },
      }).catch(() => undefined);
    }
    const fallback = activeRefreshes.get(slug);
    await emitProgress({
      ...(fallback || {
        slug,
        currentPage: pagesChecked,
        pagesChecked,
        maxPages,
        hasMorePages,
        postsImported: totalPostsImported,
        mediaImported: totalMediaImported,
        postCount: 0,
        mediaCount: 0,
        lastScrapedAt: null,
      }),
      status: 'failed',
      mode,
      pageLogs: pageLogs.slice(-25),
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    activeControllers.delete(slug);
    setTimeout(() => activeRefreshes.delete(slug), 5 * 60_000);
  }
}

function withTimeout<T>(factory: (signal: AbortSignal) => Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(message));
    }, timeoutMs);
    factory(controller.signal)
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timer));
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
