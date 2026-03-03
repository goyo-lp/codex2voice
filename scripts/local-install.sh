#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

cd "$REPO_ROOT"

echo "[codex2voice] building dist..."
npm run build

echo "[codex2voice] linking package globally for local testing..."
CODEX2VOICE_SKIP_AUTO_INIT=1 npm link

echo "[codex2voice] installing local Codex skills..."
sh ./scripts/install-skills.sh

echo "[codex2voice] checking first-time setup..."
node ./scripts/maybe-init.mjs

echo "[codex2voice] local install complete."
echo "Try: codex2voice --help"
