# Codex2Voice

Welcome to **Codex2Voice**.

If you use Codex heavily, this project adds one missing piece: your assistant can **speak final answers out loud** while you keep coding.

## What This Project Is
Codex2Voice is a macOS-first companion CLI for Codex.
It wraps Codex sessions and turns final assistant responses into audio using ElevenLabs.

## What It Does
- Speaks **final assistant answers only**.
- Avoids speaking UI/status noise.
- Works with interactive Codex sessions and `codex exec` flows.
- Supports multiple open Codex terminals.
- Lets you toggle voice instantly (`on` / `off`).
- Keeps text workflow intact even if voice fails.

## Why It Matters
- Faster feedback loop while coding.
- Better hands-free workflow when using dictation/voice input.
- Keeps everything in terminal, no context switching.

## Prerequisites
- macOS
- Node.js 20+
- npm
- Codex CLI installed and working (`codex --version`)
- ElevenLabs account (API key + voice ID)

## Install
```bash
npm i -g @glozanop/codex2voice
```

If npm publish is pending, use:
```bash
npm i -g https://codeload.github.com/goyo-lp/codex2voice/tar.gz/main
```

## Step-by-Step Setup

### 1. Run guided setup
```bash
codex2voice init
```

You will be prompted for:
- ElevenLabs API key
- ElevenLabs voice ID
- Voice default state (on/off)
- Speech speed
- Optional alias setup so `codex` automatically routes through Codex2Voice

### 2. Run health checks
```bash
codex2voice doctor
```

This verifies:
- `codex` command exists
- `afplay` is available
- config is readable/writable
- API key is present
- ElevenLabs is reachable
- voice ID is configured

### 3. Confirm status
```bash
codex2voice status
```

### 4. Start using Codex with voice
If alias setup was enabled during `init`, just run:
```bash
codex
```

If alias setup was skipped, run:
```bash
codex2voice codex --
```

## Daily Workflow
```bash
codex2voice on          # enable voice
codex                   # ask Codex normally
codex2voice off         # disable voice in public
codex2voice speak       # replay last answer
codex2voice stop        # stop playback immediately
```

## Command Quick Reference
- `codex2voice init`
- `codex2voice on`
- `codex2voice off`
- `codex2voice status`
- `codex2voice doctor`
- `codex2voice speak "text"`
- `codex2voice speak`
- `codex2voice stop`
- `codex2voice codex -- "prompt"`
- `codex2voice codex --debug-events -- "prompt"`

Full command docs: [CLI.md](./CLI.md)

## Configuration and Local State
Default path: `~/.codex`
- `voice.json` (settings)
- `voice-cache.json` (last answer cache)
- `voice-playback.json` (playback metadata)
- `voice-audio/` (temporary audio)

## Secrets and Security
- Preferred API key storage: macOS Keychain (via `init`)
- Fallback: `ELEVENLABS_API_KEY` environment variable
- Do not commit `.env` or real keys
- Use [.env.example](./.env.example) as template only

## Environment Variables
See [.env.example](./.env.example) for supported variables:
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`
- `CODEX2VOICE_DEBUG`
- `CODEX2VOICE_CACHE_DEBOUNCE_MS`
- `CODEX2VOICE_HOME`

## Troubleshooting
- No voice output: run `codex2voice doctor`
- Need parser diagnostics: `codex2voice codex --debug-events --`
- Wrong voice: rerun `codex2voice init`
- Stop audio immediately: `codex2voice stop`

## Development
```bash
npm install
npm run check
npm test
npm run build
npm link
```
