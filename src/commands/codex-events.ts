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

export function parseSpeechCandidatesDetailed(
  jsonlChunk: string,
  options: ParseSpeechOptions = {}
): ParseSpeechResult {
  const candidates: string[] = [];
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
    candidates.push(message);
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

  return { candidates, traces };
}

export function parseSpeechCandidates(jsonlChunk: string): string[] {
  return parseSpeechCandidatesDetailed(jsonlChunk).candidates;
}
