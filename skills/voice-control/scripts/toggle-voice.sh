#!/usr/bin/env bash
set -euo pipefail

raw_input="${*:-}"
first_arg="${1:-}"

normalize_mode() {
  local candidate="$1"
  local lower
  lower="$(printf '%s' "$candidate" | tr '[:upper:]' '[:lower:]')"

  case "$lower" in
    on|enable|enabled|unmute)
      printf 'on'
      return 0
      ;;
    off|disable|disabled|mute)
      printf 'off'
      return 0
      ;;
    default|clear|auto|reset)
      printf 'default'
      return 0
      ;;
  esac

  if printf '%s' "$lower" | grep -Eq '\b(unmute|enable voice|voice on|speak)\b'; then
    printf 'on'
    return 0
  fi
  if printf '%s' "$lower" | grep -Eq '\b(mute|disable voice|voice off|stop speaking)\b'; then
    printf 'off'
    return 0
  fi
  if printf '%s' "$lower" | grep -Eq '\b(reset|default|clear override|auto mode|plan mode)\b'; then
    printf 'default'
    return 0
  fi

  return 1
}

mode=""
if mode="$(normalize_mode "$first_arg")"; then
  :
elif mode="$(normalize_mode "$raw_input")"; then
  :
else
  echo "Could not determine voice mode. Use: on | off | default" >&2
  exit 2
fi

resolve_latest_control_file() {
  local control_dir="$1"
  local candidate=""
  local latest_file=""
  local latest_mtime=0
  local mtime=0
  local files=()

  shopt -s nullglob
  files=("$control_dir"/session-*.json)
  shopt -u nullglob

  if [[ "${#files[@]}" -eq 0 ]]; then
    return 1
  fi

  for candidate in "${files[@]}"; do
    if [[ ! -f "$candidate" ]]; then
      continue
    fi

    if mtime="$(stat -f '%m' "$candidate" 2>/dev/null)"; then
      :
    elif mtime="$(stat -c '%Y' "$candidate" 2>/dev/null)"; then
      :
    else
      continue
    fi

    if [[ -z "$latest_file" || "$mtime" -gt "$latest_mtime" ]]; then
      latest_file="$candidate"
      latest_mtime="$mtime"
    fi
  done

  if [[ -z "$latest_file" ]]; then
    return 1
  fi

  printf '%s' "$latest_file"
}

control_file="${CODEX2VOICE_SESSION_CONTROL_FILE:-}"
if [[ -z "$control_file" ]]; then
  control_dir="${CODEX2VOICE_SESSION_CONTROL_DIR:-${TMPDIR:-/tmp}/codex2voice-session-control}"
  if control_file="$(resolve_latest_control_file "$control_dir")"; then
    echo "CODEX2VOICE_SESSION_CONTROL_FILE is not set. Falling back to latest session file: $control_file" >&2
  else
    echo "CODEX2VOICE_SESSION_CONTROL_FILE is not set, and no session control file was found in: $control_dir" >&2
    echo "Run Codex through: codex2voice codex -- ..." >&2
    exit 1
  fi
fi

mkdir -p "$(dirname "$control_file")"
tmp_file="${control_file}.tmp.$$"

updated_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
cat > "$tmp_file" <<JSON
{
  "manualVoice": "$mode",
  "updatedAt": "$updated_at",
  "source": "codex-skill"
}
JSON

mv "$tmp_file" "$control_file"
echo "codex2voice session voice: $mode"
