$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

Start-Process powershell -ArgumentList "-NoExit", "-NoProfile", "-Command", "Set-Location -LiteralPath '$PSScriptRoot\packages\backend'; pnpm dev"
Start-Process powershell -ArgumentList "-NoExit", "-NoProfile", "-Command", "Set-Location -LiteralPath '$PSScriptRoot\packages\worker'; pnpm dev"
Start-Process powershell -ArgumentList "-NoExit", "-NoProfile", "-Command", "Set-Location -LiteralPath '$PSScriptRoot\packages\frontend'; pnpm dev -- --host 0.0.0.0"

Write-Host "Serviços iniciando."
Write-Host "Frontend: http://localhost:5173"
Write-Host "Backend:  http://localhost:3001"
