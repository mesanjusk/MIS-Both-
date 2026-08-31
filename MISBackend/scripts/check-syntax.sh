#!/usr/bin/env bash
#
# Parse every backend source file.
#
# The backend has no ESLint, and adding one would mean either a new dependency
# and a config to argue about, or a wall of legacy findings nobody acts on.
# This is the floor that actually matters for a Node service: a file that does
# not parse takes the whole process down on boot, and `node --check` catches
# exactly that with no dependencies at all.
#
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

failed=0
count=0
while IFS= read -r file; do
  count=$((count + 1))
  if ! node --check "$file" 2>/dev/null; then
    printf 'SYNTAX ERROR: %s\n' "$file" >&2
    node --check "$file" 2>&1 | sed 's/^/    /' >&2 || true
    failed=$((failed + 1))
  fi
done < <(find src scripts -name '*.js' -type f | sort)

if [ "$failed" -gt 0 ]; then
  printf '\n%d of %d backend files failed to parse.\n' "$failed" "$count" >&2
  exit 1
fi

printf 'All %d backend source files parse cleanly.\n' "$count"
