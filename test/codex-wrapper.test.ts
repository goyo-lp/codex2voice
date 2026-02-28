import { describe, expect, it } from 'vitest';
import { shouldReplayFromStart } from '../src/commands/codex.js';

describe('codex wrapper file replay decision', () => {
  it('replays from start only for files created near wrapper start', () => {
    const startedAt = 1_000_000;
    expect(shouldReplayFromStart({ birthtimeMs: 1_000_100 }, startedAt)).toBe(true);
    expect(shouldReplayFromStart({ birthtimeMs: 995_100 }, startedAt)).toBe(true);
    expect(shouldReplayFromStart({ birthtimeMs: 994_900 }, startedAt)).toBe(false);
    expect(shouldReplayFromStart({ birthtimeMs: 0 }, startedAt)).toBe(false);
  });
});
