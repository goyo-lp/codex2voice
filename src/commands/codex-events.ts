export type ResponseContentItem = {
  type?: string;
  text?: string;
};

export type SessionEvent = {
  type?: string;
  timestamp?: string;
  payload?: {
    type?: string;
    phase?: string;
    role?: string;
    message?: string;
    last_agent_message?: string;
    turn_id?: string;
    collaboration_mode_kind?: string;
    collaboration_mode?: {
      mode?: string;
    };
    content?: ResponseContentItem[];
  };
};

export type ParseSpeechOptions = {
  debug?: boolean;
};

export type ParseSpeechResult = {
  candidates: string[];
  traces: string[];
};

export type SessionControlSignal =
  | 'plan_enter'
  | 'plan_exit'
  | 'manual_voice_on'
  | 'manual_voice_off'
  | 'manual_voice_default';

export type SessionAction =
  | {
      kind: 'candidate';
      message: string;
      line: number;
      source: string;
    }
  | {
      kind: 'control';
      signal: SessionControlSignal;
      line: number;
      source: string;
    };

export type ParseSessionActionsResult = {
  actions: SessionAction[];
  traces: string[];
};

function extractFinalAnswerFromResponseItem(payload: SessionEvent['payload']): string {
  if (!payload) return '';
  if (payload.type !== 'message') return '';
  if (payload.role !== 'assistant') return '';
  if (payload.phase !== 'final_answer') return '';

  return (payload.content ?? [])
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text?.trim() ?? '')
    .filter(Boolean)
    .join('\n')
    .trim();
}

function normalizeUserMessageForControl(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/\s]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function parseManualVoiceSignalFromUserMessage(message: string): SessionControlSignal | null {
  const normalized = normalizeUserMessageForControl(message);
  if (!normalized) return null;

  if (/^\/voice\s+(?:on|enable|enabled|unmute)\b/.test(normalized)) return 'manual_voice_on';
  if (/^\/voice\s+(?:off|disable|disabled|mute)\b/.test(normalized)) return 'manual_voice_off';
  if (/^\/voice\s+(?:default|auto|clear|reset)\b/.test(normalized)) return 'manual_voice_default';

  if (
    /\bvoice\s+on\b/.test(normalized) ||
    /\bturn\s+(?:the\s+)?voice\s+on\b/.test(normalized) ||
    /\benable\s+voice\b/.test(normalized) ||
    /\bunmute\s+voice\b/.test(normalized) ||
    /\bstart\s+speaking\b/.test(normalized)
  ) {
    return 'manual_voice_on';
  }

  if (
    /\bvoice\s+off\b/.test(normalized) ||
    /\bturn\s+(?:the\s+)?voice\s+off\b/.test(normalized) ||
    /\bdisable\s+voice\b/.test(normalized) ||
    /\bmute\s+voice\b/.test(normalized) ||
    /\bstop\s+speaking\b/.test(normalized)
  ) {
    return 'manual_voice_off';
  }

  if (
    /\bvoice\s+(?:default|auto)\b/.test(normalized) ||
    /\breset\s+voice\b/.test(normalized) ||
    /\bclear\s+voice\s+(?:override|mode)\b/.test(normalized)
  ) {
    return 'manual_voice_default';
  }

  return null;
}

function parseControlSignalFromModeLabel(value: string): SessionControlSignal | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'plan') return 'plan_enter';
  if (normalized === 'default') return 'plan_exit';
  return null;
}

function parseControlSignalFromUserMessage(message: string): SessionControlSignal | null {
  const normalized = message.trim().toLowerCase();
  if (/^\/plan(?:\s|$)/.test(normalized)) return 'plan_enter';
  if (/^\/default(?:\s|$)/.test(normalized)) return 'plan_exit';
  const manualSignal = parseManualVoiceSignalFromUserMessage(message);
  if (manualSignal) return manualSignal;
  return null;
}

export function parseSessionActionsDetailed(
  jsonlChunk: string,
  options: ParseSpeechOptions = {}
): ParseSessionActionsResult {
  const actions: SessionAction[] = [];
  const traces: string[] = [];
  const debug = Boolean(options.debug);
  let lastAccepted: { message: string; line: number } | null = null;

  const pushCandidate = (message: string, line: number, source: string): void => {
    // Codex often emits the same final answer in adjacent event shapes
    // (agent_message, response_item, task_complete). Keep only one.
    if (lastAccepted && lastAccepted.message === message && line - lastAccepted.line <= 5) {
      if (debug) traces.push(`line ${line}: dedupe ${source}`);
      return;
    }
    actions.push({ kind: 'candidate', message, line, source });
    lastAccepted = { message, line };
    if (debug) traces.push(`line ${line}: accept ${source}`);
  };

  const lines = jsonlChunk.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();
    if (!trimmed) continue;

    let event: SessionEvent;
    try {
      event = JSON.parse(trimmed) as SessionEvent;
    } catch {
      if (debug) traces.push(`line ${index + 1}: skip invalid json`);
      continue;
    }

    if (event.type === 'event_msg' && event.payload?.type === 'task_started') {
      const signal = parseControlSignalFromModeLabel(event.payload.collaboration_mode_kind ?? '');
      if (signal) {
        actions.push({
          kind: 'control',
          signal,
          line: index + 1,
          source: 'event_msg.task_started.collaboration_mode_kind'
        });
        if (debug) traces.push(`line ${index + 1}: control ${signal}`);
      } else if (debug) {
        traces.push(`line ${index + 1}: skip task_started mode`);
      }
      continue;
    }

    if (event.type === 'turn_context') {
      const signal = parseControlSignalFromModeLabel(event.payload?.collaboration_mode?.mode ?? '');
      if (signal) {
        actions.push({
          kind: 'control',
          signal,
          line: index + 1,
          source: 'turn_context.collaboration_mode.mode'
        });
        if (debug) traces.push(`line ${index + 1}: control ${signal}`);
      } else if (debug) {
        traces.push(`line ${index + 1}: skip turn_context mode`);
      }
      continue;
    }

    if (event.type === 'event_msg' && event.payload?.type === 'user_message') {
      const userMessage = (event.payload.message ?? '').trim();
      const signal = parseControlSignalFromUserMessage(userMessage);
      if (signal) {
        actions.push({
          kind: 'control',
          signal,
          line: index + 1,
          source: 'event_msg.user_message.command'
        });
        if (debug) traces.push(`line ${index + 1}: control ${signal}`);
      } else if (debug) {
        traces.push(`line ${index + 1}: skip user_message`);
      }
      continue;
    }

    if (
      event.type === 'event_msg' &&
      event.payload?.type === 'agent_message' &&
      event.payload?.phase === 'final_answer'
    ) {
      const msg = (event.payload.message ?? event.payload.last_agent_message ?? '').trim();
      if (msg) {
        pushCandidate(msg, index + 1, 'event_msg.agent_message.final_answer');
      } else if (debug) {
        traces.push(`line ${index + 1}: reject empty event_msg.agent_message.final_answer`);
      }
      continue;
    }

    if (event.type === 'event_msg' && event.payload?.type === 'task_complete') {
      const msg = event.payload.last_agent_message?.trim();
      if (msg) {
        pushCandidate(msg, index + 1, 'event_msg.task_complete.last_agent_message');
      } else if (debug) {
        traces.push(`line ${index + 1}: reject empty event_msg.task_complete`);
      }
      continue;
    }

    if (event.type === 'response_item') {
      const msg = extractFinalAnswerFromResponseItem(event.payload);
      if (msg) {
        pushCandidate(msg, index + 1, 'response_item.message.final_answer');
      } else if (debug) {
        traces.push(`line ${index + 1}: reject response_item not final assistant text`);
      }
      continue;
    }

    if (debug && event.type) {
      traces.push(`line ${index + 1}: skip ${event.type}`);
    }
  }

  return { actions, traces };
}

export function parseSpeechCandidatesDetailed(
  jsonlChunk: string,
  options: ParseSpeechOptions = {}
): ParseSpeechResult {
  const parsed = parseSessionActionsDetailed(jsonlChunk, options);
  return {
    candidates: parsed.actions
      .filter((action): action is Extract<SessionAction, { kind: 'candidate' }> => action.kind === 'candidate')
      .map((action) => action.message),
    traces: parsed.traces
  };
}

export function parseSpeechCandidates(jsonlChunk: string): string[] {
  return parseSpeechCandidatesDetailed(jsonlChunk).candidates;
}
