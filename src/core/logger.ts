import pino from 'pino';

const isDebug = process.env.CODEX2VOICE_DEBUG === '1';

export const logger = pino({
  level: isDebug ? 'debug' : 'silent'
});
