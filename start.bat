@echo off
REM One-click launcher for Windows: installs modules on first run, then starts the bot.
cd /d "%~dp0"
if not exist .env (
  copy .env.example .env >nul
  echo Created .env - open it with Notepad, paste your DISCORD_TOKEN, then run start.bat again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing modules ^(first run only^)...
  call npm install --omit=dev
  if errorlevel 1 pause & exit /b 1
)
node src\index.js
pause
