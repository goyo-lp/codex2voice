import fs from 'node:fs/promises';
import { z } from 'zod';
import { PATHS, ensureCodexDir } from './paths.js';
import { writeJsonAtomic } from './json.js';

const cacheSchema = z.object({
  lastText: z.string().default(''),
  updatedAt: z.string().default('')
});

export type VoiceCache = z.infer<typeof cacheSchema>;

const defaultCache: VoiceCache = { lastText: '', updatedAt: '' };
const CACHE_DEBOUNCE_MS = Math.max(0, Number.parseInt(process.env.CODEX2VOICE_CACHE_DEBOUNCE_MS ?? '0', 10) || 0);

let debounceTimer: NodeJS.Timeout | null = null;
let pendingText: string | null = null;
let pendingResolvers: Array<() => void> = [];
let pendingRejectors: Array<(error: unknown) => void> = [];

export async function readCache(): Promise<VoiceCache> {
  await ensureCodexDir();
  try {
    const raw = await fs.readFile(PATHS.cache, 'utf8');
    return cacheSchema.parse(JSON.parse(raw));
  } catch {
    await writeCache(defaultCache);
    return defaultCache;
  }
}

export async function writeCache(cache: VoiceCache): Promise<void> {
  await ensureCodexDir();
  const parsed = cacheSchema.parse(cache);
  await writeJsonAtomic(PATHS.cache, parsed);
}

async function flushPendingText(): Promise<void> {
  const text = pendingText;
  pendingText = null;
  if (!text) return;
  await writeCache({ lastText: text, updatedAt: new Date().toISOString() });
}

function resolveAllPending(): void {
  const resolves = pendingResolvers;
  pendingResolvers = [];
  pendingRejectors = [];
  resolves.forEach((resolve) => resolve());
}

function rejectAllPending(error: unknown): void {
  const rejects = pendingRejectors;
  pendingResolvers = [];
  pendingRejectors = [];
  rejects.forEach((reject) => reject(error));
}

export async function setLastText(text: string): Promise<void> {
  const normalized = text.trim();
  if (!normalized) return;

  if (CACHE_DEBOUNCE_MS <= 0) {
    await writeCache({ lastText: normalized, updatedAt: new Date().toISOString() });
    return;
  }

  pendingText = normalized;

  const waitForFlush = new Promise<void>((resolve, reject) => {
    pendingResolvers.push(resolve);
    pendingRejectors.push(reject);
  });

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flushPendingText()
      .then(() => resolveAllPending())
      .catch((error) => rejectAllPending(error));
  }, CACHE_DEBOUNCE_MS);

  await waitForFlush;
}
