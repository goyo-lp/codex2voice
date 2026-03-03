import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import inquirer from 'inquirer';
import { readConfig, writeConfig } from '../state/config.js';
import { getApiKey, setApiKey } from '../state/keychain.js';

const WRAPPER_MARKER = '# codex2voice wrapper';
const CODEX_ALIAS_LINE = "alias codex='codex2voice codex --'";
const OPT_IN_ALIAS_LINE = "alias codex-voice='codex2voice codex --'";

type InitAnswers = {
  replaceApiKey?: boolean;
  apiKey?: string;
  voiceId: string;
  enabled: boolean;
  speed: number;
  setupWrapper: boolean;
};

export type InitApiKeyDecision =
  | { action: 'retain' }
  | { action: 'persist'; apiKey: string };

export function resolveInitApiKeyDecision(
  existingApiKey: string | null,
  answers: Pick<InitAnswers, 'replaceApiKey' | 'apiKey'>
): InitApiKeyDecision {
  const hasExisting = Boolean(existingApiKey && existingApiKey.trim());
  const wantsReplace = Boolean(answers.replaceApiKey);
  const provided = String(answers.apiKey ?? '').trim();

  if (hasExisting && !wantsReplace) {
    return { action: 'retain' };
  }

  if (provided) {
    return { action: 'persist', apiKey: provided };
  }

  if (hasExisting) {
    return { action: 'retain' };
  }

  throw new Error('Missing ElevenLabs API key.');
}

export function upsertWrapperAliases(content: string): { nextContent: string; changed: boolean } {
  if (content.includes(CODEX_ALIAS_LINE)) {
    return { nextContent: content, changed: false };
  }

  const cleaned = content
    .replace(/\n# codex2voice wrapper[^\n]*\n?/g, '\n')
    .replace(/\nalias codex-voice='codex2voice codex --'\n?/g, '\n')
    .replace(/\nalias codex='codex2voice codex --'\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();

  const block = `\n\n${WRAPPER_MARKER}\n${CODEX_ALIAS_LINE}\n${OPT_IN_ALIAS_LINE}\n`;
  return { nextContent: `${cleaned}${block}`, changed: true };
}

async function appendAliasIfMissing(): Promise<'added' | 'exists' | 'failed'> {
  const zshrc = path.join(os.homedir(), '.zshrc');

  try {
    let content = '';
    try {
      content = await fs.readFile(zshrc, 'utf8');
    } catch {
      content = '';
    }

    const { nextContent, changed } = upsertWrapperAliases(content);
    if (!changed) {
      return 'exists';
    }

    await fs.writeFile(zshrc, nextContent, 'utf8');
    return 'added';
  } catch {
    return 'failed';
  }
}

export async function runInit(): Promise<void> {
  const current = await readConfig();
  const existingApiKey = await getApiKey();
  const hasExistingApiKey = Boolean(existingApiKey && existingApiKey.trim());

  const answers = await inquirer.prompt<InitAnswers>([
    {
      type: 'confirm',
      name: 'replaceApiKey',
      message: 'An ElevenLabs API key is already saved. Replace it?',
      default: false,
      when: () => hasExistingApiKey
    },
    {
      type: 'password',
      name: 'apiKey',
      message: hasExistingApiKey
        ? 'Enter your new ElevenLabs API key:'
        : 'Enter your ElevenLabs API key:',
      mask: '*',
      when: (input) => !hasExistingApiKey || Boolean(input.replaceApiKey),
      validate: (input: string) => (input.trim().length > 10 ? true : 'API key looks too short')
    },
    {
      type: 'input',
      name: 'voiceId',
      message: 'Enter ElevenLabs voice ID:',
      default: current.voiceId || process.env.ELEVENLABS_VOICE_ID || ''
    },
    {
      type: 'confirm',
      name: 'enabled',
      message: 'Enable voice by default?',
      default: current.enabled
    },
    {
      type: 'input',
      name: 'speed',
      message: 'Speech speed (0.7 - 2.0):',
      default: String(current.speed),
      validate: (input: string) => {
        const value = Number.parseFloat(input);
        if (Number.isNaN(value)) return 'Enter a numeric value, for example 1.25';
        return value >= 0.7 && value <= 2.0 ? true : 'Use a value between 0.7 and 2.0';
      },
      filter: (input: string) => Number.parseFloat(input)
    },
    {
      type: 'confirm',
      name: 'setupWrapper',
      message: 'Set up codex wrapper alias in ~/.zshrc by default?',
      default: true
    }
  ]);

  const apiKeyDecision = resolveInitApiKeyDecision(existingApiKey, {
    replaceApiKey: answers.replaceApiKey,
    apiKey: answers.apiKey
  });
  let keySaveMode: 'keychain' | 'file' | 'none' | 'retained' = 'retained';
  if (apiKeyDecision.action === 'persist') {
    keySaveMode = await setApiKey(apiKeyDecision.apiKey);
  }

  await writeConfig({
    ...current,
    enabled: Boolean(answers.enabled),
    autoSpeak: true,
    voiceId: String(answers.voiceId).trim(),
    speed: Number(answers.speed),
    summarizeCodeHeavy: true,
    skipCodeHeavy: false,
    playbackConflictPolicy: 'stop-and-replace'
  });

  let aliasStatus: 'added' | 'exists' | 'failed' | 'skipped' = 'skipped';
  if (answers.setupWrapper) {
    aliasStatus = await appendAliasIfMissing();
  }

  console.log('Initialization complete.');
  if (keySaveMode === 'keychain') {
    console.log('API key stored in macOS Keychain.');
  } else if (keySaveMode === 'file') {
    console.log('API key stored in local codex2voice secret file (~/.codex/voice-secret.json).');
  } else if (keySaveMode === 'retained') {
    console.log('API key unchanged. Using previously persisted key.');
  } else {
    console.log('Could not persist API key. Set ELEVENLABS_API_KEY in your shell env.');
  }
  if (aliasStatus === 'added') console.log('Configured codex wrapper aliases in ~/.zshrc. Open a new shell session or run `source ~/.zshrc`.');
  if (aliasStatus === 'exists') console.log('Wrapper alias already exists in ~/.zshrc.');
  if (aliasStatus === 'failed') console.log('Could not update ~/.zshrc automatically. Add alias manually: alias codex=\'codex2voice codex --\'');

  console.log('Next: run `codex2voice doctor` then `codex2voice status`.');
}
