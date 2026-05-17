import { z } from 'zod';

export const searchParamsSchema = z.object({
  q: z.string().min(1).max(200),
  service: z.enum(['onlyfans', 'fansly', 'patreon', 'other']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

export type SearchParamsInput = z.infer<typeof searchParamsSchema>;
