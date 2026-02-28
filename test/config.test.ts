import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';

const testHome = path.join(os.tmpdir(), `codex2voice-test-${Date.now()}`);
process.env.CODEX2VOICE_HOME = testHome;

const { readConfig, updateConfig } = await import('../src/state/config.js');

describe('config', () => {
  beforeEach(async () => {
    await fs.rm(testHome, { recursive: true, force: true });
  });

  it('creates defaults on first read', async () => {
    const config = await readConfig();
    expect(config.enabled).toBe(true);
    expect(config.summarizeCodeHeavy).toBe(true);
  });

  it('updates config values', async () => {
    await updateConfig({ enabled: false, voiceId: 'abc123' });
    const config = await readConfig();
    expect(config.enabled).toBe(false);
    expect(config.voiceId).toBe('abc123');
  });
});
