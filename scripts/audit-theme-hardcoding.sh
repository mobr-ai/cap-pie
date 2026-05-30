#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-src}"

echo "Theme hardcoding audit for: $ROOT"
echo

echo "Hardcoded color-like values by file:"
grep -RInE '#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|linear-gradient|radial-gradient|box-shadow|text-shadow' "$ROOT" \
  --include='*.css' --include='*.jsx' --include='*.js' \
  | cut -d: -f1 \
  | sort \
  | uniq -c \
  | sort -nr || true

echo
echo "Inline style props:"
grep -RInE 'style=\{\{|style=\{' "$ROOT" \
  --include='*.jsx' --include='*.js' || true
