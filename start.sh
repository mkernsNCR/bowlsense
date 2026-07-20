#!/bin/bash
# Bowling Tracker - Start both backend and frontend
#
# Cloud backup: set CLOUD_REMOTE before starting to enable cloud sync.
# Examples:
#   CLOUD_REMOTE="gds:"               bash start.sh   # Google Drive remote named "gds"
#   CLOUD_REMOTE="s3backup:bowlsense"  bash start.sh   # S3 bucket
#   CLOUD_REMOTE=""                    bash start.sh   # Local-only (default)
#
# On the Pi, set in ~/.bashrc or ~/.profile to persist across reboots:
#   export CLOUD_REMOTE="gds:"
#
# See backup.sh for full cloud sync configuration details.

set -euo pipefail

echo "🎳 Starting Bowling Tracker..."

# Kill any existing instances
pkill -f "bowling-tracker" 2>/dev/null || true

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/backend"

# Start backend (pass cloud remote via env to backup script)
cd "$BACKEND_DIR"
CLOUD_REMOTE="${CLOUD_REMOTE:-}" \
  node --import tsx/esm src/server.ts &
BACKEND_PID=$!
echo "✅ Backend started (pid $BACKEND_PID) → http://localhost:3003"
if [[ -n "${CLOUD_REMOTE:-}" ]]; then
  echo "   ☁️  Cloud sync enabled: $CLOUD_REMOTE"
else
  echo "   ☁️  Cloud sync: disabled (set CLOUD_REMOTE to enable)"
fi

# Start frontend dev server
cd "$(dirname "${BASH_SOURCE[0]}")/frontend"
npm run dev &
FRONTEND_PID=$!
echo "✅ Frontend started (pid $FRONTEND_PID) → http://localhost:3004"

echo ""
echo "🎳 Bowling Tracker running!"
echo "   Open: http://localhost:3004"
echo "   API:  http://localhost:3003"
echo ""
echo "Press Ctrl+C to stop."
wait