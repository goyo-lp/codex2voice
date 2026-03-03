import { describe, expect, it } from 'vitest';
import { resolveInitApiKeyDecision } from '../src/commands/init.js';

describe('init api key persistence decisions', () => {
  it('retains existing persisted key when user does not replace it', () => {
    const decision = resolveInitApiKeyDecision('existing-key-1234567890', { replaceApiKey: false });
    expect(decision).toEqual({ action: 'retain' });
  });

  it('persists new key when user opts to replace', () => {
    const decision = resolveInitApiKeyDecision('existing-key-1234567890', {
      replaceApiKey: true,
      apiKey: 'new-key-ABCDEFGHIJK'
    });
    expect(decision).toEqual({ action: 'persist', apiKey: 'new-key-ABCDEFGHIJK' });
  });

  it('persists provided key when no existing key is available', () => {
    const decision = resolveInitApiKeyDecision(null, { apiKey: 'first-key-ABCDEFGHIJK' });
    expect(decision).toEqual({ action: 'persist', apiKey: 'first-key-ABCDEFGHIJK' });
  });

  it('throws when no existing key and no new key are available', () => {
    expect(() => resolveInitApiKeyDecision(null, {})).toThrow('Missing ElevenLabs API key.');
  });
});
