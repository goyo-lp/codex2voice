import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { speakTextIfEligible } from '../core/speech.js';
import { setLastText } from '../state/cache.js';
import { parseSpeechCandidatesDetailed } from './codex-events.js';

type TrackedFile = {
  offset: number;
};

type CodexWrapperOptions = {
  debugEvents?: boolean;
};

const SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');
const POLL_INTERVAL_MS = 140;
const DISCOVERY_INTERVAL_MS = 900;
const DUPLICATE_SPEECH_WINDOW_MS = 8000;

export function shouldReplayFromStart(stat: { birthtimeMs: number }, wrapperStartedAt: number): boolean {
  if (!Number.isFinite(stat.birthtimeMs) || stat.birthtimeMs <= 0) return false;
  return stat.birthtimeMs >= wrapperStartedAt - 5000;
}

export function normalizeSpeechKey(message: string): string {
  return message.trim().replace(/\s+/g, ' ').toLowerCase();
}

function getSessionDayDir(date: Date): string {
  const yyyy = date.getFullYear().toString();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return path.join(SESSIONS_DIR, yyyy, mm, dd);
}

async function listSessionFilesFast(): Promise<string[]> {
  const today = getSessionDayDir(new Date());
  const yesterday = getSessionDayDir(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const dirs = today === yesterday ? [today] : [today, yesterday];
  const files: string[] = [];

  for (const dir of dirs) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith('.jsonl')) continue;
        files.push(path.join(dir, entry.name));
      }
    } catch {
      // ignore missing day directories
    }
  }

  return files;
}

function buildCodexArgs(userArgs: string[]): string[] {
  const joined = userArgs.join(' ');
  const hasWsOverride =
    joined.includes('responses_websockets') ||
    joined.includes('responses_websockets_v2');

  if (hasWsOverride) return userArgs;

  return [
    '--disable',
    'responses_websockets',
    '--disable',
    'responses_websockets_v2',
    ...userArgs
  ];
}

async function readAppendedChunk(filePath: string, offset: number): Promise<{ nextOffset: number; chunk: string }> {
  const stat = await fs.stat(filePath);
  const size = stat.size;

  const safeOffset = offset > size ? 0 : offset;
  const length = size - safeOffset;
  if (length <= 0) return { nextOffset: size, chunk: '' };

  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, safeOffset);
    return { nextOffset: size, chunk: buffer.toString('utf8') };
  } finally {
    await handle.close();
  }
}

export async function runCodexWrapper(args: string[], options: CodexWrapperOptions = {}): Promise<void> {
  const userArgs = args.length > 0 ? args : [];
  const codexArgs = buildCodexArgs(userArgs);
  const wrapperStartedAt = Date.now();
  const debugEvents = Boolean(options.debugEvents);

  const debug = (line: string): void => {
    if (!debugEvents) return;
    console.error(`[codex2voice debug] ${line}`);
  };

  const trackedFiles = new Map<string, TrackedFile>();
  const recentMessages = new Map<string, number>();

  const seedTrackedFiles = async (): Promise<void> => {
    const files = await listSessionFilesFast();
    await Promise.all(
      files.map(async (filePath) => {
        if (trackedFiles.has(filePath)) return;
        try {
          const stat = await fs.stat(filePath);
          const replayFromStart = shouldReplayFromStart(stat, wrapperStartedAt);
          trackedFiles.set(filePath, { offset: replayFromStart ? 0 : stat.size });
          debug(`tracking file: ${filePath} from offset=${replayFromStart ? 0 : stat.size}`);
        } catch {
          // ignore unreadable files
        }
      })
    );
  };

  let speechQueue: Promise<void> = Promise.resolve();
  const enqueueSpeech = (message: string): void => {
    const now = Date.now();
    const messageKey = normalizeSpeechKey(message);
    const previousAt = recentMessages.get(messageKey);
    if (previousAt && now - previousAt < DUPLICATE_SPEECH_WINDOW_MS) {
      debug(`skip duplicate speech within ${DUPLICATE_SPEECH_WINDOW_MS}ms: ${message.slice(0, 120)}`);
      return;
    }
    recentMessages.set(messageKey, now);

    speechQueue = speechQueue
      .then(async () => {
        debug(`enqueue speech: ${message.slice(0, 120)}`);
        await setLastText(message);
        await speakTextIfEligible(message, false);
      })
      .catch((error) => {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`codex2voice warning: ${msg}`);
      });
  };

  let lastDiscoveryAt = 0;
  const discoverIfNeeded = async (): Promise<void> => {
    const now = Date.now();
    if (now - lastDiscoveryAt < DISCOVERY_INTERVAL_MS) return;
    lastDiscoveryAt = now;
    await seedTrackedFiles();
  };

  const pollSession = async (): Promise<void> => {
    await discoverIfNeeded();

    for (const [filePath, state] of trackedFiles) {
      let nextOffset = state.offset;
      let chunk = '';
      try {
        const result = await readAppendedChunk(filePath, state.offset);
        nextOffset = result.nextOffset;
        chunk = result.chunk;
      } catch {
        continue;
      }

      trackedFiles.set(filePath, { offset: nextOffset });
      if (!chunk) continue;

      const { candidates, traces } = parseSpeechCandidatesDetailed(chunk, { debug: debugEvents });
      for (const trace of traces) {
        debug(`${path.basename(filePath)}: ${trace}`);
      }

      for (let i = 0; i < candidates.length; i += 1) {
        const message = candidates[i] ?? '';
        if (!message) continue;
        enqueueSpeech(message);
      }
    }
  };

  await seedTrackedFiles();

  const child = spawn('codex', codexArgs, {
    stdio: 'inherit',
    env: process.env
  });

  let polling = false;
  const timer = setInterval(() => {
    if (polling) return;
    polling = true;
    void pollSession().finally(() => {
      polling = false;
    });
  }, POLL_INTERVAL_MS);

  const exitCode: number = await new Promise((resolve) => {
    child.on('close', (code) => resolve(code ?? 1));
  });

  clearInterval(timer);
  await pollSession();
  await speechQueue;

  process.exitCode = exitCode;
}
