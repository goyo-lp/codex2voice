import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import inquirer from 'inquirer';
import { PATHS } from '../state/paths.js';
import { deleteApiKey } from '../state/keychain.js';

export function removeWrapperAliases(content: string): string {
  return content
    .replace(/\n# codex2voice wrapper[^\n]*\n?/g, '\n')
    .replace(/\nalias codex='codex2voice codex --'\n?/g, '\n')
    .replace(/\nalias codex-voice='codex2voice codex --'\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

async function removeAliasBlock(): Promise<void> {
  const zshrc = path.join(os.homedir(), '.zshrc');
  try {
    const content = await fs.readFile(zshrc, 'utf8');
    const cleaned = removeWrapperAliases(content);
    await fs.writeFile(zshrc, cleaned, 'utf8');
  } catch {
    // ignore
  }
}

export async function runUninstall(): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Remove codex2voice config, cache, keychain secret, and wrapper alias?',
      default: false
    }
  ]);

  if (!answers.confirm) {
    console.log('Uninstall canceled.');
    return;
  }

  await fs.rm(PATHS.config, { force: true });
  await fs.rm(PATHS.cache, { force: true });
  await fs.rm(PATHS.playback, { force: true });
  await fs.rm(PATHS.tempAudioDir, { recursive: true, force: true });
  await deleteApiKey();
  await removeAliasBlock();

  console.log('codex2voice local state removed.');
}
