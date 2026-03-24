#!/usr/bin/env bash
# Auto-commit and push any uncommitted changes in team-link
set -euo pipefail

cd /home/zephyrus/team-link

# Only proceed if there are changes
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  exit 0
fi

git add -A
git commit -m "auto: incremental update $(date '+%Y-%m-%d %H:%M')"
git push origin main
