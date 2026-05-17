import { Request, Response } from 'express';
import { loginSchema, registerSchema } from '@coomerfans/shared';
import * as authService from '../services/auth.service';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

export async function register(req: Request, res: Response) {
  const { email, username, password } = req.body as ReturnType<typeof registerSchema.parse>;

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });

  if (existing) {
    const field = existing.email === email ? 'email' : 'username';
    res.status(409).json({ error: `This ${field} is already in use` });
    return;
  }

  const passwordHash = await authService.hashPassword(password);
  const user = await prisma.user.create({
    data: { email, username, passwordHash },
  });

  await prisma.userSetting.create({
    data: { userId: user.id },
  });

  const tokens = await authService.createAuthTokens(user.id);

  res.status(201).json({
    user: { id: user.id, email: user.email, username: user.username, role: user.role },
    ...tokens,
  });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as ReturnType<typeof loginSchema.parse>;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const valid = await authService.verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const tokens = await authService.createAuthTokens(user.id);

  res.json({
    user: { id: user.id, email: user.email, username: user.username, role: user.role },
    ...tokens,
  });
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({ error: 'Refresh token required' });
    return;
  }

  const tokens = await authService.rotateRefreshToken(refreshToken);
  if (!tokens) {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
    return;
  }

  res.json(tokens);
}

export async function logout(req: AuthRequest, res: Response) {
  await authService.revokeAllUserTokens(req.userId!);
  res.json({ message: 'Logged out' });
}

export async function me(req: AuthRequest, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: {
      id: true,
      email: true,
      username: true,
      avatarUrl: true,
      role: true,
      storageUsed: true,
      storageLimit: true,
      createdAt: true,
    },
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({
    ...user,
    storageUsed: Number(user.storageUsed),
    storageLimit: Number(user.storageLimit),
  });
}
