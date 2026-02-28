# Codex2Voice Execution Plan (Current State + GitHub Readiness)

## Objective
Keep `codex2voice` production-ready, publishable, and easy to extend.

## Current Implemented Capabilities
- Guided setup and alias wiring (`init`).
- Voice state control (`on/off/status`).
- Health checks with network timeout (`doctor`).
- Manual and cached speech (`speak`).
- Playback interruption (`stop`).
- Wrapper integration for Codex final-answer speech.
- Multi-session support for multiple open terminals.
- Parser debug mode (`--debug-events`).
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
- `node_modules/`, `dist/`, `.env*`, logs, OS/editor noise
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
- multi-terminal flow

## Next Recommended Engineering Steps
1. Add CI workflow for `check + test + build` on PRs.
2. Add npm publish workflow and versioning policy.
3. Add optional Linux playback adapter for future portability.
4. Add integration tests for end-to-end wrapper + playback mocks.

## Security and Operational Notes
- API key belongs in Keychain or env, never committed files.
- Session parsing consumes local Codex session files only.
- Voice failures must never block text response path.
