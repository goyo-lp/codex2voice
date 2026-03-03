import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { speakTextNow } from '../core/speech.js';
import { setLastText } from '../state/cache.js';
import { parseSessionActionsDetailed, SessionControlSignal } from './codex-events.js';
import type { SessionAction } from './codex-events.js';

type TrackedFile = {
  offset: number;
  isFresh: boolean;
  lastChunkAt: number;
  pendingLine: string;
};

type SessionFileInfo = {
  filePath: string;
  size: number;
  birthtimeMs: number;
  mtimeMs: number;
};

type CodexWrapperOptions = {
  debugEvents?: boolean;
};

const SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');
// Long-term target: replace JSONL file polling with a stable Codex event stream/hook when available.
const MIN_POLL_INTERVAL_MS = 140;
const MAX_POLL_INTERVAL_MS = 1100;
const IDLE_POLL_BACKOFF_STEP_MS = 120;
const DISCOVERY_INTERVAL_MS = 900;
const DISCOVERY_INTERVAL_LOCKED_MS = 3000;
const ACTIVE_FILE_SWEEP_INTERVAL_MS = 2800;
const ACTIVE_FILE_STALE_MS = 6000;
const DUPLICATE_SPEECH_WINDOW_MS = 8000;
const MAX_APPENDED_READ_BYTES = 512 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
const REPLAY_WINDOW_MS = 5000;
const WS_DISABLE_FLAGS = ['responses_websockets', 'responses_websockets_v2'] as const;
const SESSION_CONTROL_DIR = path.join(os.tmpdir(), 'codex2voice-session-control');
const SESSION_CONTROL_ENV = 'CODEX2VOICE_SESSION_CONTROL_FILE';

export type ManualVoiceOverride = 'on' | 'off' | null;
type SessionControlValue = 'on' | 'off' | 'default';
export type SessionVoiceState = {
  planMode: boolean;
  manualVoiceOverride: ManualVoiceOverride;
};
export type SpeechDecision = {
  message: string;
  shouldSpeak: boolean;
};

export const ADAPTIVE_POLL = {
  minMs: MIN_POLL_INTERVAL_MS,
  maxMs: MAX_POLL_INTERVAL_MS,
  idleStepMs: IDLE_POLL_BACKOFF_STEP_MS
};

export function shouldReplayFromStart(stat: { birthtimeMs: number }, wrapperStartedAt: number): boolean {
  if (!Number.isFinite(stat.birthtimeMs) || stat.birthtimeMs <= 0) return false;
  return stat.birthtimeMs >= wrapperStartedAt - REPLAY_WINDOW_MS;
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

async function listSessionFilesFast(): Promise<SessionFileInfo[]> {
  const today = getSessionDayDir(new Date());
  const yesterday = getSessionDayDir(new Date(Date.now() - DAY_MS));
  const dirs = today === yesterday ? [today] : [today, yesterday];
  const files: SessionFileInfo[] = [];

  for (const dir of dirs) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      await Promise.all(
        entries.map(async (entry) => {
          if (!entry.isFile()) return;
          if (!entry.name.endsWith('.jsonl')) return;
          const filePath = path.join(dir, entry.name);
          try {
            const stat = await fs.stat(filePath);
            files.push({
              filePath,
              size: stat.size,
              birthtimeMs: stat.birthtimeMs,
              mtimeMs: stat.mtimeMs
            });
          } catch {
            // ignore unreadable files
          }
        })
      );
    } catch {
      // ignore missing day directories
    }
  }

  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files;
}

export function computeNextPollInterval(previousMs: number, hadActivity: boolean): number {
  if (hadActivity) return MIN_POLL_INTERVAL_MS;

  const previous = Number.isFinite(previousMs) ? previousMs : MIN_POLL_INTERVAL_MS;
  const stepped = previous + IDLE_POLL_BACKOFF_STEP_MS;
  return Math.min(MAX_POLL_INTERVAL_MS, Math.max(MIN_POLL_INTERVAL_MS, stepped));
}

type PollCandidate = {
  filePath: string;
  isFresh: boolean;
};

type PollMetrics = {
  sinceMs: number;
  tickCount: number;
  activeTickCount: number;
  filesPolled: number;
  chunkReads: number;
  candidateCount: number;
  sweepCount: number;
  intervalChangeCount: number;
  lockAcquireCount: number;
  lockSwitchCount: number;
  lockClearCount: number;
};

export function selectTrackedFilesForPoll(
  candidates: PollCandidate[],
  activeFilePath: string | null,
  includeBackgroundSweep: boolean
): string[] {
  if (activeFilePath && candidates.some((candidate) => candidate.filePath === activeFilePath)) {
    if (!includeBackgroundSweep) return [activeFilePath];
    return [
      activeFilePath,
      ...candidates
        .filter((candidate) => candidate.filePath !== activeFilePath)
        .map((candidate) => candidate.filePath)
    ];
  }

  const fresh = candidates.filter((candidate) => candidate.isFresh).map((candidate) => candidate.filePath);
  if (fresh.length > 0) return fresh;

  return candidates.map((candidate) => candidate.filePath);
}

function hasWsFeatureToken(token: string): boolean {
  return token
    .split(',')
    .map((part) => part.trim())
    .some((part) => WS_DISABLE_FLAGS.includes(part as (typeof WS_DISABLE_FLAGS)[number]));
}

export function hasWebSocketFeatureOverride(userArgs: string[]): boolean {
  for (let i = 0; i < userArgs.length; i += 1) {
    const token = userArgs[i] ?? '';
    if (token === '--enable' || token === '--disable') {
      const next = userArgs[i + 1] ?? '';
      if (hasWsFeatureToken(next)) return true;
      i += 1;
      continue;
    }
    if (token.startsWith('--enable=')) {
      if (hasWsFeatureToken(token.slice('--enable='.length))) return true;
      continue;
    }
    if (token.startsWith('--disable=')) {
      if (hasWsFeatureToken(token.slice('--disable='.length))) return true;
      continue;
    }
  }

  return false;
}

function buildCodexArgs(userArgs: string[]): string[] {
  if (hasWebSocketFeatureOverride(userArgs)) return userArgs;

  return [
    '--disable',
    'responses_websockets',
    '--disable',
    'responses_websockets_v2',
    ...userArgs
  ];
}

async function readAppendedChunk(
  filePath: string,
  offset: number
): Promise<{ nextOffset: number; chunk: string; didResetOffset: boolean }> {
  const stat = await fs.stat(filePath);
  const size = stat.size;

  const didResetOffset = offset > size;
  const safeOffset = didResetOffset ? 0 : offset;
  const length = size - safeOffset;
  if (length <= 0) return { nextOffset: size, chunk: '', didResetOffset };

  const bytesToRead = Math.min(length, MAX_APPENDED_READ_BYTES);

  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytesToRead);
    await handle.read(buffer, 0, bytesToRead, safeOffset);
    return {
      nextOffset: safeOffset + bytesToRead,
      chunk: buffer.toString('utf8'),
      didResetOffset
    };
  } finally {
    await handle.close();
  }
}

export function splitCompleteJsonlChunk(text: string): { completeChunk: string; trailingPartial: string } {
  if (!text) return { completeChunk: '', trailingPartial: '' };
  const lastNewline = text.lastIndexOf('\n');
  if (lastNewline < 0) {
    return { completeChunk: '', trailingPartial: text };
  }
  return {
    completeChunk: text.slice(0, lastNewline + 1),
    trailingPartial: text.slice(lastNewline + 1)
  };
}

export function normalizeManualVoiceValue(value: unknown): SessionControlValue | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'on') return 'on';
  if (normalized === 'off') return 'off';
  if (normalized === 'default' || normalized === 'clear' || normalized === 'auto') return 'default';
  return null;
}

export function createSessionVoiceState(): SessionVoiceState {
  return {
    planMode: false,
    manualVoiceOverride: null
  };
}

export function isSessionVoiceEnabledForState(state: SessionVoiceState): boolean {
  if (state.manualVoiceOverride === 'on') return true;
  if (state.manualVoiceOverride === 'off') return false;
  return state.planMode;
}

export function reduceSessionVoiceState(
  state: SessionVoiceState,
  signal: SessionControlSignal
): SessionVoiceState {
  switch (signal) {
    case 'plan_enter':
      return { ...state, planMode: true };
    case 'plan_exit':
      return { ...state, planMode: false };
    case 'manual_voice_on':
      return { ...state, manualVoiceOverride: 'on' };
    case 'manual_voice_off':
      return { ...state, manualVoiceOverride: 'off' };
    case 'manual_voice_default':
      return { ...state, manualVoiceOverride: null };
    default:
      return state;
  }
}

export function evaluateSpeechDecisionsForActions(
  actions: SessionAction[],
  initialState: SessionVoiceState = createSessionVoiceState()
): SpeechDecision[] {
  const state: SessionVoiceState = {
    planMode: initialState.planMode,
    manualVoiceOverride: initialState.manualVoiceOverride
  };
  const decisions: SpeechDecision[] = [];

  for (const action of actions) {
    if (action.kind === 'control') {
      const nextState = reduceSessionVoiceState(state, action.signal);
      state.planMode = nextState.planMode;
      state.manualVoiceOverride = nextState.manualVoiceOverride;
      continue;
    }

    if (!action.message) continue;
    decisions.push({
      message: action.message,
      shouldSpeak: isSessionVoiceEnabledForState(state)
    });
  }

  return decisions;
}

function createPollMetrics(now: number): PollMetrics {
  return {
    sinceMs: now,
    tickCount: 0,
    activeTickCount: 0,
    filesPolled: 0,
    chunkReads: 0,
    candidateCount: 0,
    sweepCount: 0,
    intervalChangeCount: 0,
    lockAcquireCount: 0,
    lockSwitchCount: 0,
    lockClearCount: 0
  };
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
  const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

  const trackedFiles = new Map<string, TrackedFile>();
  const recentMessages = new Map<string, number>();
  let activeFilePath: string | null = null;
  const sessionVoiceState = createSessionVoiceState();
  const sessionControlFile = path.join(SESSION_CONTROL_DIR, `session-${process.pid}-${wrapperStartedAt}.json`);
  let sessionControlMtimeMs = 0;
  let lastAppliedSessionControl: SessionControlValue | null = null;
  const METRICS_LOG_INTERVAL_MS = 2500;
  let metrics = createPollMetrics(Date.now());

  const isSessionVoiceEnabled = (): boolean => isSessionVoiceEnabledForState(sessionVoiceState);

  const setManualVoiceOverride = (value: ManualVoiceOverride, reason: string): void => {
    if (sessionVoiceState.manualVoiceOverride === value) return;
    sessionVoiceState.manualVoiceOverride = value;
    debug(`manual voice override=${value ?? 'default'} (${reason})`);
  };

  const setPlanMode = (enabled: boolean, reason: string): void => {
    if (sessionVoiceState.planMode === enabled) return;
    sessionVoiceState.planMode = enabled;
    debug(`plan mode ${enabled ? 'on' : 'off'} (${reason})`);
  };

  const applySessionControlSignal = (signal: SessionControlSignal, reason: string): void => {
    const before: SessionVoiceState = {
      planMode: sessionVoiceState.planMode,
      manualVoiceOverride: sessionVoiceState.manualVoiceOverride
    };
    const after = reduceSessionVoiceState(before, signal);
    setPlanMode(after.planMode, reason);
    setManualVoiceOverride(after.manualVoiceOverride, reason);
  };

  const writeSessionControlDefaults = async (): Promise<void> => {
    try {
      await fs.mkdir(SESSION_CONTROL_DIR, { recursive: true });
      await fs.writeFile(
        sessionControlFile,
        JSON.stringify({
          manualVoice: 'default',
          updatedAt: new Date().toISOString(),
          source: 'codex2voice-wrapper'
        }, null, 2),
        'utf8'
      );
      lastAppliedSessionControl = 'default';
    } catch (error) {
      debug(`session control init failed: ${errorMessage(error)}`);
    }
  };

  const readSessionControlIfChanged = async (): Promise<void> => {
    let stat;
    try {
      stat = await fs.stat(sessionControlFile);
    } catch {
      return;
    }
    if (stat.mtimeMs <= sessionControlMtimeMs) return;
    sessionControlMtimeMs = stat.mtimeMs;

    try {
      const raw = await fs.readFile(sessionControlFile, 'utf8');
      const parsed = JSON.parse(raw) as { manualVoice?: unknown };
      const normalized = normalizeManualVoiceValue(parsed.manualVoice);
      if (!normalized || normalized === lastAppliedSessionControl) return;
      lastAppliedSessionControl = normalized;
      if (normalized === 'on') setManualVoiceOverride('on', 'session-control-file');
      if (normalized === 'off') setManualVoiceOverride('off', 'session-control-file');
      if (normalized === 'default') setManualVoiceOverride(null, 'session-control-file');
    } catch (error) {
      debug(`session control read failed: ${errorMessage(error)}`);
    }
  };

  const clearActiveFileIfMatching = (filePath: string, reason: string): void => {
    if (activeFilePath !== filePath) return;
    activeFilePath = null;
    metrics.lockClearCount += 1;
    debug(`${reason}: ${filePath}`);
  };

  const setActiveFile = (filePath: string, reason: string): void => {
    if (activeFilePath && activeFilePath !== filePath) {
      metrics.lockSwitchCount += 1;
    } else if (!activeFilePath) {
      metrics.lockAcquireCount += 1;
    }
    activeFilePath = filePath;
    debug(`${reason}: ${filePath}`);
  };

  const shouldSwitchActiveFile = (candidateFilePath: string, now: number): boolean => {
    if (activeFilePath === candidateFilePath) return false;
    const currentActive = activeFilePath ? trackedFiles.get(activeFilePath) : null;
    const activeIsStale = !currentActive || now - currentActive.lastChunkAt >= ACTIVE_FILE_STALE_MS;
    return !activeFilePath || activeIsStale;
  };

  const pruneRecentMessages = (now: number): void => {
    for (const [key, seenAt] of recentMessages) {
      if (now - seenAt <= DUPLICATE_SPEECH_WINDOW_MS) continue;
      recentMessages.delete(key);
    }
  };

  const flushMetricsIfNeeded = (force = false, pollIntervalMs = MIN_POLL_INTERVAL_MS): void => {
    if (!debugEvents) return;
    const now = Date.now();
    const elapsedMs = now - metrics.sinceMs;
    if (!force && elapsedMs < METRICS_LOG_INTERVAL_MS) return;
    if (!force && metrics.tickCount === 0) return;

    const durationSec = Math.max(0.001, elapsedMs / 1000);
    const ticksPerSec = (metrics.tickCount / durationSec).toFixed(2);
    const filesPerTick = metrics.tickCount > 0 ? (metrics.filesPolled / metrics.tickCount).toFixed(2) : '0.00';
    const chunksPerTick = metrics.tickCount > 0 ? (metrics.chunkReads / metrics.tickCount).toFixed(2) : '0.00';
    const activeLabel = activeFilePath ? path.basename(activeFilePath) : 'none';

    debug(
      [
        'metrics',
        `window=${durationSec.toFixed(1)}s`,
        `ticks=${metrics.tickCount}`,
        `tps=${ticksPerSec}`,
        `activeTicks=${metrics.activeTickCount}`,
        `intervalMs=${pollIntervalMs}`,
        `filesPerTick=${filesPerTick}`,
        `chunksPerTick=${chunksPerTick}`,
        `candidates=${metrics.candidateCount}`,
        `sweeps=${metrics.sweepCount}`,
        `intervalChanges=${metrics.intervalChangeCount}`,
        `lock+${metrics.lockAcquireCount}/~${metrics.lockSwitchCount}/-${metrics.lockClearCount}`,
        `plan=${sessionVoiceState.planMode ? 'on' : 'off'}`,
        `manual=${sessionVoiceState.manualVoiceOverride ?? 'default'}`,
        `voice=${isSessionVoiceEnabled() ? 'on' : 'off'}`,
        `active=${activeLabel}`
      ].join(' ')
    );

    metrics = createPollMetrics(now);
  };

  const seedTrackedFiles = async (): Promise<boolean> => {
    const files = await listSessionFilesFast();
    const discoveredPaths = new Set(files.map((file) => file.filePath));
    let changed = false;

    for (const file of files) {
      if (trackedFiles.has(file.filePath)) continue;
      const replayFromStart = shouldReplayFromStart({ birthtimeMs: file.birthtimeMs }, wrapperStartedAt);
      trackedFiles.set(file.filePath, {
        offset: replayFromStart ? 0 : file.size,
        isFresh: replayFromStart,
        lastChunkAt: 0,
        pendingLine: ''
      });
      debug(`tracking file: ${file.filePath} from offset=${replayFromStart ? 0 : file.size}`);
      changed = true;
    }

    for (const trackedPath of Array.from(trackedFiles.keys())) {
      if (discoveredPaths.has(trackedPath)) continue;
      trackedFiles.delete(trackedPath);
      clearActiveFileIfMatching(trackedPath, 'active file disappeared');
      changed = true;
    }

    return changed;
  };

  let speechQueue: Promise<void> = Promise.resolve();
  const enqueueSpeech = (message: string): void => {
    const now = Date.now();
    pruneRecentMessages(now);
    const messageKey = normalizeSpeechKey(message);
    const previousAt = recentMessages.get(messageKey);
    if (previousAt && now - previousAt < DUPLICATE_SPEECH_WINDOW_MS) {
      debug(`skip duplicate speech within ${DUPLICATE_SPEECH_WINDOW_MS}ms: ${message.slice(0, 120)}`);
      return;
    }
    recentMessages.set(messageKey, now);

    speechQueue = speechQueue
      .then(async () => {
        await setLastText(message);
        await readSessionControlIfChanged();
        const shouldSpeakNow = isSessionVoiceEnabled();
        if (!shouldSpeakNow) {
          debug(`skip speech (session voice off): ${message.slice(0, 120)}`);
          return;
        }
        debug(`enqueue speech: ${message.slice(0, 120)}`);
        await speakTextNow(message);
      })
      .catch((error) => {
        console.error(`codex2voice warning: ${errorMessage(error)}`);
      });
  };

  let lastDiscoveryAt = 0;
  const discoverIfNeeded = async (): Promise<boolean> => {
    const now = Date.now();
    const discoveryInterval = activeFilePath ? DISCOVERY_INTERVAL_LOCKED_MS : DISCOVERY_INTERVAL_MS;
    if (now - lastDiscoveryAt < discoveryInterval) return false;
    lastDiscoveryAt = now;
    return seedTrackedFiles();
  };

  let lastBackgroundSweepAt = 0;
  const pollSession = async (): Promise<boolean> => {
    metrics.tickCount += 1;
    await readSessionControlIfChanged();

    const discoveredChanges = await discoverIfNeeded();
    let hadActivity = discoveredChanges;
    const now = Date.now();
    const shouldSweepAll = Boolean(
      activeFilePath && now - lastBackgroundSweepAt >= ACTIVE_FILE_SWEEP_INTERVAL_MS
    );
    if (shouldSweepAll) {
      lastBackgroundSweepAt = now;
      metrics.sweepCount += 1;
    }

    const pollCandidates: PollCandidate[] = Array.from(trackedFiles.entries()).map(([filePath, state]) => ({
      filePath,
      isFresh: state.isFresh
    }));
    const filesToPoll = selectTrackedFilesForPoll(pollCandidates, activeFilePath, shouldSweepAll);

    for (const filePath of filesToPoll) {
      const state = trackedFiles.get(filePath);
      if (!state) continue;
      metrics.filesPolled += 1;
      let nextOffset = state.offset;
      let chunk = '';
      let pendingLine = state.pendingLine;
      try {
        const result = await readAppendedChunk(filePath, state.offset);
        nextOffset = result.nextOffset;
        chunk = result.chunk;
        if (result.didResetOffset) pendingLine = '';
      } catch {
        clearActiveFileIfMatching(filePath, 'active file unreadable, clearing lock');
        continue;
      }

      const framed = splitCompleteJsonlChunk(`${pendingLine}${chunk}`);
      trackedFiles.set(filePath, {
        ...state,
        offset: nextOffset,
        lastChunkAt: chunk ? now : state.lastChunkAt,
        pendingLine: framed.trailingPartial
      });
      if (!chunk) continue;
      hadActivity = true;
      metrics.chunkReads += 1;

      if (!activeFilePath && state.isFresh) {
        setActiveFile(filePath, 'locked onto active file');
      }

      if (!framed.completeChunk) continue;

      const { actions, traces } = parseSessionActionsDetailed(framed.completeChunk, { debug: debugEvents });
      for (const trace of traces) {
        debug(`${path.basename(filePath)}: ${trace}`);
      }
      const candidateCount = actions.filter((action) => action.kind === 'candidate').length;
      metrics.candidateCount += candidateCount;

      for (const action of actions) {
        if (action.kind === 'control') {
          await readSessionControlIfChanged();
          applySessionControlSignal(action.signal, `${path.basename(filePath)}:${action.line}:${action.source}`);
          continue;
        }

        if (!action.message) continue;
        if (shouldSwitchActiveFile(filePath, now)) {
          setActiveFile(filePath, 'switching active file based on final-answer candidate');
        }
        enqueueSpeech(action.message);
      }
    }

    if (hadActivity) metrics.activeTickCount += 1;
    return hadActivity;
  };

  await seedTrackedFiles();
  await writeSessionControlDefaults();

  const child = spawn('codex', codexArgs, {
    stdio: 'inherit',
    env: {
      ...process.env,
      [SESSION_CONTROL_ENV]: sessionControlFile
    }
  });

  let pollIntervalMs = MIN_POLL_INTERVAL_MS;
  let polling = false;
  let timer: NodeJS.Timeout | null = null;

  const tick = (): void => {
    if (polling) return;
    polling = true;
    void pollSession()
      .then((hadActivity) => {
        const nextInterval = computeNextPollInterval(pollIntervalMs, hadActivity);
        if (nextInterval !== pollIntervalMs) {
          metrics.intervalChangeCount += 1;
          pollIntervalMs = nextInterval;
          if (timer) clearInterval(timer);
          timer = setInterval(tick, pollIntervalMs);
        }

        flushMetricsIfNeeded(false, pollIntervalMs);
      })
      .catch((error) => {
        console.error(`codex2voice warning: polling failed: ${errorMessage(error)}`);
      })
      .finally(() => {
        polling = false;
      });
  };

  timer = setInterval(tick, pollIntervalMs);
  tick();

  const exitCode: number = await new Promise((resolve) => {
    child.on('close', (code) => resolve(code ?? 1));
  });

  if (timer) clearInterval(timer);
  await pollSession();
  flushMetricsIfNeeded(true, pollIntervalMs);
  await speechQueue;
  try {
    await fs.rm(sessionControlFile, { force: true });
  } catch {
    // ignore
  }

  process.exitCode = exitCode;
}
