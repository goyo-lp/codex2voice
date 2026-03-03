# Codex2Voice Tech Stack (Current)

## Runtime
- Node.js 20+
- TypeScript (ESM)
- npm

## CLI and Core Libraries
- Commander
- Inquirer
- Zod
- Execa
- Pino

## TTS and Audio
- ElevenLabs REST API (`audio/mpeg`)
- macOS playback via `afplay`

## Build and Tests
- tsup
- tsx
- vitest
- typescript

## Storage and State
Default runtime directory: `${CODEX2VOICE_HOME:-~/.codex}`
- `voice.json` (config)
- `voice-cache.json` (last text)
- `voice-playback.json` (active playback metadata)
- `voice-audio/` (temp audio files)

Skill install target (local install scripts): `${CODEX_HOME:-~/.codex}/skills`

Session runtime channel:
- `CODEX2VOICE_SESSION_CONTROL_FILE` points to a per-session JSON control file used by skill scripts.

Reliability notes:
- Atomic JSON writes for config/cache/playback metadata.
- Secret storage prefers Keychain (`keytar`) with file/env fallback.

## Event Parsing
Codex wrapper consumes session JSONL events from `~/.codex/sessions`.

Supported final-answer signals:
- `event_msg.agent_message` with `phase=final_answer`
- `event_msg.task_complete.last_agent_message`
- `response_item.message` assistant with `phase=final_answer`

Supported control signals:
- `event_msg.task_started.collaboration_mode_kind` (`plan` / `default`)
- `turn_context.collaboration_mode.mode` (`plan` / `default`)
- `event_msg.user_message` slash commands (`/plan`, `/default`)
- `event_msg.user_message` manual voice phrases (`voice on/off/default`, mute/unmute variants)

## Skill Integration
Repo includes:
- `skills/voice-control/SKILL.md`
- `skills/voice-control/scripts/toggle-voice.sh`

Skill writes `manualVoice` = `on|off|default` to the session control file.

## Environment Variables
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`
- `CODEX2VOICE_DEBUG`
- `CODEX2VOICE_CACHE_DEBOUNCE_MS`
- `CODEX2VOICE_HOME`
- `CODEX_HOME` (used by local skill install scripts)
- `CODEX2VOICE_SESSION_CONTROL_FILE`
- `CODEX2VOICE_SESSION_CONTROL_DIR` (skill fallback discovery override)
