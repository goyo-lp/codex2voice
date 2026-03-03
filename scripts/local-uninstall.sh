#!/usr/bin/env sh
set -eu

PACKAGE_NAME="@glozanop/codex2voice"

echo "[codex2voice] unlinking/removing global local install..."
npm unlink -g "$PACKAGE_NAME" >/dev/null 2>&1 || true

echo "[codex2voice] local uninstall complete."
