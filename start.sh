#!/usr/bin/env sh
# One-click launcher for Linux / macOS: installs modules on first run, then starts the bot.
cd "$(dirname "$0")" || exit 1
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env — open it, paste your DISCORD_TOKEN, then run ./start.sh again."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Installing modules (first run only)..."
  npm install --omit=dev || exit 1
fi
node src/index.js
