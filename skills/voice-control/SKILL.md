---
name: voice-control
description: Detect user intent to control Codex2Voice session speech and call the voice toggle script.
---

# Voice Control Skill

## Purpose
Control Codex2Voice speech for the current Codex wrapper session.

This skill should be used when the user asks to:
- turn voice on
- turn voice off
- mute/unmute
- disable/enable spoken answers
- return to default automatic behavior

## Behavior
1. Infer user intent from natural language.
2. Map intent to one of:
- `on`
- `off`
- `default` (clear manual override and return to automatic `/plan` behavior)
3. Run the shell script:

```bash
"${CODEX_HOME:-$HOME/.codex}/skills/voice-control/scripts/toggle-voice.sh" <on|off|default>
```

## Intent Mapping Guidance
- Use `on` for phrases like: `voice on`, `speak responses`, `unmute`, `enable voice`.
- Use `off` for phrases like: `voice off`, `mute`, `stop speaking`, `disable voice`.
- Use `default` for phrases like: `reset voice mode`, `follow plan mode`, `clear override`.

## Notes
- This affects only the current wrapper session.
- The script prefers `CODEX2VOICE_SESSION_CONTROL_FILE` from environment.
- If the env var is missing, it falls back to the newest `session-*.json` in `${CODEX2VOICE_SESSION_CONTROL_DIR:-${TMPDIR:-/tmp}/codex2voice-session-control}`.
- If neither exists, inform the user they should run through `codex2voice codex -- ...`.
- Do not run `./scripts/toggle-voice.sh` from arbitrary working directories; use the absolute skills path command above.
