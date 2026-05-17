import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { enqueueScrape, scrapeQueue } from '../services/download.service';
import { AuthRequest } from '../middleware/auth.middleware';

export async function triggerScrape(req: AuthRequest, res: Response) {
  const { slug } = req.params;

  const jobId = await enqueueScrape(slug);

  res.status(202).json({
    message: 'Scrape job queued',
    jobId,
    slug,
    status: 'pending',
  });
}

export async function getScrapeStatus(req: AuthRequest, res: Response) {
  const { slug } = req.params;

  const model = await prisma.model.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      postCount: true,
      mediaCount: true,
      lastScrapedAt: true,
    },
  });

  if (!model) {
    res.status(404).json({ error: 'Model not found' });
    return;
  }

  res.json({
    ...model,
    lastScrapedAt: model.lastScrapedAt?.toISOString() ?? null,
  });
}
