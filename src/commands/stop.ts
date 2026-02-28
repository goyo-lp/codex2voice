import { stopPlayback } from '../audio/playback.js';

export async function runStop(): Promise<void> {
  const stopped = await stopPlayback();
  console.log(stopped ? 'Stopped active playback.' : 'No active playback found.');
}
