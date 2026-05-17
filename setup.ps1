$ErrorActionPreference = "Stop"

function Require-Command($Name, $InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name não encontrado. $InstallHint"
  }
}

Set-Location -LiteralPath $PSScriptRoot

Require-Command node "Instale Node.js 20+."
Require-Command pnpm "Instale com: npm install -g pnpm"

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host ".env criado a partir de .env.example"
}

pnpm install
pnpm --filter "@coomerfans/backend" db:generate
pnpm --filter "@coomerfans/worker" db:generate

Write-Host ""
Write-Host "Setup concluído."
Write-Host "Antes de iniciar, confirme PostgreSQL e Redis rodando."
Write-Host "Para sincronizar o banco: pnpm --filter @coomerfans/backend db:push"
