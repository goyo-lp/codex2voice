import { speakTextIfEligible } from '../core/speech.js';
import { setLastText } from '../state/cache.js';

export async function runIngestFromStdin(force = false): Promise<void> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) {
    console.log('No input text provided on stdin.');
    return;
  }

  await setLastText(text);
  const result = await speakTextIfEligible(text, force);
  console.log(result.spoken ? `Spoken (${result.reason}).` : `Skipped (${result.reason}).`);
}
