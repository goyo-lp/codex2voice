import { describe, expect, it } from 'vitest';
import { parseSessionActionsDetailed } from '../src/commands/codex-events.js';
import {
  ADAPTIVE_POLL,
  computeNextPollInterval,
  createSessionVoiceState,
  evaluateSpeechDecisionsForActions,
  hasWebSocketFeatureOverride,
  normalizeManualVoiceValue,
  normalizeSpeechKey,
  selectTrackedFilesForPoll,
  splitCompleteJsonlChunk,
  shouldReplayFromStart
} from '../src/commands/codex.js';

describe('codex wrapper file replay decision', () => {
  it('replays from start only for files created near wrapper start', () => {
    const startedAt = 1_000_000;
    expect(shouldReplayFromStart({ birthtimeMs: 1_000_100 }, startedAt)).toBe(true);
    expect(shouldReplayFromStart({ birthtimeMs: 995_100 }, startedAt)).toBe(true);
    expect(shouldReplayFromStart({ birthtimeMs: 994_900 }, startedAt)).toBe(false);
    expect(shouldReplayFromStart({ birthtimeMs: 0 }, startedAt)).toBe(false);
  });

  it('normalizes whitespace and case for speech dedupe keys', () => {
    expect(normalizeSpeechKey(' Hello.  ')).toBe('hello.');
    expect(normalizeSpeechKey('Hello.\n')).toBe('hello.');
    expect(normalizeSpeechKey('HELLO.')).toBe('hello.');
    expect(normalizeSpeechKey('Hi   there')).toBe('hi there');
  });

  it('resets poll interval to minimum when activity is seen', () => {
    const next = computeNextPollInterval(ADAPTIVE_POLL.maxMs, true);
    expect(next).toBe(ADAPTIVE_POLL.minMs);
  });

  it('backs off poll interval in fixed steps and caps at max', () => {
    const once = computeNextPollInterval(ADAPTIVE_POLL.minMs, false);
    expect(once).toBe(ADAPTIVE_POLL.minMs + ADAPTIVE_POLL.idleStepMs);

    const capped = computeNextPollInterval(ADAPTIVE_POLL.maxMs, false);
    expect(capped).toBe(ADAPTIVE_POLL.maxMs);
  });

  it('polls only active file unless background sweep is requested', () => {
    const candidates = [
      { filePath: '/a.jsonl', isFresh: true },
      { filePath: '/b.jsonl', isFresh: true }
    ];

    expect(selectTrackedFilesForPoll(candidates, '/b.jsonl', false)).toEqual(['/b.jsonl']);
    expect(selectTrackedFilesForPoll(candidates, '/b.jsonl', true)).toEqual(['/b.jsonl', '/a.jsonl']);
  });

  it('prefers fresh files when active lock is not set', () => {
    const mixedCandidates = [
      { filePath: '/old.jsonl', isFresh: false },
      { filePath: '/fresh.jsonl', isFresh: true }
    ];
    expect(selectTrackedFilesForPoll(mixedCandidates, null, false)).toEqual(['/fresh.jsonl']);

    const noFresh = [
      { filePath: '/x.jsonl', isFresh: false },
      { filePath: '/y.jsonl', isFresh: false }
    ];
    expect(selectTrackedFilesForPoll(noFresh, null, false)).toEqual(['/x.jsonl', '/y.jsonl']);
  });

  it('detects websocket override only from explicit feature flags', () => {
    expect(hasWebSocketFeatureOverride(['--disable', 'responses_websockets'])).toBe(true);
    expect(hasWebSocketFeatureOverride(['--enable=responses_websockets_v2'])).toBe(true);
    expect(hasWebSocketFeatureOverride(['--disable=responses_websockets,responses_websockets_v2'])).toBe(true);

    expect(hasWebSocketFeatureOverride(['--disable', 'other_feature'])).toBe(false);
    expect(hasWebSocketFeatureOverride(['--prompt', 'please explain responses_websockets internals'])).toBe(false);
  });

  it('splits complete JSONL lines and preserves trailing partial line', () => {
    const split = splitCompleteJsonlChunk('{"type":"event_msg"}\n{"type":"response_item"');
    expect(split.completeChunk).toBe('{"type":"event_msg"}\n');
    expect(split.trailingPartial).toBe('{"type":"response_item"');

    const completeOnly = splitCompleteJsonlChunk('{"type":"event_msg"}\n');
    expect(completeOnly.completeChunk).toBe('{"type":"event_msg"}\n');
    expect(completeOnly.trailingPartial).toBe('');
  });

  it('normalizes manual voice values from session control file', () => {
    expect(normalizeManualVoiceValue('on')).toBe('on');
    expect(normalizeManualVoiceValue('OFF')).toBe('off');
    expect(normalizeManualVoiceValue('clear')).toBe('default');
    expect(normalizeManualVoiceValue('auto')).toBe('default');
    expect(normalizeManualVoiceValue('unknown')).toBeNull();
    expect(normalizeManualVoiceValue(1)).toBeNull();
  });
});

describe('session voice precedence matrix', () => {
  function evaluateFromRaw(raw: string) {
    const parsed = parseSessionActionsDetailed(raw);
    return evaluateSpeechDecisionsForActions(parsed.actions, createSessionVoiceState());
  }

  it('speaks in /plan mode when no manual override exists', () => {
    const raw = [
      '{"type":"event_msg","payload":{"type":"user_message","message":"/plan"}}',
      '{"type":"event_msg","payload":{"type":"agent_message","phase":"final_answer","message":"Plan answer."}}'
    ].join('\n');

    const decisions = evaluateFromRaw(raw);
    expect(decisions).toEqual([{ message: 'Plan answer.', shouldSpeak: true }]);
  });

  it('speaks when plan mode is inferred from task_started metadata', () => {
    const raw = [
      '{"type":"event_msg","payload":{"type":"task_started","collaboration_mode_kind":"plan"}}',
      '{"type":"event_msg","payload":{"type":"agent_message","phase":"final_answer","message":"Hi. What would you like to plan today?"}}'
    ].join('\n');

    const decisions = evaluateFromRaw(raw);
    expect(decisions).toEqual([{ message: 'Hi. What would you like to plan today?', shouldSpeak: true }]);
  });

  it('does not speak in /plan mode after user says voice off', () => {
    const raw = [
      '{"type":"event_msg","payload":{"type":"user_message","message":"/plan"}}',
      '{"type":"event_msg","payload":{"type":"user_message","message":"voice off"}}',
      '{"type":"event_msg","payload":{"type":"agent_message","phase":"final_answer","message":"Muted plan answer."}}'
    ].join('\n');

    const decisions = evaluateFromRaw(raw);
    expect(decisions).toEqual([{ message: 'Muted plan answer.', shouldSpeak: false }]);
  });

  it('speaks in /default mode when user says voice on', () => {
    const raw = [
      '{"type":"event_msg","payload":{"type":"user_message","message":"/default"}}',
      '{"type":"event_msg","payload":{"type":"user_message","message":"voice on"}}',
      '{"type":"event_msg","payload":{"type":"agent_message","phase":"final_answer","message":"Manual-on answer."}}'
    ].join('\n');

    const decisions = evaluateFromRaw(raw);
    expect(decisions).toEqual([{ message: 'Manual-on answer.', shouldSpeak: true }]);
  });

  it('honors the latest rapid voice toggle before final answer', () => {
    const raw = [
      '{"type":"event_msg","payload":{"type":"user_message","message":"voice on"}}',
      '{"type":"event_msg","payload":{"type":"user_message","message":"voice off"}}',
      '{"type":"event_msg","payload":{"type":"user_message","message":"voice on"}}',
      '{"type":"event_msg","payload":{"type":"user_message","message":"voice off"}}',
      '{"type":"event_msg","payload":{"type":"agent_message","phase":"final_answer","message":"Last toggle wins."}}'
    ].join('\n');

    const decisions = evaluateFromRaw(raw);
    expect(decisions).toEqual([{ message: 'Last toggle wins.', shouldSpeak: false }]);
  });
});
