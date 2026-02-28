import { describe, expect, it } from 'vitest';
import { toSpeechDecision } from '../src/core/filter.js';

describe('toSpeechDecision', () => {
  it('speaks natural language', () => {
    const result = toSpeechDecision('This is a normal explanation of what changed.');
    expect(result.shouldSpeak).toBe(true);
    expect(result.reason).toBe('natural-language');
  });

  it('summarizes code-heavy text', () => {
    const result = toSpeechDecision('```ts\nconst x = 1\n```\n+ added line\n- removed line', true);
    expect(result.shouldSpeak).toBe(true);
    expect(result.reason).toBe('code-heavy-summary');
  });

  it('skips code-heavy text when summarization disabled', () => {
    const result = toSpeechDecision('```ts\nconst x = 1\n```\n+ added line\n- removed line', false);
    expect(result.shouldSpeak).toBe(false);
    expect(result.reason).toBe('code-heavy');
  });

  it('speaks short natural responses', () => {
    const result = toSpeechDecision('Hello.');
    expect(result.shouldSpeak).toBe(true);
    expect(result.reason).toBe('natural-language');
  });

  it('skips nearly empty responses', () => {
    const result = toSpeechDecision(' ');
    expect(result.shouldSpeak).toBe(false);
    expect(result.reason).toBe('empty');
  });
});
