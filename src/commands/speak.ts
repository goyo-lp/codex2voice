import { readCache } from '../state/cache.js';
import { speakTextNow } from '../core/speech.js';

export async function runSpeak(textArg?: string): Promise<void> {
  const text = textArg?.trim() || (await readCache()).lastText;
  if (!text) {
    console.log('No cached response found. Use codex2voice codex -- <args> first, or pass text directly.');
    return;
  }

  const result = await speakTextNow(text);
  if (!result.spoken) {
    console.log(`Nothing spoken (${result.reason}).`);
    return;
  }

  console.log(`Speaking now (${result.reason}).`);
}
