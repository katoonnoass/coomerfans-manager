import { z } from 'zod';

export const createDownloadSchema = z.object({
  modelId: z.string().min(1),
  mediaIds: z.array(z.string()).min(1).max(5000),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH']).default('NORMAL'),
  downloadPath: z.string().trim().min(1).max(500).optional().nullable(),
});

export const cancelDownloadSchema = z.object({
  downloadJobId: z.string().min(1),
});

export type CreateDownloadInput = z.infer<typeof createDownloadSchema>;
