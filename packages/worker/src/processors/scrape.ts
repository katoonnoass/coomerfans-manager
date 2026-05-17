import { Job } from 'bullmq';
import { chromium } from 'playwright';
import { getPrisma } from '../db';

interface ScrapeData {
  slug: string;
  userId?: string;
}

export async function scrapeProcessor(job: Job<ScrapeData>) {
  const { slug } = job.data;
  const prisma = getPrisma();

  await job.updateProgress(0);
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    const page = await context.newPage();

    await page.goto(`https://coomerfans.com/${slug}`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    await job.updateProgress(30);

    const profileData = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent || '';
        if (text.includes('"name"') && text.includes('"service"')) {
          try {
            const match = text.match(/\{[^}]*"name"[^}]*\}/);
            if (match) return JSON.parse(match[0]);
          } catch {}
        }
      }

      // Fallback: extract from DOM
      const name = document.querySelector('h1')?.textContent?.trim() || '';
      const avatar = (document.querySelector('img[src*="avatar"], img[alt*="avatar"]') as HTMLImageElement)?.src || '';
      return { name, thumbnailUrl: avatar, service: 'onlyfans' };
    });

    await job.updateProgress(50);

    const mediaItems = await page.evaluate(() => {
      const items: Array<{ url: string; type: string }> = [];
      document.querySelectorAll('a[href*="/data/"], a[href*="/file/"], img[src*="/data/"]').forEach((el) => {
        const href = el.getAttribute('href') || el.getAttribute('src');
        if (href) {
          const fullUrl = href.startsWith('http') ? href : `https://coomerfans.com${href}`;
          items.push({
            url: fullUrl,
            type: fullUrl.match(/\.(mp4|webm|mov)/i) ? 'VIDEO'
              : fullUrl.match(/\.(gif)/i) ? 'GIF' : 'IMAGE',
          });
        }
      });
      return items;
    });

    await job.updateProgress(70);

    const existing = await prisma.model.findUnique({ where: { slug } });

    const model = await prisma.model.upsert({
      where: { slug },
      update: {
        name: profileData?.name || slug,
        service: profileData?.service || 'onlyfans',
        thumbnailUrl: profileData?.thumbnailUrl,
        postCount: mediaItems.length,
        mediaCount: mediaItems.length,
        metadata: profileData,
        lastScrapedAt: new Date(),
      },
      create: {
        externalId: slug,
        service: profileData?.service || 'onlyfans',
        name: profileData?.name || slug,
        slug,
        thumbnailUrl: profileData?.thumbnailUrl,
        postCount: mediaItems.length,
        mediaCount: mediaItems.length,
        metadata: profileData,
        lastScrapedAt: new Date(),
      },
    });

    if (mediaItems.length > 0) {
      const post = await prisma.post.create({
        data: {
          externalId: `${slug}-${Date.now()}`,
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
        skipDuplicates: true,
      });
    }

    await job.updateProgress(100);
    return {
      modelId: model.id,
      name: model.name,
      mediaFound: mediaItems.length,
    };
  } finally {
    await browser.close();
  }
}
