import { readConfig } from '../state/config.js';
import { toSpeechDecision } from './filter.js';
import { synthesizeSpeech } from '../integrations/elevenlabs.js';
import { playAudioBuffer } from '../audio/playback.js';
import { setLastText } from '../state/cache.js';

export async function speakTextIfEligible(text: string, force = false): Promise<{ spoken: boolean; reason: string }> {
  const config = await readConfig();

  const decision = toSpeechDecision(text, config.summarizeCodeHeavy);
  if (!decision.shouldSpeak) {
    return { spoken: false, reason: decision.reason };
  }

  await setLastText(text);

  if (!force && (!config.enabled || !config.autoSpeak)) {
    return { spoken: false, reason: 'voice-disabled' };
  }

  const audio = await synthesizeSpeech(decision.textForSpeech, config);
  await playAudioBuffer(audio);

  return { spoken: true, reason: decision.reason };
}

export async function speakTextNow(text: string): Promise<{ spoken: boolean; reason: string }> {
  const config = await readConfig();
  const decision = toSpeechDecision(text, config.summarizeCodeHeavy);
  if (!decision.shouldSpeak) {
    return { spoken: false, reason: decision.reason };
  }
  const audio = await synthesizeSpeech(decision.textForSpeech, config);
  await playAudioBuffer(audio);
  await setLastText(text);
  return { spoken: true, reason: decision.reason };
}
