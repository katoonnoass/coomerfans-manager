$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

Start-Process powershell -ArgumentList "-NoExit", "-NoProfile", "-Command", "Set-Location -LiteralPath '$PSScriptRoot\packages\backend'; pnpm start"
Start-Process powershell -ArgumentList "-NoExit", "-NoProfile", "-Command", "Set-Location -LiteralPath '$PSScriptRoot\packages\worker'; pnpm start"
Start-Process powershell -ArgumentList "-NoExit", "-NoProfile", "-Command", "Set-Location -LiteralPath '$PSScriptRoot\packages\frontend'; pnpm dev -- --host 0.0.0.0"

Write-Host "CoomerFans iniciado."
Write-Host "Abra http://localhost:5173"
