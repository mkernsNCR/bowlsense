#!/usr/bin/env bash
# ============================================================
# BowlSense DB Backup Script
# Backs up bowling.db with timestamped archives.
# Keeps last 14 local backups; syncs to cloud (rclone) if configured.
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
DB_PATH="$BACKEND_DIR/bowling.db"
BACKUP_DIR="$BACKEND_DIR/backups"
RETENTION_DAYS=14

# ── Cloud sync config (edit to enable) ─────────────────────
# Set CLOUD_REMOTE="gds:" (or your rclone remote name) to enable cloud sync.
# Example: CLOUD_REMOTE="gds:" — syncs to Google Drive "gds" remote
# Example: CLOUD_REMOTE="s3backup:bowlsense" — syncs to S3 bucket
: "${CLOUD_REMOTE:=}"
CLOUD_DEST_DIR="backups"

# ── Guard clauses ──────────────────────────────────────────
if [[ ! -f "$DB_PATH" ]]; then
  echo "[$(date -Iseconds)] ERROR: bowling.db not found at $DB_PATH — skipping backup"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# ── Timestamp ──────────────────────────────────────────────
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_TAG=$(date +%Y-%m-%d)
DOW=$(date +%a)

BACKUP_FILE="$BACKUP_DIR/bowling_${TIMESTAMP}.db"
BACKUP_LATEST="$BACKUP_DIR/bowling_latest.db"
LOG_FILE="$BACKUP_DIR/backup.log"

# ── Perform backup (hot copy — SQLite handles this fine) ───
cp "$DB_PATH" "$BACKUP_FILE"
cp "$DB_PATH" "$BACKUP_LATEST"

# ── Get sizes ──────────────────────────────────────────────
DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
BAK_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

echo "[$(date -Iseconds)] BACKUP OK  file=$BACKUP_FILE  db=${DB_SIZE}  backup=${BAK_SIZE}" >> "$LOG_FILE"

# ── Prune old local backups (> RETENTION_DAYS) ─────────────
pruned=0
while IFS= read -r oldbackup; do
  rm -f "$oldbackup"
  echo "[$(date -Iseconds)] PRUNED  $oldbackup" >> "$LOG_FILE"
  ((pruned++)) || true
done < <(find "$BACKUP_DIR" -name "bowling_20*.db" -type f ! -name "*_latest.db" -mtime +$RETENTION_DAYS 2>/dev/null || true)

# ── Cloud sync (if CLOUD_REMOTE is set and rclone is available) ──
cloud_ok=false
if [[ -n "$CLOUD_REMOTE" ]] && command -v rclone &>/dev/null; then
  echo "[$(date -Iseconds)] CLOUD_SYNC START  remote=${CLOUD_REMOTE}" >> "$LOG_FILE"

  # Sync all backup files to cloud (newer files only, no delete)
  if rclone sync "$BACKUP_DIR" "${CLOUD_REMOTE}/${CLOUD_DEST_DIR}" \
    --exclude "*.log" \
    --exclude "backup.log" \
    --quiet 2>&1 | tee -a "$LOG_FILE"; then
    cloud_ok=true
    echo "[$(date -Iseconds)] CLOUD_SYNC OK  remote=${CLOUD_REMOTE}/${CLOUD_DEST_DIR}" >> "$LOG_FILE"
  else
    echo "[$(date -Iseconds)] CLOUD_SYNC WARN  rclone sync failed — local backup is fine" >> "$LOG_FILE"
  fi
fi

# ── Summary ────────────────────────────────────────────────
backup_count=$(find "$BACKUP_DIR" -name "bowling_20*.db" -type f ! -name "*_latest.db" | wc -l)
echo "[$(date -Iseconds)] DONE  backups_on_disk=${backup_count}  pruned=${pruned}" >> "$LOG_FILE"

if $cloud_ok; then
  echo "✅ Backup complete + cloud synced to ${CLOUD_REMOTE} — ${backup_count} backups kept locally"
else
  echo "✅ Backup complete: bowling_${TIMESTAMP}.db (${BAK_SIZE}) — ${backup_count} backups kept"
fi