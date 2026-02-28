# Codex2Voice CLI Commands

## Important
All commands below are terminal commands.

If alias setup is enabled in `~/.zshrc`, `codex` routes through `codex2voice codex --`.

## Setup and Health

### `codex2voice init`
Guided setup.
- Prompts for ElevenLabs API key
- Prompts for voice ID
- Prompts for default voice enablement and speech speed
- Optionally adds `codex` alias wrapper in `~/.zshrc`
- Stores API key in macOS Keychain (preferred)

### `codex2voice doctor`
Diagnostics check.
Checks:
- `codex` installed
- `afplay` available
- config readable/writable
- API key present
- ElevenLabs reachable (with timeout)
- voice ID configured

## Voice State

### `codex2voice on`
Enable voice output.

### `codex2voice off`
Disable voice output.

### `codex2voice status`
Show current config summary.

## Speech Commands

### `codex2voice speak "your text"`
Speak provided text immediately.

### `codex2voice speak`
Speak last cached assistant text.

### `codex2voice stop`
Stop active playback.

## Codex Wrapper Commands

### `codex2voice codex -- "<your prompt>"`
Run Codex via wrapper and auto-speak final answer when enabled.

Examples:
- `codex2voice codex -- "hello"`
- `codex2voice codex -- "explain this error"`

### `codex2voice codex --debug-events -- "<your prompt>"`
Run wrapper with parser traces to debug why speech did or did not trigger.

Examples:
- `codex2voice codex --debug-events -- "hello"`
- `codex2voice codex --debug-events --` (interactive)

## Stdin Pipeline

### `echo "text" | codex2voice ingest`
Cache stdin text and apply normal speech eligibility.

### `echo "text" | codex2voice ingest --force`
Cache stdin text and force speech even if voice is off.

## Cleanup

### `codex2voice uninstall`
Remove local codex2voice state and managed alias block.

## Environment Variables
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`
- `CODEX2VOICE_DEBUG`
- `CODEX2VOICE_CACHE_DEBOUNCE_MS`
- `CODEX2VOICE_HOME`
