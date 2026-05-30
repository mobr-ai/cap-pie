#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-src}"

echo "CSS files ranked by line count:"
find "$ROOT" -type f -iname "*.css" -print0 \
  | xargs -0 wc -l \
  | sort -nr

echo
echo "CSS files over 300 lines:"
find "$ROOT" -type f -iname "*.css" -print0 \
  | xargs -0 wc -l \
  | awk '$1 ~ /^[0-9]+$/ && $1 > 300 { print }' \
  | sort -nr

echo
echo "CSS files ranked by byte size:"
find "$ROOT" -type f -iname "*.css" -print0 \
  | xargs -0 wc -c \
  | sort -nr
