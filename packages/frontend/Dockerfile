FROM node:20-bookworm-slim

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/frontend/package.json packages/frontend/package.json
RUN pnpm install --frozen-lockfile --filter @coomerfans/frontend...

COPY packages/shared packages/shared
COPY packages/frontend packages/frontend

WORKDIR /app/packages/frontend
EXPOSE 5173
CMD ["pnpm", "dev", "--", "--host", "0.0.0.0"]
