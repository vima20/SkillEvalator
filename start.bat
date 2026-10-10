@echo off
setlocal
cd /d "%~dp0"

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
  echo WARNING: Docker is not running. Grade step will fail until Docker Desktop is started.
) else (
  echo Docker OK
)

if not exist .env (
  if exist .env.example copy .env.example .env >nul
  echo Created .env from .env.example — set OPENAI_API_KEY before official runs.
)

echo Starting SkillEvalator on http://127.0.0.1:30001
call npm run dev
