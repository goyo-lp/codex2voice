import fs from 'node:fs/promises';
import { z } from 'zod';
import { PATHS, ensureCodexDir } from './paths.js';
import { writeJsonAtomic } from './json.js';

export const configSchema = z.object({
  enabled: z.boolean().default(true),
  autoSpeak: z.boolean().default(true),
  voiceId: z.string().default(''),
  modelId: z.string().min(1).default('eleven_flash_v2_5'),
  speed: z.number().min(0.7).max(2).default(1.25),
  skipCodeHeavy: z.boolean().default(false),
  summarizeCodeHeavy: z.boolean().default(true),
  maxCharsPerSynthesis: z.number().int().min(200).max(6000).default(2500),
  playbackConflictPolicy: z.enum(['stop-and-replace', 'ignore']).default('stop-and-replace')
});

export type VoiceConfig = z.infer<typeof configSchema>;

export const defaultConfig: VoiceConfig = configSchema.parse({});

export async function readConfig(): Promise<VoiceConfig> {
  await ensureCodexDir();
  try {
    const raw = await fs.readFile(PATHS.config, 'utf8');
    return configSchema.parse(JSON.parse(raw));
  } catch {
    await writeConfig(defaultConfig);
    return defaultConfig;
  }
}

export async function writeConfig(config: VoiceConfig): Promise<void> {
  await ensureCodexDir();
  const parsed = configSchema.parse(config);
  await writeJsonAtomic(PATHS.config, parsed);
}

export async function updateConfig(partial: Partial<VoiceConfig>): Promise<VoiceConfig> {
  const current = await readConfig();
  const next = configSchema.parse({ ...current, ...partial });
  await writeConfig(next);
  return next;
}
