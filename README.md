<div align="center">

# CoomerFans Manager

Local-first creator media indexer, profile manager, and download control panel.

[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9%2B-f69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-4169e1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-6%2B-dc382d?logo=redis&logoColor=white)](https://redis.io/)

</div>

> CoomerFans Manager is intended for personal archival and research workflows. Users are responsible for following the terms of service of any website they access and for respecting copyright, privacy, and local laws.

## What It Does

CoomerFans Manager helps organize creator profiles, refresh profile media, browse indexed content, and manage downloads through a local web app plus optional Windows control panel.

It is built as a local-first stack: your database, queue, downloaded media, IDM import files, and service control run on your machine.

## Highlights

| Area | Features |
| --- | --- |
| Profiles | Search, favorites, grouped aliases, profile refresh, media counters |
| Media browser | Grid/list modes, type filters, selection tools, status indicators |
| Refresh engine | Fast scan, full scan, deduplication, progress reporting, recovery controls |
| Downloads | Native segmented downloader, retry/resume, validation, queue monitoring |
| IDM | Direct IDM launch plus `.cmd` queue-file generation |
| Organization | Download queue grouped by profile with expand/collapse controls |
| Diagnostics | Queue health, storage checks, failed-job repair, activity history |
| Windows agent | Electron control panel for backend, worker, frontend, PostgreSQL, and Redis |

## Screenshots

Add release screenshots to `docs/screenshots/` before publishing a GitHub release.

| Home | Profile |
| --- | --- |
| `docs/screenshots/home.png` | `docs/screenshots/profile.png` |

| Downloads | Diagnostics |
| --- | --- |
| `docs/screenshots/downloads.png` | `docs/screenshots/diagnostics.png` |

## Stack

```text
Frontend  React + Vite + Tailwind
Backend   Node.js + Express + Prisma
Worker    BullMQ + Redis
Database  PostgreSQL
Agent     Electron
Package   pnpm workspaces + Turbo
```

## Requirements

- Node.js 20+
- pnpm 9+
- PostgreSQL 14+
- Redis 6+
- Windows PowerShell
- Optional: Internet Download Manager

## Quick Start

```powershell
git clone https://github.com/katoonnoass/coomerfans-manager.git
cd coomerfans-manager
copy .env.example .env
pnpm install
pnpm --filter @coomerfans/backend db:generate
pnpm --filter @coomerfans/worker db:generate
pnpm --filter @coomerfans/backend db:push
.\dev.ps1
```

Open:

```text
http://localhost:5173
```

## Environment

Create your local environment file:

```powershell
copy .env.example .env
```

Main settings:

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

Never commit `.env`, downloaded media, logs, generated IDM files, or local agent builds.

## Scripts

| Command | Purpose |
| --- | --- |
| `.\setup.ps1` | Checks tools, installs dependencies, prepares Prisma |
| `.\dev.ps1` | Starts backend, worker, and frontend for development |
| `.\start.ps1` | Starts services for normal local usage |
| `.\repair.ps1` | Runs queue/download/counter repair helpers |
| `pnpm typecheck` | Typechecks all packages through Turbo |
| `pnpm build` | Builds workspace packages |
| `pnpm validate` | Validates Prisma/client setup |
| `pnpm release:check` | Runs the release verification pipeline |

## Docker

```bash
docker compose up --build
```

Default services:

| Service | URL |
| --- | --- |
| Frontend | `http://localhost:5173` |
| Backend | `http://localhost:3001` |
| PostgreSQL | `localhost:5432` |
| Redis | `localhost:6379` |

Docker is provided as a development baseline. For production use, configure secrets, persistent volumes, network exposure, and a reverse proxy explicitly.

## Project Structure

```text
packages/
  backend/    Express API, Prisma, auth, scraper services
  frontend/   React, Vite, Tailwind interface
  worker/     BullMQ scrape and download workers
  shared/     Shared types and validation schemas
  agent/      Electron control panel

scripts/      Maintenance and validation helpers
docs/         Documentation and screenshot placeholders
.github/      CI workflow
```

## Download Modes

### Native

The native downloader uses queue jobs, segmented transfer, retry/resume behavior, validation, and local progress tracking.

### IDM Direct

The app can send downloads directly to Internet Download Manager when IDM is installed and `IDM_PATH` is configured.

### IDM Import File

For large batches, enable IDM queue-file generation. The app writes a `.cmd` file and a `.txt` URL list under:

```text
MEDIA_PATH/_idm_imports/
```

Run the generated `.cmd` file while the backend is running. It uses IDM's command-line interface to add every local proxy link to the IDM queue and then starts the queue.

## Troubleshooting

| Problem | Check |
| --- | --- |
| Backend does not start | PostgreSQL is running, `DATABASE_URL` is correct, then run `db:push` |
| Worker timeouts | Redis is running and queue diagnostics are clean |
| IDM returns 403/502 | Use import-file mode and keep backend running while IDM downloads |
| Profile refresh is slow | Use fast scan for daily refresh and full scan only when media is missing |
| Counters look wrong | Run diagnostics/repair actions and refresh the profile again |

## Release Checklist

Before publishing a release:

```powershell
pnpm release:check
```

Also review:

- `.env` is not committed
- `media/`, `storage/`, logs, and IDM import files are not committed
- screenshots are current
- `CHANGELOG.md` is updated
- Windows agent builds are attached as release artifacts only

## Legal Notice

This software does not grant rights to third-party content. Do not use it to bypass access controls, violate site terms, redistribute protected content, or infringe copyright. You are responsible for how you configure and use it.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
