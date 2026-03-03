# Codex2Voice CLI Commands

## Important
All commands below are terminal commands.

If alias setup is enabled in `~/.zshrc`, `codex` routes through `codex2voice codex --`.

## Setup and Health

### Local Testing Install (no npm publish)
From the repo root:
- `npm install`
- `npm run local:install` (build + `npm link` + install local skills into `${CODEX_HOME:-~/.codex}/skills`)
- `npm run local:install:tarball` (build + `npm pack` + global tarball install + install local skills into `${CODEX_HOME:-~/.codex}/skills`)
- `npm run local:install:skills` (sync local `./skills` only)
- `npm run local:uninstall`
- `npm run local:reinstall`
- First-time local install auto-launches `codex2voice init` in interactive terminals.

### `codex2voice init`
Guided setup.
- Prompts for ElevenLabs API key
- Prompts for voice ID
- Prompts for default voice enablement and speech speed
- Optionally adds `codex` alias wrapper in `~/.zshrc`
- Stores API key in macOS Keychain when available (fallback: `${CODEX2VOICE_HOME:-~/.codex}/voice-secret.json`)
- Persists settings in `${CODEX2VOICE_HOME:-~/.codex}/voice.json` (one-time setup unless you want to change values)
- Auto-launched on first local/global install when terminal is interactive.

### `codex2voice doctor`
Diagnostics check.
Checks:
- `codex` installed
- `afplay` available
- config readable
- codex dir writable
- API key present
- ElevenLabs reachable (with timeout)
- voice ID configured

## Voice State Commands

### `codex2voice on`
Enable persistent voice config (global setting file).

### `codex2voice off`
Disable persistent voice config (global setting file).

### `codex2voice status`
Show current config summary.
- Includes API key presence check (`configured` / `not set`) without printing the secret.

## Speech Commands

### `codex2voice speak "your text"`
Speak provided text immediately.

### `codex2voice speak`
Speak last cached assistant text.

### `codex2voice stop`
Stop active playback.

## Codex Wrapper Commands

### `codex2voice codex -- "<your prompt>"`
Run Codex via wrapper and auto-speak final answer using session-aware control:
- default session voice: off
- `/plan`: voice on
- `/default`: voice off
- plan/default mode metadata from Codex sessions is also honored automatically
- user-message controls (`voice on/off`, `/voice on/off/default`) can force per-session override
- skill/script override can also force on/off/default for current session
- wrapper injects `--disable responses_websockets --disable responses_websockets_v2` unless you already pass explicit websocket feature flags

Examples:
- `codex2voice codex -- "hello"`
- `codex2voice codex -- "explain this error"`

### `codex2voice codex --debug-events -- "<your prompt>"`
Run wrapper with parser traces and runtime polling metrics.

Examples:
- `codex2voice codex --debug-events -- "hello"`
- `codex2voice codex --debug-events --` (interactive)

## Session Voice Override Skill

### Skill Files
- `skills/voice-control/SKILL.md`
- `skills/voice-control/scripts/toggle-voice.sh`

### Behavior
- Wrapper parses user-message intent like `voice on`, `voice off`, `mute`, `unmute`, `reset voice`.
- Skill writes to `CODEX2VOICE_SESSION_CONTROL_FILE` to set `manualVoice` (`on|off|default`).
- If that env var is unavailable, the script falls back to the newest `session-*.json` in `${CODEX2VOICE_SESSION_CONTROL_DIR:-${TMPDIR:-/tmp}/codex2voice-session-control}`.
- Override applies only to current wrapper session.

## Stdin Pipeline

### `echo "text" | codex2voice ingest`
Cache stdin text and apply normal speech eligibility.

### `echo "text" | codex2voice ingest --force`
Cache stdin text and bypass the `enabled/autoSpeak` gate (content filtering still applies).

## Cleanup

### `codex2voice uninstall`
Remove local codex2voice state and managed alias block.

## Environment Variables
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`
- `CODEX2VOICE_DEBUG`
- `CODEX2VOICE_CACHE_DEBOUNCE_MS`
- `CODEX2VOICE_HOME`
- `CODEX_HOME` (used by local skill install scripts)
- `CODEX2VOICE_SESSION_CONTROL_FILE` (set by wrapper for current session)
- `CODEX2VOICE_SESSION_CONTROL_DIR` (optional override for skill fallback discovery)
