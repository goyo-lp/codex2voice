#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
SOURCE_SKILLS_DIR="$REPO_ROOT/skills"
CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"
TARGET_SKILLS_DIR="$CODEX_HOME_DIR/skills"

if [ ! -d "$SOURCE_SKILLS_DIR" ]; then
  echo "[codex2voice] no local skills directory found at $SOURCE_SKILLS_DIR"
  exit 0
fi

mkdir -p "$TARGET_SKILLS_DIR"

installed_count=0
for skill_path in "$SOURCE_SKILLS_DIR"/*; do
  if [ ! -d "$skill_path" ]; then
    continue
  fi

  skill_name=$(basename "$skill_path")
  target_path="$TARGET_SKILLS_DIR/$skill_name"

  rm -rf "$target_path"
  cp -R "$skill_path" "$target_path"
  chmod +x "$target_path"/scripts/*.sh 2>/dev/null || true

  installed_count=$((installed_count + 1))
  echo "[codex2voice] installed skill: $skill_name -> $target_path"
done

if [ "$installed_count" -eq 0 ]; then
  echo "[codex2voice] no installable skill directories found under $SOURCE_SKILLS_DIR"
else
  echo "[codex2voice] installed $installed_count local skill(s)"
fi
