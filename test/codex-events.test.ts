import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSpeechCandidates, parseSpeechCandidatesDetailed } from '../src/commands/codex-events.js';

const fixturesDir = path.join(process.cwd(), 'test', 'fixtures');

async function readFixture(name: string): Promise<string> {
  return fs.readFile(path.join(fixturesDir, name), 'utf8');
}

describe('codex event parsing', () => {
  it('parses event_msg final_answer', async () => {
    const raw = await readFixture('event-msg-final-answer.jsonl');
    const candidates = parseSpeechCandidates(raw);
    expect(candidates).toEqual(['Hi. What would you like to work on?']);
  });

  it('parses task_complete fallback message', async () => {
    const raw = await readFixture('task-complete-fallback.jsonl');
    const candidates = parseSpeechCandidates(raw);
    expect(candidates).toEqual(['Completed successfully.']);
  });

  it('parses response_item final assistant answer', async () => {
    const raw = await readFixture('response-item-final-answer.jsonl');
    const candidates = parseSpeechCandidates(raw);
    expect(candidates).toEqual(['Hello from response_item.']);
  });

  it('ignores noise and keeps only final answer', async () => {
    const raw = await readFixture('mixed-noise.jsonl');
    const candidates = parseSpeechCandidates(raw);
    expect(candidates).toEqual(['Final usable answer.']);
  });

  it('emits debug traces when enabled', async () => {
    const raw = await readFixture('mixed-noise.jsonl');
    const result = parseSpeechCandidatesDetailed(raw, { debug: true });
    expect(result.candidates).toEqual(['Final usable answer.']);
    expect(result.traces.length).toBeGreaterThan(0);
  });

  it('dedupes equivalent final answer across adjacent event types', () => {
    const raw = [
      '{"type":"event_msg","payload":{"type":"agent_message","phase":"final_answer","message":"Hello."}}',
      '{"type":"response_item","payload":{"type":"message","role":"assistant","phase":"final_answer","content":[{"type":"output_text","text":"Hello."}]}}',
      '{"type":"event_msg","payload":{"type":"task_complete","last_agent_message":"Hello."}}'
    ].join('\n');

    const candidates = parseSpeechCandidates(raw);
    expect(candidates).toEqual(['Hello.']);
  });
});
