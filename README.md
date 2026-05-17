# CoomerFans SaaS

CoomerFans SaaS is a local-first content indexing and download manager for creator profiles. It provides profile search, profile refresh, media browsing, favorites, native downloads, IDM integration, IDM import-file generation, diagnostics, and queue monitoring.

> This project is intended for personal archival and research workflows. Users are responsible for complying with the terms of service of any site they access and for respecting copyright and privacy laws.

## Features

- Profile catalog search and favorites
- Fast and full profile refresh modes
- Media grid/list with filters for type, downloaded state, and ordering
- Native segmented downloads with retry, resume, validation, and CDN cooldown
- IDM direct integration and `.ef2`/`.ief` import-file generation
- Grouped download queue with pause/resume/retry by profile
- Diagnostics page for queue, storage, failures, and repair actions
- Notification history and bottom activity dock
- Windows tray agent for local service control

## Screenshots

Add release screenshots under `docs/screenshots/` before publishing a GitHub release:

- `home.png`
- `profile.png`
- `downloads.png`
- `diagnostics.png`
- `settings.png`

## Requirements

- Node.js 20+
- pnpm 9+
- PostgreSQL 14+
- Redis 6+
- Optional: Internet Download Manager on Windows

## Quick Start

```powershell
git clone <repo-url>
cd coomerfans-saas
copy .env.example .env
pnpm install
pnpm --filter @coomerfans/backend db:generate
pnpm --filter @coomerfans/worker db:generate
pnpm --filter @coomerfans/backend db:push
.\dev.ps1
```

Open `http://localhost:5173`.

## Windows Agent

If you build or download the agent:

1. Start the control panel.
2. Click `Start All`.
3. Open `http://localhost:5173`.

The generated portable executable is a release artifact and should not be committed.

## Environment

Copy `.env.example` to `.env` and adjust:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/coomerfans?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_ACCESS_SECRET="change-me-access-secret-min-32-chars"
JWT_REFRESH_SECRET="change-me-refresh-secret-min-32-chars"
PORT=3001
CORS_ORIGIN="http://localhost:5173"
MEDIA_PATH="./media"
IDM_PATH="C:\\Program Files (x86)\\Internet Download Manager\\IDMan.exe"
IDM_IMPORT_BASE_URL="http://127.0.0.1:3001"
```

## Scripts

```powershell
.\setup.ps1      # checks tools, installs dependencies, prepares Prisma
.\dev.ps1        # starts backend, worker, and frontend in separate windows
.\start.ps1      # starts services for normal local use
.\repair.ps1     # requeue/download and counter repair helpers
```

Package scripts:

```bash
pnpm typecheck
pnpm build
pnpm --filter @coomerfans/backend db:push
pnpm --filter @coomerfans/backend db:seed
```

## Docker

```bash
docker compose up --build
```

Services:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

Docker is intended as a development baseline. For production, configure secrets, volumes, network access, and reverse proxy explicitly.

## IDM Import Files

When `Settings -> Motor de download -> IDM` and `Modo IDM -> Gerar arquivo .ef2/.ief` are enabled, new downloads generate import files in:

```text
MEDIA_PATH/_idm_imports/
```

The links point to the local backend proxy so IDM receives the required headers and range support.

## Project Structure

```text
packages/
  backend/   Express API, Prisma, auth, scraper services
  frontend/  React, Vite, Tailwind UI
  worker/    BullMQ download and scrape workers
  shared/    Shared types and validation schemas
  agent/     Electron control panel
```

## Troubleshooting

### Backend does not start

- Check PostgreSQL is running.
- Check `DATABASE_URL`.
- Run `pnpm --filter @coomerfans/backend db:push`.

### Worker times out

- Check Redis is running.
- Open Diagnostics and run `Reprocessar pendentes`.

### IDM returns 403/502

- Use `Modo IDM -> Gerar arquivo .ef2/.ief`.
- Keep backend running while IDM imports/downloads the generated links.
- Check `IDM_IMPORT_BASE_URL` points to the backend reachable by IDM.

### Profile refresh is slow

- Use `Varredura rápida` for daily use.
- Use `Varredura completa` only when media is missing.

## Legal Notice

This software does not grant rights to third-party content. Do not use it to bypass access controls, violate site terms, redistribute protected content, or infringe copyright. You are responsible for how you configure and use it.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
