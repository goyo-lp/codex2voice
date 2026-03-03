# Codex2Voice Ideation (Current)

## Product Direction
Codex2Voice is a terminal-first voice layer for Codex CLI.

Design intent:
- Keep user inside Codex workflow.
- Speak only final assistant answers.
- Default to silent sessions unless user enters `/plan` or manually enables voice.
- Allow quick manual override (`voice on` / `voice off` / `voice default`) per session.

## Key Decisions Locked In
- Platform priority: macOS.
- TTS provider: ElevenLabs only.
- Playback engine: `afplay`.
- Integration mode: Codex wrapper command + optional `codex` alias.
- Activation model:
  - `/plan` => voice on
  - `/default` => voice off
  - manual override can come from user-message intent parsing or skill script (`on|off|default`)
- Secret handling: macOS Keychain first, local secret file fallback, env fallback.

## Interaction Model
Primary commands:
- `init`
- `on` / `off` / `status`
- `codex -- ...`
- `speak`
- `ingest`
- `stop`
- `uninstall`
- `doctor`

Debug and reliability commands:
- `codex --debug-events -- ...`

## Reliability Strategy
- Parse structured Codex session events instead of terminal scraping.
- Accept multiple final-answer event shapes for compatibility.
- Parse mode controls from slash commands and metadata (`/plan`, `/default`, `collaboration_mode_kind`, `collaboration_mode.mode`).
- Parse manual voice intent from user messages (`voice on/off/default`, mute/unmute variants).
- Tail active session files efficiently to support multiple open terminals.
- Buffer partial JSONL lines across polls to avoid dropping mid-write events.
- Keep speech non-blocking from text UX.

## Performance Strategy
- Adaptive polling with backoff.
- Active-file targeting with periodic background sweeps.
- Incremental append reads with max read cap per tick.
- Optional cache write debounce (`CODEX2VOICE_CACHE_DEBOUNCE_MS`).

## Distribution Strategy
- Publishable npm CLI package.
- One-command global install.
- Guided setup via `codex2voice init`.
- Repo-shipped Codex skill: `skills/voice-control`.
