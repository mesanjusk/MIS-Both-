#!/usr/bin/env bash
#
# Takes one compressed, timestamped archive of the MIS database.
#
# Deliberately does only that. There is no restore side to this script and no
# `--drop` anywhere in it: a restore is a decision someone makes with the
# runbook open (docs/DATABASE_BACKUP_RESTORE.md), not something a script can
# reach for by accident against the live cluster.
#
# The connection string is read from the environment and never echoed — not in
# the command line it builds, not in an error, not in --verbose output. That
# matters more than it looks: `ps` shows every argument of a running process to
# every user on the box, so the URI is handed to mongodump on stdin via
# --config rather than as an argument.
#
# Usage:  MONGO_URI='mongodb+srv://...' ./scripts/backup-mongo.sh
#         npm run backup:db
#
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_DIR="${MIS_BACKUP_DIR:-$REPO_ROOT/backups}"

die() { printf 'backup-mongo: %s\n' "$1" >&2; exit "${2:-1}"; }

# ── Preflight ──────────────────────────────────────────────────────────────
# Every check below fails the whole run rather than producing a partial or
# empty archive. An archive that exists but is unusable is worse than no
# archive, because it is the one you find out about during a restore.

[ -n "${MONGO_URI:-}" ] || die "MONGO_URI is not set in the environment.
  This script never reads a connection string from a file or an argument.
  Export it for this shell only, e.g.:
    read -rs MONGO_URI && export MONGO_URI
  See docs/DATABASE_BACKUP_RESTORE.md." 2

command -v mongodump >/dev/null 2>&1 || die "mongodump not found on PATH.
  Install the MongoDB Database Tools:
    https://www.mongodb.com/docs/database-tools/installation/
  Then re-run. See docs/DATABASE_BACKUP_RESTORE.md." 3

mkdir -p "$BACKUP_DIR" || die "cannot create backup directory: $BACKUP_DIR" 4
[ -w "$BACKUP_DIR" ] || die "backup directory is not writable: $BACKUP_DIR" 4

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="$BACKUP_DIR/mis-${STAMP}.archive.gz"

# mongodump --config takes a YAML file holding the URI, so the secret never
# appears in the process table. The file is created with a private umask,
# lives in the OS temp dir, and is removed on every exit path including a
# failure or a Ctrl-C.
CONFIG_FILE="$(umask 077 && mktemp "${TMPDIR:-/tmp}/mis-backup.XXXXXX")" \
  || die "cannot create a temporary config file" 4
cleanup() { rm -f "$CONFIG_FILE"; }
trap cleanup EXIT INT TERM

printf 'uri: "%s"\n' "$MONGO_URI" > "$CONFIG_FILE"

# ── Dump ───────────────────────────────────────────────────────────────────
printf 'backup-mongo: writing %s\n' "$ARCHIVE"

# stderr is kept on the terminal so connection failures are visible, but the
# URI is not among the arguments, so nothing here can leak it.
if ! mongodump --config="$CONFIG_FILE" --archive="$ARCHIVE" --gzip; then
  # A failed dump leaves a truncated archive that looks like a real backup in
  # a directory listing. Remove it so the only files here are complete ones.
  rm -f "$ARCHIVE"
  die "mongodump failed; the partial archive was removed.
  Check network access to the cluster and that the user has read on all
  databases being dumped. The connection string was not printed." 5
fi

[ -s "$ARCHIVE" ] || { rm -f "$ARCHIVE"; die "mongodump produced an empty archive; removed." 5; }

SIZE="$(du -h "$ARCHIVE" | cut -f1)"
printf 'backup-mongo: done — %s (%s)\n' "$ARCHIVE" "$SIZE"
printf 'backup-mongo: this archive is UNVERIFIED until it has been restored\n'
printf 'backup-mongo: into an isolated test database. See docs/DATABASE_BACKUP_RESTORE.md.\n'
