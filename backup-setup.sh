#!/bin/bash
# BowlSense Backup Setup — run once to configure nightly backups

set -e

APP_DIR="/home/mkerns/bowling-tracker"
BACKUP_SCRIPT="$APP_DIR/backup.sh"
BACKUP_LOG="$APP_DIR/backups/backup.log"
CRON_CMD="5 2 * * * $BACKUP_SCRIPT >> $BACKUP_LOG 2>&1"

echo "Setting up BowlSense nightly backup..."

# Make script executable
chmod +x "$BACKUP_SCRIPT"
echo "✓ Made backup.sh executable"

# Create backups dir
mkdir -p "$APP_DIR/backups"

# Add cron job (remove existing first to avoid duplicates)
echo "Adding cron job..."
( crontab -l 2>/dev/null | grep -v "backup.sh" ; echo "$CRON_CMD" ) | crontab -

echo ""
echo "✅ Backup cron job installed!"
echo ""
echo "Cron entry:"
crontab -l | grep backup.sh
echo ""
echo "---"
echo "To check rclone: rclone listremotes"
echo "To set up rclone: rclone config"
echo "To test backup now: $BACKUP_SCRIPT"
echo "To view logs: cat $BACKUP_LOG"