#!/bin/bash
# BowlSense Nightly Backup
# Backs up bowling.db to local + Google Drive (if rclone configured)

set -e

APP_DIR="/home/mkerns/bowling-tracker"
BACKUP_DIR="$APP_DIR/backups"
DB_FILE="$APP_DIR/backend/bowling.db"
RCLONE_REMOTE="gdrive:bowlsense-backups"
KEEP_DAYS=7

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="bowlsense_${TIMESTAMP}.sql"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"

mkdir -p "$BACKUP_DIR"

# Dump SQLite database
echo "[backup] Dumping database to $BACKUP_PATH"
sqlite3 "$DB_FILE" ".dump" > "$BACKUP_PATH"

# Compress
gzip "$BACKUP_PATH"
BACKUP_GZ="$BACKUP_PATH.gz"

# Sync to Google Drive if rclone is available and configured
if command -v rclone &>/dev/null; then
  if rclone listremotes 2>/dev/null | grep -q "$RCLONE_REMOTE"; then
    echo "[backup] Syncing to Google Drive: $RCLONE_REMOTE"
    rclone copy "$BACKUP_GZ" "$RCLONE_REMOTE/" --quiet
    echo "[backup] Google Drive sync complete"
  else
    echo "[backup] rclone remote '$RCLONE_REMOTE' not found — skipping cloud sync"
    echo "[backup] To set up: rclone config (add Google Drive as 'gdrive')"
  fi
else
  echo "[backup] rclone not found — skipping cloud sync"
  echo "[backup] Install with: curl https://rclone.org/install.sh | sudo bash"
fi

# Prune old local backups (keep last KEEP_DAYS)
echo "[backup] Pruning backups older than $KEEP_DAYS days"
find "$BACKUP_DIR" -name "bowlsense_*.sql.gz" -mtime +$KEEP_DAYS -delete 2>/dev/null || true

# Also prune old Google Drive backups (keep last KEEP_DAYS)
if command -v rclone &>/dev/null && rclone listremotes 2>/dev/null | grep -q "$RCLONE_REMOTE"; then
  rclone delete "$RCLONE_REMOTE/" --min-age "${KEEP_DAYS}d" --quiet 2>/dev/null || true
fi

echo "[backup] Done — $BACKUP_GZ"