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
Default directory: `~/.codex`
- `voice.json` (config)
- `voice-cache.json` (last text)
- `voice-playback.json` (active playback metadata)
- `voice-audio/` (temp audio files)

Reliability notes:
- Atomic JSON writes for config/cache/playback metadata.
- Keychain-backed secret storage via `keytar`.

## Event Parsing
Codex wrapper consumes session JSONL events from `~/.codex/sessions`.
Supported final-answer signals:
- `event_msg.agent_message` with `phase=final_answer`
- `event_msg.task_complete.last_agent_message`
- `response_item.message` assistant with `phase=final_answer`

## Environment Variables
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`
- `CODEX2VOICE_DEBUG`
- `CODEX2VOICE_CACHE_DEBOUNCE_MS`
- `CODEX2VOICE_HOME`
