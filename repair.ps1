Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host "[1/4] Gerando Prisma Client..."
pnpm --filter "@coomerfans/backend" db:generate
pnpm --filter "@coomerfans/worker" db:generate

Write-Host "[2/4] Sincronizando banco..."
pnpm --filter "@coomerfans/backend" db:push -- --accept-data-loss --skip-generate

Write-Host "[3/4] Limpando duplicadas e recalculando contadores..."
Set-Location "$Root\packages\backend"
pnpm exec tsx -e "import { config } from 'dotenv'; import path from 'path'; config({path:path.resolve('../..','.env')}); async function main(){ const m=await import('./src/services/maintenance.service'); const db=await import('./src/config/database'); console.log(JSON.stringify({ dedupe: await m.dedupeAllMedia(), counters: await m.recalculateModelCounters() }, null, 2)); await db.prisma.$disconnect(); } main().catch((e)=>{ console.error(e); process.exit(1); });"

Write-Host "[4/4] Verificando tipos..."
Set-Location $Root
pnpm --filter "@coomerfans/backend" typecheck
pnpm --filter "@coomerfans/worker" typecheck
pnpm --filter "@coomerfans/frontend" typecheck

Write-Host "OK"
