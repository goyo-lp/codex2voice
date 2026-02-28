const SERVICE = 'codex2voice';
const ACCOUNT = 'elevenlabs_api_key';

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

export async function setApiKey(key: string): Promise<boolean> {
  try {
    const keytar = await getKeytar();
    if (!keytar) return false;
    await keytar.setPassword(SERVICE, ACCOUNT, key);
    return true;
  } catch {
    return false;
  }
}

export async function getApiKey(): Promise<string | null> {
  try {
    const keytar = await getKeytar();
    if (!keytar) return process.env.ELEVENLABS_API_KEY ?? null;
    const fromKeychain = await keytar.getPassword(SERVICE, ACCOUNT);
    if (fromKeychain) return fromKeychain;
  } catch {
    // ignore and fallback to env
  }
  return process.env.ELEVENLABS_API_KEY ?? null;
}

export async function deleteApiKey(): Promise<void> {
  try {
    const keytar = await getKeytar();
    if (!keytar) return;
    await keytar.deletePassword(SERVICE, ACCOUNT);
  } catch {
    // ignore
  }
}
