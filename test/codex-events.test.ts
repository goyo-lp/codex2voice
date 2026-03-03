import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseSessionActionsDetailed,
  parseSpeechCandidates,
  parseSpeechCandidatesDetailed
} from '../src/commands/codex-events.js';

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

  it('never treats user_message as a speech candidate', () => {
    const raw = [
      '{"type":"event_msg","payload":{"type":"user_message","message":"hello"}}',
      '{"type":"event_msg","payload":{"type":"agent_message","phase":"final_answer","message":"Hi."}}'
    ].join('\n');

    const candidates = parseSpeechCandidates(raw);
    expect(candidates).toEqual(['Hi.']);
  });

  it('emits plan mode controls from user slash commands in order', () => {
    const raw = [
      '{"type":"event_msg","payload":{"type":"user_message","message":"/plan"}}',
      '{"type":"event_msg","payload":{"type":"agent_message","phase":"final_answer","message":"Plan response."}}',
      '{"type":"event_msg","payload":{"type":"user_message","message":"/default"}}'
    ].join('\n');

    const result = parseSessionActionsDetailed(raw);
    expect(result.actions).toEqual([
      { kind: 'control', signal: 'plan_enter', line: 1, source: 'event_msg.user_message.command' },
      {
        kind: 'candidate',
        message: 'Plan response.',
        line: 2,
        source: 'event_msg.agent_message.final_answer'
      },
      { kind: 'control', signal: 'plan_exit', line: 3, source: 'event_msg.user_message.command' }
    ]);
  });

  it('emits plan mode controls from collaboration mode metadata', () => {
    const raw = [
      '{"type":"event_msg","payload":{"type":"task_started","collaboration_mode_kind":"plan"}}',
      '{"type":"event_msg","payload":{"type":"agent_message","phase":"final_answer","message":"Hi. What would you like to plan today?"}}',
      '{"type":"event_msg","payload":{"type":"task_started","collaboration_mode_kind":"default"}}'
    ].join('\n');

    const result = parseSessionActionsDetailed(raw);
    expect(result.actions).toEqual([
      {
        kind: 'control',
        signal: 'plan_enter',
        line: 1,
        source: 'event_msg.task_started.collaboration_mode_kind'
      },
      {
        kind: 'candidate',
        message: 'Hi. What would you like to plan today?',
        line: 2,
        source: 'event_msg.agent_message.final_answer'
      },
      {
        kind: 'control',
        signal: 'plan_exit',
        line: 3,
        source: 'event_msg.task_started.collaboration_mode_kind'
      }
    ]);
  });

  it('emits manual voice controls from user phrase fallback parser', () => {
    const raw = [
      '{"type":"event_msg","payload":{"type":"user_message","message":"voice off"}}',
      '{"type":"event_msg","payload":{"type":"user_message","message":"turn voice on please"}}',
      '{"type":"event_msg","payload":{"type":"user_message","message":"reset voice mode"}}'
    ].join('\n');

    const result = parseSessionActionsDetailed(raw);
    expect(result.actions).toEqual([
      { kind: 'control', signal: 'manual_voice_off', line: 1, source: 'event_msg.user_message.command' },
      { kind: 'control', signal: 'manual_voice_on', line: 2, source: 'event_msg.user_message.command' },
      {
        kind: 'control',
        signal: 'manual_voice_default',
        line: 3,
        source: 'event_msg.user_message.command'
      }
    ]);
  });
});
