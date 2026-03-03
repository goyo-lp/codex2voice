#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

cd "$REPO_ROOT"

echo "[codex2voice] building dist..."
npm run build

echo "[codex2voice] packing tarball..."
TARBALL=$(npm pack --silent | tail -n 1)

echo "[codex2voice] installing tarball globally: $TARBALL"
CODEX2VOICE_SKIP_AUTO_INIT=1 npm install -g "./$TARBALL"

echo "[codex2voice] installing local Codex skills..."
sh ./scripts/install-skills.sh

echo "[codex2voice] checking first-time setup..."
node ./scripts/maybe-init.mjs

echo "[codex2voice] local tarball install complete."
echo "Try: codex2voice --help"
