#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const SERVICE = 'codex2voice';
const ACCOUNT = 'elevenlabs_api_key';

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function log(message) {
  console.log(`[codex2voice] ${message}`);
}

function isInteractiveSession() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function hasKeychainApiKey() {
  if (process.platform !== 'darwin') return false;
  const result = spawnSync(
    'security',
    ['find-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w'],
    { stdio: 'ignore' }
  );
  return result.status === 0;
}

async function hasSecretFileApiKey(secretPath) {
  try {
    const raw = await fs.readFile(secretPath, 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed?.[ACCOUNT] === 'string' && parsed[ACCOUNT].trim().length > 0;
  } catch {
    return false;
  }
}

async function hasConfiguredVoiceId(configPath) {
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed?.voiceId === 'string' && parsed.voiceId.trim().length > 0;
  } catch {
    return false;
  }
}

function runInit(cliPath) {
  log('first-time setup detected; launching `codex2voice init`...');
  const result = spawnSync(process.execPath, [cliPath, 'init'], {
    stdio: 'inherit',
    env: process.env
  });
  if (typeof result.status === 'number') process.exit(result.status);
  if (result.error) {
    log(`auto-init failed: ${result.error.message}`);
    process.exit(1);
  }
}

async function main() {
  if (process.env.CODEX2VOICE_SKIP_AUTO_INIT === '1') {
    log('auto-init skipped by CODEX2VOICE_SKIP_AUTO_INIT=1');
    return;
  }

  if (hasFlag('--require-global') && process.env.npm_config_global !== 'true') {
    return;
  }

  const codexHome = process.env.CODEX2VOICE_HOME ?? path.join(os.homedir(), '.codex');
  const configPath = path.join(codexHome, 'voice.json');
  const secretPath = path.join(codexHome, 'voice-secret.json');
  const cliPath = path.join(process.cwd(), 'dist', 'cli.js');

  const hasVoiceId = await hasConfiguredVoiceId(configPath);
  const hasApiKey =
    (process.env.ELEVENLABS_API_KEY ?? '').trim().length > 0 ||
    (await hasSecretFileApiKey(secretPath)) ||
    hasKeychainApiKey();

  if (hasVoiceId && hasApiKey) {
    log('setup already configured; skipping auto-init');
    return;
  }

  if (!isInteractiveSession()) {
    log('first-time setup detected but terminal is non-interactive; run `codex2voice init` manually');
    return;
  }

  if (!existsSync(cliPath)) {
    log(`cannot find CLI at ${cliPath}; run \`codex2voice init\` manually`);
    return;
  }

  runInit(cliPath);
}

await main();
