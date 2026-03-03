# Codex2Voice Execution Plan (Current State + GitHub Readiness)

## Objective
Keep `codex2voice` production-ready, publishable, and easy to extend.

## Current Implemented Capabilities
- Guided setup and alias wiring (`init`).
- Voice state control (`on/off/status`).
- Health checks with network timeout (`doctor`).
- Manual and cached speech (`speak`).
- Stdin ingest path (`ingest`, `ingest --force`).
- Playback interruption (`stop`).
- Local state cleanup (`uninstall`).
- Wrapper integration for Codex final-answer speech.
- Plan-aware voice activation:
  - `/plan` enables voice
  - `/default` disables voice
- Session-only manual override from user messages and optional skill script (`voice on/off/default`).
- Multi-session support for multiple open terminals.
- Parser debug mode + runtime metrics (`--debug-events`).
- Parser fixture tests and unit tests.

## Standard Build/Validation Workflow
1. `npm install`
2. `npm run check`
3. `npm test`
4. `npm run build`
5. `npm link` (for local global command testing)

## Release Hygiene Checklist
1. Confirm no secrets:
- Ensure no `.env` in repo
- Ensure no real keys in docs/tests
2. Confirm ignore rules:
- `node_modules/`, `.env*`, logs, OS/editor noise, local temp dirs (`.tmp/`, `tmp/`)
3. Confirm docs are current:
- `README.md`
- `CLI.md`
- `braionstorming/*.md`
4. Confirm tests green:
- unit tests
- parser fixture tests
5. Confirm wrapper behavior:
- interactive `codex` flow
- non-interactive `codex exec` flow
- plan-mode voice switching (`/plan`, `/default`)
- metadata-based mode detection (`collaboration_mode_kind` / `collaboration_mode.mode`)
- user-message and skill-based manual override paths
- websocket disable defaults unless explicitly overridden by user flags

## Next Recommended Engineering Steps
1. Add CI workflow for `check + test + build` on PRs.
2. Add npm publish workflow and versioning policy.
3. Add integration test harness for skill-driven session-control file updates.
4. Add optional Linux playback adapter for future portability.

## Security and Operational Notes
- API key resolution order is Keychain -> local secret file (`voice-secret.json`) -> `ELEVENLABS_API_KEY`.
- Never commit `.env` files, secret files, or real credentials.
- Session parsing consumes local Codex session files only.
- Voice failures must never block text response path.
- Session control file is ephemeral and cleaned up on wrapper exit.
