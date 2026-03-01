import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const SERVICE = 'codex2voice';
const ACCOUNT = 'elevenlabs_api_key';
const CODEX_HOME = process.env.CODEX2VOICE_HOME ?? path.join(os.homedir(), '.codex');
const SECRET_FILE = path.join(CODEX_HOME, 'voice-secret.json');

type KeytarModule = {
  setPassword(service: string, account: string, password: string): Promise<void>;
  getPassword(service: string, account: string): Promise<string | null>;
  deletePassword(service: string, account: string): Promise<boolean>;
};

let keytarPromise: Promise<KeytarModule | null> | null = null;

async function getKeytar(): Promise<KeytarModule | null> {
  if (!keytarPromise) {
    // Keep keytar optional at runtime without requiring it during install.
    keytarPromise = Function('moduleName', 'return import(moduleName)')('keytar')
      .then((mod: { default: KeytarModule }) => mod.default)
      .catch(() => null);
  }
  return keytarPromise;
}

async function setApiKeyToFile(key: string): Promise<boolean> {
  try {
    await fs.mkdir(CODEX_HOME, { recursive: true });
    await fs.writeFile(
      SECRET_FILE,
      JSON.stringify({ [ACCOUNT]: key }, null, 2),
      { encoding: 'utf8', mode: 0o600 }
    );
    await fs.chmod(SECRET_FILE, 0o600);
    return true;
  } catch {
    return false;
  }
}

async function getApiKeyFromFile(): Promise<string | null> {
  try {
    const raw = await fs.readFile(SECRET_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const value = parsed[ACCOUNT];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

async function deleteApiKeyFromFile(): Promise<void> {
  try {
    await fs.rm(SECRET_FILE, { force: true });
  } catch {
    // ignore
  }
}

export async function setApiKey(key: string): Promise<'keychain' | 'file' | 'none'> {
  try {
    const keytar = await getKeytar();
    if (keytar) {
      await keytar.setPassword(SERVICE, ACCOUNT, key);
      return 'keychain';
    }
  } catch {
    // ignore and fallback to file
  }

  return (await setApiKeyToFile(key)) ? 'file' : 'none';
}

export async function getApiKey(): Promise<string | null> {
  try {
    const keytar = await getKeytar();
    if (keytar) {
      const fromKeychain = await keytar.getPassword(SERVICE, ACCOUNT);
      if (fromKeychain) return fromKeychain;
    }
  } catch {
    // ignore and fallback
  }
  const fromFile = await getApiKeyFromFile();
  if (fromFile) return fromFile;
  return process.env.ELEVENLABS_API_KEY ?? null;
}

export async function deleteApiKey(): Promise<void> {
  try {
    const keytar = await getKeytar();
    if (keytar) {
      await keytar.deletePassword(SERVICE, ACCOUNT);
    }
  } catch {
    // ignore
  }
  await deleteApiKeyFromFile();
}
