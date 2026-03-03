import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execa } from 'execa';
import { PATHS, ensureCodexDir } from '../state/paths.js';
import { getApiKey } from '../state/keychain.js';
import { readConfig } from '../state/config.js';

async function checkCommand(cmd: string): Promise<boolean> {
  try {
    await execa('which', [cmd]);
    return true;
  } catch {
    return false;
  }
}

async function checkElevenLabs(apiKey: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/user', {
      headers: { 'xi-api-key': apiKey },
      signal: controller.signal
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function runDoctor(): Promise<void> {
  await ensureCodexDir();
  const config = await readConfig();

  const hasCodex = await checkCommand('codex');
  const hasAfplay = await checkCommand('afplay');
  const apiKey = await getApiKey();
  const canReadConfig = await access(PATHS.config, constants.R_OK).then(() => true).catch(() => false);
  const canWriteDir = await access(PATHS.codexDir, constants.W_OK).then(() => true).catch(() => false);
  const apiReachable = apiKey ? await checkElevenLabs(apiKey) : false;

  console.log('codex2voice doctor');
  console.log(`codex command: ${hasCodex ? 'PASS' : 'FAIL'}`);
  console.log(`afplay available (macOS): ${hasAfplay ? 'PASS' : 'FAIL'}`);
  console.log(`config readable: ${canReadConfig ? 'PASS' : 'FAIL'}`);
  console.log(`codex dir writable: ${canWriteDir ? 'PASS' : 'FAIL'}`);
  console.log(`api key present: ${apiKey ? 'PASS' : 'FAIL'}`);
  console.log(`elevenlabs reachable: ${apiReachable ? 'PASS' : 'FAIL'}`);
  console.log(`voice id configured: ${config.voiceId ? 'PASS' : 'FAIL'}`);

  if (!apiKey) {
    console.log('Remediation: run `codex2voice init` or export ELEVENLABS_API_KEY.');
  }
}
