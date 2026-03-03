import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PATHS, ensureCodexDir } from '../state/paths.js';
import { logger } from '../core/logger.js';
import { readConfig } from '../state/config.js';
import { writeJsonAtomic } from '../state/json.js';

type PlaybackState = {
  pid: number;
  filePath: string;
  startedAt: string;
};

async function readPlaybackState(): Promise<PlaybackState | null> {
  try {
    const raw = await fs.readFile(PATHS.playback, 'utf8');
    return JSON.parse(raw) as PlaybackState;
  } catch {
    return null;
  }
}

async function writePlaybackState(state: PlaybackState): Promise<void> {
  await writeJsonAtomic(PATHS.playback, state);
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function cleanupStaleState(): Promise<void> {
  const state = await readPlaybackState();
  if (!state) return;

  if (!isPidAlive(state.pid)) {
    await fs.rm(state.filePath, { force: true });
    await fs.rm(PATHS.playback, { force: true });
  }
}

export async function stopPlayback(): Promise<boolean> {
  await cleanupStaleState();
  const state = await readPlaybackState();
  if (!state) return false;

  try {
    process.kill(state.pid, 'SIGTERM');
  } catch {
    // ignore
  }

  await fs.rm(state.filePath, { force: true });
  await fs.rm(PATHS.playback, { force: true });
  return true;
}

export async function playAudioBuffer(buffer: Buffer): Promise<void> {
  await ensureCodexDir();
  await cleanupStaleState();

  const config = await readConfig();
  const current = await readPlaybackState();
  if (current && config.playbackConflictPolicy === 'ignore') {
    logger.debug('Playback active and policy=ignore. Skipping new playback.');
    return;
  }

  if (current && config.playbackConflictPolicy === 'stop-and-replace') {
    await stopPlayback();
  }

  const filePath = path.join(PATHS.tempAudioDir, `${randomUUID()}.mp3`);
  await fs.writeFile(filePath, buffer);

  const playbackRate = Math.max(0.5, Math.min(2.5, config.speed));
  const child = spawn('afplay', ['-r', playbackRate.toFixed(2), filePath], {
    detached: true,
    stdio: 'ignore'
  });

  child.unref();

  await writePlaybackState({
    pid: child.pid ?? -1,
    filePath,
    startedAt: new Date().toISOString()
  });
}
