# Codex2Voice Ideation (Current)

## Product Direction
Codex2Voice is a terminal-first voice layer for Codex CLI.

Design intent:
- Keep user inside Codex workflow.
- Speak only final assistant answers.
- Avoid speaking code-heavy noise unless summarized.
- Let voice be toggled instantly (`on/off`).

## Key Decisions Locked In
- Platform priority: macOS.
- TTS provider: ElevenLabs only.
- Playback engine: `afplay`.
- Integration mode: Codex wrapper command + optional `codex` alias.
- Secret handling: macOS Keychain first, env fallback.

## Interaction Model
Primary commands:
- `init`
- `on` / `off` / `status`
- `codex -- ...`
- `speak`
- `stop`
- `doctor`

Debug and reliability commands:
- `codex --debug-events -- ...`

## Reliability Strategy
- Parse structured Codex session events instead of terminal scraping.
- Accept multiple final-answer event shapes for compatibility.
- Tail active session files efficiently to support multiple open terminals.
- Keep speech non-blocking from text UX.

## Performance Strategy
- Poll + incremental append reads from session files.
- Optional cache write debounce (`CODEX2VOICE_CACHE_DEBOUNCE_MS`).
- Fast model defaults configurable in `voice.json`.

## Distribution Strategy
- Publishable npm CLI package.
- One-command global install.
- Guided setup via `codex2voice init`.
