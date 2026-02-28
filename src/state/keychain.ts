import keytar from 'keytar';

const SERVICE = 'codex2voice';
const ACCOUNT = 'elevenlabs_api_key';

export async function setApiKey(key: string): Promise<boolean> {
  try {
    await keytar.setPassword(SERVICE, ACCOUNT, key);
    return true;
  } catch {
    return false;
  }
}

export async function getApiKey(): Promise<string | null> {
  try {
    const fromKeychain = await keytar.getPassword(SERVICE, ACCOUNT);
    if (fromKeychain) return fromKeychain;
  } catch {
    // ignore and fallback to env
  }
  return process.env.ELEVENLABS_API_KEY ?? null;
}

export async function deleteApiKey(): Promise<void> {
  try {
    await keytar.deletePassword(SERVICE, ACCOUNT);
  } catch {
    // ignore
  }
}
