import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import inquirer from 'inquirer';
import { readConfig, writeConfig } from '../state/config.js';
import { setApiKey } from '../state/keychain.js';

async function appendAliasIfMissing(): Promise<'added' | 'exists' | 'failed'> {
  const zshrc = path.join(os.homedir(), '.zshrc');
  const marker = '# codex2voice wrapper';
  const aliasLine = "alias codex='codex2voice codex --'";

  try {
    let content = '';
    try {
      content = await fs.readFile(zshrc, 'utf8');
    } catch {
      content = '';
    }

    if (content.includes(aliasLine) || content.includes(marker)) {
      return 'exists';
    }

    const block = `\n${marker}\n${aliasLine}\n`;
    await fs.appendFile(zshrc, block, 'utf8');
    return 'added';
  } catch {
    return 'failed';
  }
}

export async function runInit(): Promise<void> {
  const current = await readConfig();

  const answers = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: 'Enter your ElevenLabs API key:',
      mask: '*',
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
      default: true
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

  const savedToKeychain = await setApiKey(answers.apiKey.trim());

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
  console.log(savedToKeychain ? 'API key stored in macOS Keychain.' : 'Could not store key in Keychain. Set ELEVENLABS_API_KEY in your shell env.');
  if (aliasStatus === 'added') console.log('Added codex wrapper alias to ~/.zshrc. Open a new shell session.');
  if (aliasStatus === 'exists') console.log('Wrapper alias already exists in ~/.zshrc.');
  if (aliasStatus === 'failed') console.log('Could not update ~/.zshrc automatically. Add alias manually: alias codex=\'codex2voice codex --\'');

  console.log('Next: run `codex2voice doctor` then `codex2voice status`.');
}
