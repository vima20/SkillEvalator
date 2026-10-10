$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path node_modules)) {
  Write-Host "Installing dependencies..."
  npm install
}

try {
  docker info | Out-Null
  Write-Host "Docker OK"
} catch {
  Write-Host "WARNING: Docker is not running. Grade step will fail until Docker Desktop is started."
}

if (-not (Test-Path .env) -and (Test-Path .env.example)) {
  Copy-Item .env.example .env
  Write-Host "Created .env from .env.example — set OPENAI_API_KEY before official runs."
}

Write-Host "Starting SkillEvalator on http://localhost:3000"
npm run dev
