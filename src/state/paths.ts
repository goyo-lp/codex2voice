import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

const OVERRIDE_HOME = process.env.CODEX2VOICE_HOME;
const CODEX_DIR = OVERRIDE_HOME ?? path.join(os.homedir(), '.codex');

export const PATHS = {
  codexDir: CODEX_DIR,
  config: path.join(CODEX_DIR, 'voice.json'),
  cache: path.join(CODEX_DIR, 'voice-cache.json'),
  playback: path.join(CODEX_DIR, 'voice-playback.json'),
  tempAudioDir: path.join(CODEX_DIR, 'voice-audio')
};

export async function ensureCodexDir(): Promise<void> {
  await fs.mkdir(PATHS.codexDir, { recursive: true });
  await fs.mkdir(PATHS.tempAudioDir, { recursive: true });
}
