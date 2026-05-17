import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  dedupeAllMedia,
  cleanupPartialFiles,
  getSystemHealth,
  listIdmImportFiles,
  recalculateModelCounters,
  requeuePendingDownloads,
} from '../services/maintenance.service';

export async function health(_req: AuthRequest, res: Response) {
  res.json(await getSystemHealth());
}

export async function recalculateCounters(_req: AuthRequest, res: Response) {
  res.json(await recalculateModelCounters());
}

export async function dedupeMedia(_req: AuthRequest, res: Response) {
  res.json(await dedupeAllMedia());
}

export async function requeueDownloads(_req: AuthRequest, res: Response) {
  res.json(await requeuePendingDownloads());
}

export async function cleanupPartials(_req: AuthRequest, res: Response) {
  res.json(await cleanupPartialFiles());
}

export async function idmImportFiles(_req: AuthRequest, res: Response) {
  res.json(listIdmImportFiles());
}
