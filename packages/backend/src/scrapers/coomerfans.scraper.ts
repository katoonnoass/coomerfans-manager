import { chromium } from 'playwright';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { warmMediaThumbnailCache } from '../services/media-thumbnail-cache.service';
import { mergeDuplicateModelsForProfile } from '../services/model-dedupe.service';

interface ScrapedProfile {
  externalId: string;
  service: string;
  name: string;
  slug: string;
  thumbnailUrl?: string;
  postCount: number;
}

interface ScrapedPost {
  externalId: string;
  path: string;
  title: string;
  description?: string;
  postedAt?: Date;
  media: Array<{ url: string; type: string }>;
}

interface CatalogSearchResult {
  profiles: ScrapedProfile[];
  total?: number;
  page: number;
  query: string;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanText(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

export function normalizeLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function toCatalogPathSlug(service: string, slug: string) {
  const prefix = `${service}-`;
  return service !== 'onlyfans' && slug.startsWith(prefix) ? slug.slice(prefix.length) : slug;
}

function parseCatalogSearch(html: string, query: string, page: number): CatalogSearchResult {
  const totalMatch = html.match(/Total\s+([\d.,]+)/i);
  const total = totalMatch ? Number(totalMatch[1].replace(/[^\d]/g, '')) : undefined;
  const profileMap = new Map<string, ScrapedProfile>();
  const cardRe = /<a[^>]+href="\/u\/([^/"?#]+)\/([^/"?#]+)\/([^"?#]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(cardRe)) {
    const service = decodeHtml(match[1]).toLowerCase();
    const externalId = decodeHtml(match[2]);
    const externalSlug = decodeHtml(match[3]).toLowerCase();
    const slug = service === 'onlyfans' ? externalSlug : `${service}-${externalSlug}`;
    const body = match[4] || '';
    const titleMatch = match[0].match(/\stitle="([^"]+)"/i);
    const altMatch = body.match(/<img[^>]+alt="([^"]*)"/i);
    const textMatch = body.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const imageMatch = body.match(/<img[^>]+src="([^"]+)"/i);
    const name = cleanText(titleMatch?.[1] || altMatch?.[1] || textMatch?.[1] || slug);
    const thumbnailUrl = imageMatch?.[1] ? decodeHtml(imageMatch[1]) : `https://coomerfans.com/istorage/${externalId}.jpg`;

    if (!profileMap.has(`${service}:${externalId}`)) {
      profileMap.set(`${service}:${externalId}`, {
        externalId: `${service}:${externalId}`,
        service,
        name,
        slug,
        thumbnailUrl,
        postCount: 0,
      });
    }
  }

  return {
    profiles: Array.from(profileMap.values()),
    total,
    page,
    query,
  };
}

export async function resolveCatalogProfile(service: string, name: string, pages = 3) {
  const expectedService = service.toLowerCase();
  const expectedName = normalizeLookup(name);
  const expectedSlug = toCatalogPathSlug(expectedService, name.toLowerCase());

  for (let page = 1; page <= pages; page += 1) {
    const result = await searchCatalog(name, page);
    const sameService = result.profiles.filter((profile) => profile.service === expectedService);
    const exact = sameService.find((profile) => normalizeLookup(profile.name) === expectedName)
      || sameService.find((profile) => toCatalogPathSlug(profile.service, profile.slug) === expectedSlug)
      || sameService[0];

    if (exact) return exact;
    if (result.profiles.length === 0) break;
  }

  return null;
}

function absoluteUrl(url: string) {
  if (url.startsWith('//')) return `https:${url}`;
  return url.startsWith('http') ? url : `https://coomerfans.com${url}`;
}

function mediaType(url: string) {
  if (/\.(mp4|webm|mov)(?:$|\?)/i.test(url)) return 'VIDEO';
  if (/\.(gif)(?:$|\?)/i.test(url)) return 'GIF';
  return 'IMAGE';
}

function parseDate(value?: string) {
  if (!value) return undefined;
  const normalized = decodeHtml(value).replace(/\s*\+0000\s+UTC/i, 'Z').trim();
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function mediaCandidates(rawValue: string) {
  return decodeHtml(rawValue)
    .replace(/\\\//g, '/')
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function isContentMediaUrl(url: string) {
  if (url.includes('/istorage/')) return false;
  return /(storage|\/data\/).*\.(jpg|jpeg|png|webp|gif|mp4|webm|mov|m3u8)(?:$|\?)/i.test(url)
    || /\.(jpg|jpeg|png|webp|gif|mp4|webm|mov|m3u8)(?:$|\?)/i.test(url);
}

function canonicalMediaUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString();
  } catch {
    return url.split('#')[0].split('?')[0];
  }
}

function collectMedia(html: string) {
  const urls = new Map<string, { url: string; type: string }>();
  const addUrl = (rawUrl: string, tag = '') => {
    for (const candidate of mediaCandidates(rawUrl)) {
      const url = absoluteUrl(candidate);
      if (!isContentMediaUrl(url)) continue;
      const key = canonicalMediaUrl(url);
      const type = tag === 'video' || tag === 'source' || /\.(mp4|webm|mov|m3u8)(?:$|\?)/i.test(url)
        ? 'VIDEO'
        : mediaType(url);
      urls.set(key, { url: key, type });
    }
  };

  for (const match of html.matchAll(/<(img|source|video|a)[^>]+?\s(?:src|href|poster|data-src|srcset)=["']([^"']+)["'][^>]*>/gi)) {
    addUrl(match[2], match[1].toLowerCase());
  }

  for (const match of html.matchAll(/https?:\/\/[^"'<>\s]+\.(?:jpg|jpeg|png|webp|gif|mp4|webm|mov|m3u8)(?:\?[^"'<>\s]*)?/gi)) {
    addUrl(match[0]);
  }

  return Array.from(urls.values());
}

function extractPostDetailHtml(html: string) {
  const start = html.search(/<div class="post-wrap">/i);
  if (start < 0) return html;
  const afterStart = html.slice(start);
  const end = afterStart.search(/<div class="pagination pagination-bottom">|<div class="thumbs-list">|<footer class="footer">/i);
  return end > 0 ? afterStart.slice(0, end) : afterStart;
}

function parseProfilePosts(html: string): { posts: ScrapedPost[]; hasNext: boolean } {
  const posts: ScrapedPost[] = [];
  const seenPosts = new Set<string>();
  const postRe = /<div class="post">([\s\S]*?)(?=<div class="post">|<div class="pagination|<\/section>)/gi;

  for (const match of html.matchAll(postRe)) {
    const body = match[1] || '';
    const linkMatch = body.match(/<h3>\s*<a href="\/p\/([^"]+)">([\s\S]*?)<\/a>\s*<\/h3>/i)
      || body.match(/<a class="view-post" href="\/p\/([^"]+)"/i);
    if (!linkMatch?.[1]) continue;

    const externalId = linkMatch[1].split('/')[0];
    if (seenPosts.has(externalId)) continue;
    seenPosts.add(externalId);
    const path = `/p/${linkMatch[1]}`;
    const title = cleanText(linkMatch[2] || externalId);
    const dateMatch = body.match(/<span class="post-date">([\s\S]*?)<\/span>/i);
    const media = collectMedia(body);

    posts.push({
      externalId,
      path,
      title,
      description: title,
      postedAt: parseDate(dateMatch?.[1]),
      media,
    });
  }

  return {
    posts,
    hasNext: /class="next"[^>]+href="/i.test(html)
      || /rel=["']next["']/i.test(html)
      || /href="[^"]*[?&]page=\d+"[^>]*>\s*(?:Next|Próxima|›|»)/i.test(html),
  };
}

function parsePostDetail(html: string, fallback: ScrapedPost): ScrapedPost {
  const body = extractPostDetailHtml(html);
  const title = cleanText(body.match(/<h1>([\s\S]*?)<\/h1>/i)?.[1] || fallback.title);
  const date = parseDate(body.match(/<span class="post-date">(?:Added\s*)?([\s\S]*?)<\/span>/i)?.[1]) || fallback.postedAt;
  const media = collectMedia(body);

  return {
    ...fallback,
    title,
    description: title,
    postedAt: date,
    media: media.length ? media : fallback.media,
  };
}

function detailSignal(signal?: AbortSignal) {
  if (!signal) return AbortSignal.timeout(12000);
  return AbortSignal.any([signal, AbortSignal.timeout(12000)]);
}

async function hydratePostDetails(posts: ScrapedPost[], signal?: AbortSignal) {
  const hydrated: ScrapedPost[] = [];
  const concurrency = 6;

  for (let i = 0; i < posts.length; i += concurrency) {
    if (signal?.aborted) throw new Error('Scrape cancelled');
    const batch = posts.slice(i, i + concurrency);
    const details = await Promise.all(batch.map(async (post) => {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const response = await fetch(`https://coomerfans.com${post.path}`, {
            signal: detailSignal(signal),
            headers: {
              'User-Agent': env.SCRAPER_USER_AGENT,
              Accept: 'text/html,application/xhtml+xml',
            },
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return parsePostDetail(await response.text(), post);
        } catch {
          if (signal?.aborted) throw new Error('Scrape cancelled');
          if (attempt === 2) return post;
          await sleep(750);
        }
      }
      return post;
    }));
    hydrated.push(...details);
  }

  return hydrated;
}

async function selectPostsForDetailHydration(modelId: string, posts: ScrapedPost[]) {
  if (posts.length === 0) return posts;
  const existingPosts = await prisma.post.findMany({
    where: {
      modelId,
      externalId: { in: posts.map((post) => post.externalId) },
    },
    select: {
      externalId: true,
      _count: { select: { media: true } },
    },
  });
  const existingWithMedia = new Set(
    existingPosts
      .filter((post) => post._count.media > 0)
      .map((post) => post.externalId)
  );
  return posts.filter((post) => !existingWithMedia.has(post.externalId) || post.media.length === 0);
}

export async function scrapeProfilePosts(slug: string, page = 1, options: { signal?: AbortSignal } = {}) {
  const mode = (options as any).mode === 'FULL' ? 'FULL' : 'FAST';
  const model = await prisma.model.findUnique({
    where: { slug },
    select: {
      id: true,
      externalId: true,
      service: true,
      name: true,
      slug: true,
      postCount: true,
      mediaCount: true,
      metadata: true,
    },
  });

  if (!model) {
    throw new Error(`Model not found: ${slug}`);
  }

  let metadata = model.metadata as Record<string, unknown> | null;
  let catalogExternalId = String(metadata?.catalogExternalId || metadata?.externalId || model.externalId);
  let catalogSlug = String(metadata?.catalogSlug || model.slug);

  if (String(model.externalId).startsWith('coomer.st:') || metadata?.source === 'coomer.st') {
    const resolved = await resolveCatalogProfile(model.service, model.name, 5);
    if (!resolved) {
      throw new Error(`CoomerFans profile not found for ${model.service}/${model.name}`);
    }

    const shouldClearWrongPosts = (model.postCount > 0 || model.mediaCount > 0)
      && (String(model.externalId).startsWith('coomer.st:') || metadata?.source === 'coomer.st');

    if (shouldClearWrongPosts) {
      await prisma.post.deleteMany({ where: { modelId: model.id } });
    }

    catalogExternalId = resolved.externalId;
    catalogSlug = resolved.slug;
    metadata = {
      ...(metadata || {}),
      source: 'coomerfans-catalog',
      catalogExternalId: resolved.externalId,
      catalogSlug: toCatalogPathSlug(resolved.service, resolved.slug),
      resolvedFrom: 'coomer.st',
      resolvedAt: new Date().toISOString(),
    };

    await prisma.model.update({
      where: { id: model.id },
      data: {
        externalId: resolved.externalId,
        thumbnailUrl: resolved.thumbnailUrl,
        postCount: shouldClearWrongPosts ? 0 : model.postCount,
        mediaCount: shouldClearWrongPosts ? 0 : model.mediaCount,
        metadata: metadata as any,
      },
    });
  }

  const numericExternalId = catalogExternalId.split(':').pop() || '';
  const profileSlug = toCatalogPathSlug(model.service, catalogSlug);
  const profilePath = `/u/${model.service}/${numericExternalId}/${profileSlug}`;
  const url = new URL(`https://coomerfans.com${profilePath}`);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }

  const response = await fetch(url, {
    signal: options.signal || AbortSignal.timeout(30000),
    headers: {
      'User-Agent': env.SCRAPER_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`Profile scrape failed: ${response.status} ${response.statusText}`);
  }

  const parsed = parseProfilePosts(await response.text());
  const postsToHydrate = mode === 'FULL' ? await selectPostsForDetailHydration(model.id, parsed.posts) : [];
  const hydratedPosts = postsToHydrate.length > 0
    ? await hydratePostDetails(postsToHydrate, options.signal)
    : [];
  const hydratedById = new Map(hydratedPosts.map((post) => [post.externalId, post]));
  const posts = parsed.posts.map((post) => hydratedById.get(post.externalId) || post);
  let mediaImported = 0;
  let postsImported = 0;
  const pageMediaForThumbs: Array<{ id: string; type: string; url: string }> = [];
  const pageMediaUrls = Array.from(new Set(posts.flatMap((post) => post.media.map((item) => item.url))));
  const existingModelMedia = pageMediaUrls.length
    ? await prisma.media.findMany({
        where: {
          url: { in: pageMediaUrls },
          post: { modelId: model.id },
        },
        select: { id: true, type: true, url: true },
      })
    : [];
  const existingModelUrls = new Set(existingModelMedia.map((item) => item.url));

  for (const scrapedPost of posts) {
    const previousPost = await prisma.post.findUnique({
      where: {
        externalId_modelId: {
          externalId: scrapedPost.externalId,
          modelId: model.id,
        },
      },
    });
    const post = previousPost
      ? await prisma.post.update({
          where: { id: previousPost.id },
          data: {
            title: scrapedPost.title,
            description: scrapedPost.description,
            postedAt: scrapedPost.postedAt,
            metadata: {
              source: 'coomerfans-profile',
              page,
            },
          },
        })
      : await prisma.post.create({
          data: {
            externalId: scrapedPost.externalId,
            modelId: model.id,
            title: scrapedPost.title,
            description: scrapedPost.description,
            postedAt: scrapedPost.postedAt,
            metadata: {
              source: 'coomerfans-profile',
              page,
            },
          },
        });

    if (!previousPost) postsImported += 1;

    const uniquePostMedia = Array.from(
      new Map(scrapedPost.media.map((item) => [item.url, item])).values()
    );
    const existingPostMedia = existingModelMedia.filter((item) => uniquePostMedia.some((media) => media.url === item.url));
    pageMediaForThumbs.push(...existingPostMedia);
    const newMedia = uniquePostMedia.filter((item) => !existingModelUrls.has(item.url));
    if (newMedia.length > 0) {
      const createdMedia = await Promise.all(newMedia.map((item) =>
        prisma.media.create({
          data: {
            postId: post.id,
            type: item.type,
            url: item.url,
          },
          select: { id: true, type: true, url: true },
        })
      ));
      pageMediaForThumbs.push(...createdMedia);
      mediaImported += newMedia.length;
      createdMedia.forEach((item) => existingModelUrls.add(item.url));
    }
  }

  warmMediaThumbnailCache(pageMediaForThumbs);
  await dedupeModelMediaByUrl(model.id, pageMediaUrls);

  const [postCount, mediaCount, mediaCountsByType, postCountsByMediaType] = await Promise.all([
    prisma.post.count({ where: { modelId: model.id } }),
    prisma.media.count({ where: { post: { modelId: model.id } } }),
    prisma.media.groupBy({
      by: ['type'],
      where: { post: { modelId: model.id } },
      _count: { _all: true },
    }),
    prisma.post.findMany({
      where: { modelId: model.id },
      select: {
        media: {
          select: { type: true },
        },
      },
    }),
  ]);
  const mediaTypeCounts = Object.fromEntries(
    mediaCountsByType.map((item) => [item.type, item._count._all])
  );
  const postTypeCounts = postCountsByMediaType.reduce<Record<string, number>>((counts, post) => {
    const types = new Set(post.media.map((item) => item.type));
    for (const type of types) counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});

  await prisma.model.update({
    where: { id: model.id },
    data: {
      postCount,
      mediaCount,
      lastScrapedAt: new Date(),
      metadata: {
        ...(metadata || {}),
        lastProfileSyncPage: page,
        hasMoreProfilePages: parsed.hasNext,
        counts: {
          posts: postCount,
          media: mediaCount,
          mediaByType: mediaTypeCounts,
          postsByMediaType: postTypeCounts,
          updatedAt: new Date().toISOString(),
        },
      },
    },
  });

  return {
    postsImported,
    mediaImported,
    hasNext: parsed.hasNext,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dedupeModelMediaByUrl(modelId: string, urls: string[]) {
  const uniqueUrls = Array.from(new Set(urls)).filter(Boolean);
  if (uniqueUrls.length === 0) return;

  for (let index = 0; index < uniqueUrls.length; index += 100) {
    const batch = uniqueUrls.slice(index, index + 100);
    const rows = await prisma.media.findMany({
      where: {
        url: { in: batch },
        post: { modelId },
      },
      select: {
        id: true,
        url: true,
        isDownloaded: true,
        createdAt: true,
      },
      orderBy: [
        { url: 'asc' },
        { isDownloaded: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    const seen = new Set<string>();
    const duplicateIds: string[] = [];
    for (const row of rows) {
      if (seen.has(row.url)) {
        duplicateIds.push(row.id);
      } else {
        seen.add(row.url);
      }
    }

    if (duplicateIds.length > 0) {
      await prisma.media.deleteMany({
        where: { id: { in: duplicateIds } },
      });
    }
  }
}

export async function searchCatalog(query: string, page = 1): Promise<CatalogSearchResult> {
  const url = new URL('https://coomerfans.com/');
  url.searchParams.set('q', query);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: {
      'User-Agent': env.SCRAPER_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`Catalog search failed: ${response.status} ${response.statusText}`);
  }

  return parseCatalogSearch(await response.text(), query, page);
}

export async function upsertCatalogProfiles(profiles: ScrapedProfile[]) {
  let created = 0;
  let updated = 0;

  for (const profile of profiles) {
    const previous = await prisma.model.findFirst({
      where: {
        OR: [
          { externalId: profile.externalId },
          { slug: profile.slug },
          { slug: `${profile.service}-${profile.slug}` },
          { service: profile.service, name: { equals: profile.name, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });

    const data = {
      externalId: profile.externalId,
      service: profile.service,
      name: profile.name,
      slug: profile.slug,
      thumbnailUrl: profile.thumbnailUrl,
      postCount: profile.postCount,
      isActive: true,
      metadata: {
        source: 'coomerfans-catalog',
        externalId: profile.externalId,
        catalogSlug: profile.slug,
        importedAt: new Date().toISOString(),
      },
    };

    if (previous) {
      await prisma.model.update({
        where: { id: previous.id },
        data,
      });
      updated += 1;
    } else {
      await prisma.model.create({
        data: {
          ...data,
        },
      });
      created += 1;
    }

    await mergeDuplicateModelsForProfile(profile);
  }

  return { created, updated };
}

export async function syncCatalog(options: { queries: string[]; pages?: number; limit?: number }) {
  const pages = Math.max(1, Math.min(options.pages || 1, 25));
  const limit = Math.max(1, Math.min(options.limit || 500, 5000));
  const allProfiles = new Map<string, ScrapedProfile>();
  const totals = new Map<string, number>();

  for (const query of options.queries.filter(Boolean)) {
    for (let page = 1; page <= pages; page += 1) {
      if (allProfiles.size >= limit) break;

      const result = await searchCatalog(query, page);
      if (typeof result.total === 'number') {
        totals.set(query, result.total);
      }

      for (const profile of result.profiles) {
        allProfiles.set(profile.externalId, profile);
        if (allProfiles.size >= limit) break;
      }

      if (result.profiles.length === 0) break;
    }
  }

  const profiles = Array.from(allProfiles.values()).slice(0, limit);
  const saved = await upsertCatalogProfiles(profiles);

  return {
    discovered: profiles.length,
    created: saved.created,
    updated: saved.updated,
    totals: Object.fromEntries(totals.entries()),
  };
}

export async function scrapeProfile(slug: string): Promise<ScrapedProfile | null> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: env.SCRAPER_USER_AGENT,
    });
    const page = await context.newPage();

    await page.goto(`https://coomerfans.com/${slug}`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Extract profile data from the Next.js RSC payload
    const profileData = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent || '';
        if (text.includes('"name"') && text.includes('"service"')) {
          try {
            // Try to find JSON in script tags
            const jsonMatch = text.match(/\{[^}]*"name"[^}]*\}/);
            if (jsonMatch) return JSON.parse(jsonMatch[0]);
          } catch { /* continue */ }
        }
      }
      return null;
    });

    if (!profileData) {
      logger.warn(`Could not extract profile data for ${slug}`);
      return null;
    }

    // Extract posts/media
    const mediaItems = await page.evaluate(() => {
      const items: Array<{ url: string; type: string }> = [];
      document.querySelectorAll('a[href*="/data/"]').forEach((el) => {
        const href = el.getAttribute('href');
        if (href) {
          items.push({
            url: href.startsWith('http') ? href : `https://coomerfans.com${href}`,
            type: href.match(/\.(mp4|webm|mov)/i) ? 'VIDEO'
              : href.match(/\.(gif)/i) ? 'GIF' : 'IMAGE',
          });
        }
      });
      return items;
    });

    await browser.close();

    // Upsert model in DB
    const model = await prisma.model.upsert({
      where: { externalId: profileData.externalId || slug },
      update: {
        name: profileData.name || slug,
        slug,
        service: profileData.service || 'onlyfans',
        thumbnailUrl: profileData.thumbnailUrl,
        postCount: profileData.postCount || 0,
        mediaCount: mediaItems.length,
        metadata: profileData,
        lastScrapedAt: new Date(),
      },
      create: {
        externalId: profileData.externalId || slug,
        service: profileData.service || 'onlyfans',
        name: profileData.name || slug,
        slug,
        thumbnailUrl: profileData.thumbnailUrl,
        postCount: profileData.postCount || 0,
        mediaCount: mediaItems.length,
        metadata: profileData,
        lastScrapedAt: new Date(),
      },
    });

    // Create a post and media entries
    if (mediaItems.length > 0) {
      const post = await prisma.post.create({
        data: {
          externalId: `${slug}-scrape-${Date.now()}`,
          modelId: model.id,
          postedAt: new Date(),
        },
      });

      await prisma.media.createMany({
        data: mediaItems.map((item) => ({
          postId: post.id,
          type: item.type,
          url: item.url,
        })),
      });
    }

    return {
      externalId: model.externalId,
      service: model.service,
      name: model.name,
      slug: model.slug,
      thumbnailUrl: model.thumbnailUrl ?? undefined,
      postCount: model.postCount,
    };
  } catch (error) {
    logger.error(`Failed to scrape ${slug}:`, error);
    return null;
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function searchModels(query: string): Promise<ScrapedProfile[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: env.SCRAPER_USER_AGENT,
    });
    const page = await context.newPage();

    await page.goto(`https://coomerfans.com/?q=${encodeURIComponent(query)}`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    const results = await page.evaluate(() => {
      const cards = document.querySelectorAll('a[href^="/"][href*="/post/"], .model-card, [class*="model"]');
      return Array.from(cards).slice(0, 20).map((card) => {
        const link = card.querySelector('a') || card;
        const href = (link as HTMLAnchorElement).href || (card as HTMLAnchorElement).href || '';
        const img = card.querySelector('img');
        return {
          externalId: href.split('/').filter(Boolean).pop() || '',
          service: 'onlyfans',
          name: (card.textContent || '').trim().split('\n')[0] || 'Unknown',
          slug: href.split('/').filter(Boolean).pop() || '',
          thumbnailUrl: img?.getAttribute('src') || undefined,
          postCount: 0,
        };
      });
    });

    await browser.close();
    return results;
  } catch (error) {
    logger.error(`Failed to search for "${query}":`, error);
    return [];
  } finally {
    await browser.close().catch(() => {});
  }
}
