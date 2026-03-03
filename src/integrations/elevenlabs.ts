import { getApiKey } from '../state/keychain.js';
import { VoiceConfig } from '../state/config.js';

export class ElevenLabsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ElevenLabsError';
  }
}

export async function synthesizeSpeech(text: string, config: VoiceConfig): Promise<Buffer> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new ElevenLabsError('Missing ElevenLabs API key. Run `codex2voice init` or set ELEVENLABS_API_KEY.');
  }

  if (!config.voiceId) {
    throw new ElevenLabsError('Missing voiceId in config. Run `codex2voice init` to set it.');
  }

  const clipped = text.slice(0, config.maxCharsPerSynthesis).trim();
  if (!clipped) {
    throw new ElevenLabsError('Cannot synthesize empty text.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  const ttsSpeed = Math.max(0.7, Math.min(1.2, config.speed));

  let response: Response;
  try {
    response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.voiceId)}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'content-type': 'application/json',
        accept: 'audio/mpeg'
      },
      signal: controller.signal,
      body: JSON.stringify({
        text: clipped,
        model_id: config.modelId,
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.7,
          speed: ttsSpeed,
          style: 0.4,
          use_speaker_boost: true
        }
      })
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new ElevenLabsError('ElevenLabs auth failed. Check your API key.');
    }
    if (response.status === 429) {
      throw new ElevenLabsError('ElevenLabs rate limit reached. Retry shortly.');
    }
    throw new ElevenLabsError(`ElevenLabs request failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
