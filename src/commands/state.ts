import { updateConfig, readConfig } from '../state/config.js';

export async function setVoiceOn(): Promise<void> {
  await updateConfig({ enabled: true, autoSpeak: true });
  console.log('Voice is ON.');
}

export async function setVoiceOff(): Promise<void> {
  await updateConfig({ enabled: false });
  console.log('Voice is OFF.');
}

export async function showStatus(): Promise<void> {
  const config = await readConfig();
  console.log('codex2voice status');
  console.log(`enabled: ${config.enabled}`);
  console.log(`autoSpeak: ${config.autoSpeak}`);
  console.log(`voiceId: ${config.voiceId || '(not set)'}`);
  console.log(`modelId: ${config.modelId}`);
  console.log(`summarizeCodeHeavy: ${config.summarizeCodeHeavy}`);
  console.log(`playbackConflictPolicy: ${config.playbackConflictPolicy}`);
}
