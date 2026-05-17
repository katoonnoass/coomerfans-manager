import express from 'express';
import cors from 'cors';
import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { env } from './config/env';
import { authMiddleware } from './middleware/auth.middleware';
import { errorHandler } from './middleware/error-handler.middleware';
import routes from './routes';
import { setupWebSocket } from './services/websocket.service';

export function createApp() {
  const app = express();
  const http = new HttpServer(app);

  const io = new SocketIOServer(http, {
    cors: {
      origin: env.CORS_ORIGIN,
      methods: ['GET', 'POST'],
    },
  });

  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(authMiddleware);

  app.use('/api', routes);

  app.use(errorHandler);

  setupWebSocket(io);

  return { app, http, io };
}
