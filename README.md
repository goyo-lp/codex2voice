# Codex2Voice

Codex2Voice is a macOS-first companion CLI for Codex that gives Codex spoken final answers using ElevenLabs.

## What This Project Is
Codex2Voice wraps Codex sessions, reads structured session events, and speaks only final assistant answers.

## Current Voice Model
- Default session state: voice **off**.
- Enter `/plan`: voice auto-switches **on**.
- Enter `/default`: voice auto-switches **off** (unless manually overridden).
- Plan/default mode is also auto-detected from Codex session metadata (`collaboration_mode_kind` / `collaboration_mode.mode`).
- Manual per-session overrides are accepted from user messages (`voice on`, `voice off`, `/voice default`) and via the optional Codex skill script.
- Outside `/plan`, voice can still be enabled manually for the current session.

## What It Does
- Speaks final assistant answers only.
- Filters non-answer event noise.
- Supports interactive and `codex exec` wrapper flows.
- Auto-disables Codex websocket response flags by default (`responses_websockets`, `responses_websockets_v2`) unless you explicitly override those flags.
- Supports multiple open Codex terminals.
- Keeps text workflow intact even if voice fails.

## Optimization Roadmap
- Current runtime uses adaptive JSONL file polling.
- If Codex exposes a stable structured live event hook for this workflow, migrate from file polling to direct event streaming.

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
On first global install in an interactive terminal, setup will auto-launch `codex2voice init`.
If install runs in a non-interactive context, run `codex2voice init` manually.

If npm publish is pending, use:
```bash
npm i -g https://codeload.github.com/goyo-lp/codex2voice/tar.gz/main
```

## Local Install (No npm Publish Required)
From this repo directory:
```bash
npm install
npm run local:install
```
This now also installs local skills from `./skills` into `${CODEX_HOME:-~/.codex}/skills`.
(`CODEX_HOME` controls skill install target; runtime config/cache still use `${CODEX2VOICE_HOME:-~/.codex}`.)
On first local install in an interactive terminal, setup auto-launches `codex2voice init`.

Alternative local tarball flow:
```bash
npm install
npm run local:install:tarball
```
This also installs local skills from `./skills` into `${CODEX_HOME:-~/.codex}/skills`.

Re-sync local skills only:
```bash
npm run local:install:skills
```

Uninstall local global install:
```bash
npm run local:uninstall
```

## Step-by-Step Setup

### 1. Run guided setup
```bash
codex2voice init
```
`init` is persistent. It stores settings in `${CODEX2VOICE_HOME:-~/.codex}/voice.json` and stores API key in Keychain (or `${CODEX2VOICE_HOME:-~/.codex}/voice-secret.json` fallback).
You should only need to re-run `init` when you want to change settings.

### 2. Install the optional voice-control Codex skill
This repo includes a local skill at `skills/voice-control`.
If you used `npm run local:install` or `npm run local:install:tarball`, this was installed automatically.

For non-local-install flows, copy it into your Codex skills directory so Codex can call the toggle script from natural language intent.

Example:
```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R ./skills/voice-control "${CODEX_HOME:-$HOME/.codex}/skills/voice-control"
```

### 3. Run health checks
```bash
codex2voice doctor
```

### 4. Confirm status
```bash
codex2voice status
```

### 5. Start Codex with wrapper
If alias setup was enabled during `init`, run:
```bash
codex
```
or:
```bash
codex-voice
```

If alias setup was skipped:
```bash
codex2voice codex --
```

## Daily Workflow
```bash
codex                        # wrapped codex session
/plan                        # auto voice on
/default                     # auto voice off
/voice on                    # manual override on
/voice off                   # manual override off
/voice default               # clear manual override
codex2voice speak            # replay cached assistant text
echo "quick update" | codex2voice ingest --force   # bypass enabled/autoSpeak gate
codex2voice stop             # stop playback immediately
```

## Commands
- `codex2voice init`
- `codex2voice on`
- `codex2voice off`
- `codex2voice status`
- `codex2voice doctor`
- `codex2voice speak "text"`
- `codex2voice speak`
- `codex2voice ingest`
- `codex2voice ingest --force`
- `codex2voice stop`
- `codex2voice uninstall`
- `codex2voice codex -- "prompt"`
- `codex2voice codex --debug-events -- "prompt"`

Full command docs: [CLI.md](./CLI.md)

## Configuration and Local State
Default runtime path: `${CODEX2VOICE_HOME:-~/.codex}`
- `voice.json` (settings)
- `voice-cache.json` (last answer cache)
- `voice-playback.json` (playback metadata)
- `voice-audio/` (temporary audio)

Per-session manual override channel is provided through the env var:
- `CODEX2VOICE_SESSION_CONTROL_FILE` (set automatically by wrapper)
- If the env var is unavailable, the voice-control skill falls back to the latest active
  `${TMPDIR:-/tmp}/codex2voice-session-control/session-*.json` file.

## Secrets and Security
- Preferred API key storage: macOS Keychain (via `init`)
- Runtime fallback chain: Keychain -> `${CODEX2VOICE_HOME:-~/.codex}/voice-secret.json` -> `ELEVENLABS_API_KEY`
- Do not commit `.env` or real keys
- Use `.env.example` as template only

## Environment Variables
Common variables:
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`
- `CODEX2VOICE_DEBUG`
- `CODEX2VOICE_CACHE_DEBOUNCE_MS`
- `CODEX2VOICE_HOME`
- `CODEX_HOME` (used by `scripts/install-skills.sh`)
- `CODEX2VOICE_SESSION_CONTROL_FILE` (wrapper-managed per-session control channel)
- `CODEX2VOICE_SESSION_CONTROL_DIR` (optional override for session control file discovery)

## Troubleshooting
- No voice output: run `codex2voice doctor`
- Need parser diagnostics and polling metrics: `codex2voice codex --debug-events --`
- Manual overrides not applying: verify `skills/voice-control` is installed and executable, and start Codex through `codex2voice codex --` (or `codex` / `codex-voice` alias installed by `init`)
- Stop audio immediately: `codex2voice stop`

## Development
```bash
npm install
npm run check
npm test
npm run build
npm link
```
