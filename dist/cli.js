#!/usr/bin/env node

// src/cli.ts
import { Command } from "commander";

// src/commands/init.ts
import fs4 from "fs/promises";
import os2 from "os";
import path3 from "path";
import inquirer from "inquirer";

// src/state/config.ts
import fs3 from "fs/promises";
import { z } from "zod";

// src/state/paths.ts
import os from "os";
import path from "path";
import fs from "fs/promises";
var OVERRIDE_HOME = process.env.CODEX2VOICE_HOME;
var CODEX_DIR = OVERRIDE_HOME ?? path.join(os.homedir(), ".codex");
var PATHS = {
  codexDir: CODEX_DIR,
  config: path.join(CODEX_DIR, "voice.json"),
  cache: path.join(CODEX_DIR, "voice-cache.json"),
  playback: path.join(CODEX_DIR, "voice-playback.json"),
  tempAudioDir: path.join(CODEX_DIR, "voice-audio")
};
async function ensureCodexDir() {
  await fs.mkdir(PATHS.codexDir, { recursive: true });
  await fs.mkdir(PATHS.tempAudioDir, { recursive: true });
}

// src/state/json.ts
import fs2 from "fs/promises";
import path2 from "path";
import { randomUUID } from "crypto";
async function writeJsonAtomic(filePath, value) {
  const dir = path2.dirname(filePath);
  const tmpPath = path2.join(dir, `.tmp-${process.pid}-${Date.now()}-${randomUUID()}.json`);
  await fs2.mkdir(dir, { recursive: true });
  await fs2.writeFile(tmpPath, JSON.stringify(value, null, 2), "utf8");
  await fs2.rename(tmpPath, filePath);
}

// src/state/config.ts
var configSchema = z.object({
  enabled: z.boolean().default(true),
  autoSpeak: z.boolean().default(true),
  voiceId: z.string().default(""),
  modelId: z.string().min(1).default("eleven_flash_v2_5"),
  speed: z.number().min(0.7).max(2).default(1.25),
  skipCodeHeavy: z.boolean().default(false),
  summarizeCodeHeavy: z.boolean().default(true),
  maxCharsPerSynthesis: z.number().int().min(200).max(6e3).default(2500),
  playbackConflictPolicy: z.enum(["stop-and-replace", "ignore"]).default("stop-and-replace")
});
var defaultConfig = configSchema.parse({});
async function readConfig() {
  await ensureCodexDir();
  try {
    const raw = await fs3.readFile(PATHS.config, "utf8");
    return configSchema.parse(JSON.parse(raw));
  } catch {
    await writeConfig(defaultConfig);
    return defaultConfig;
  }
}
async function writeConfig(config) {
  await ensureCodexDir();
  const parsed = configSchema.parse(config);
  await writeJsonAtomic(PATHS.config, parsed);
}
async function updateConfig(partial) {
  const current = await readConfig();
  const next = configSchema.parse({ ...current, ...partial });
  await writeConfig(next);
  return next;
}

// src/state/keychain.ts
var SERVICE = "codex2voice";
var ACCOUNT = "elevenlabs_api_key";
var keytarPromise = null;
async function getKeytar() {
  if (!keytarPromise) {
    keytarPromise = Function("moduleName", "return import(moduleName)")("keytar").then((mod) => mod.default).catch(() => null);
  }
  return keytarPromise;
}
async function setApiKey(key) {
  try {
    const keytar = await getKeytar();
    if (!keytar) return false;
    await keytar.setPassword(SERVICE, ACCOUNT, key);
    return true;
  } catch {
    return false;
  }
}
async function getApiKey() {
  try {
    const keytar = await getKeytar();
    if (!keytar) return process.env.ELEVENLABS_API_KEY ?? null;
    const fromKeychain = await keytar.getPassword(SERVICE, ACCOUNT);
    if (fromKeychain) return fromKeychain;
  } catch {
  }
  return process.env.ELEVENLABS_API_KEY ?? null;
}
async function deleteApiKey() {
  try {
    const keytar = await getKeytar();
    if (!keytar) return;
    await keytar.deletePassword(SERVICE, ACCOUNT);
  } catch {
  }
}

// src/commands/init.ts
async function appendAliasIfMissing() {
  const zshrc = path3.join(os2.homedir(), ".zshrc");
  const marker = "# codex2voice wrapper";
  const aliasLine = "alias codex='codex2voice codex --'";
  try {
    let content = "";
    try {
      content = await fs4.readFile(zshrc, "utf8");
    } catch {
      content = "";
    }
    if (content.includes(aliasLine) || content.includes(marker)) {
      return "exists";
    }
    const block = `
${marker}
${aliasLine}
`;
    await fs4.appendFile(zshrc, block, "utf8");
    return "added";
  } catch {
    return "failed";
  }
}
async function runInit() {
  const current = await readConfig();
  const answers = await inquirer.prompt([
    {
      type: "password",
      name: "apiKey",
      message: "Enter your ElevenLabs API key:",
      mask: "*",
      validate: (input) => input.trim().length > 10 ? true : "API key looks too short"
    },
    {
      type: "input",
      name: "voiceId",
      message: "Enter ElevenLabs voice ID:",
      default: current.voiceId || process.env.ELEVENLABS_VOICE_ID || ""
    },
    {
      type: "confirm",
      name: "enabled",
      message: "Enable voice by default?",
      default: true
    },
    {
      type: "input",
      name: "speed",
      message: "Speech speed (0.7 - 2.0):",
      default: String(current.speed),
      validate: (input) => {
        const value = Number.parseFloat(input);
        if (Number.isNaN(value)) return "Enter a numeric value, for example 1.25";
        return value >= 0.7 && value <= 2 ? true : "Use a value between 0.7 and 2.0";
      },
      filter: (input) => Number.parseFloat(input)
    },
    {
      type: "confirm",
      name: "setupWrapper",
      message: "Set up codex wrapper alias in ~/.zshrc by default?",
      default: true
    }
  ]);
  const savedToKeychain = await setApiKey(answers.apiKey.trim());
  await writeConfig({
    ...current,
    enabled: Boolean(answers.enabled),
    autoSpeak: true,
    voiceId: String(answers.voiceId).trim(),
    speed: Number(answers.speed),
    summarizeCodeHeavy: true,
    skipCodeHeavy: false,
    playbackConflictPolicy: "stop-and-replace"
  });
  let aliasStatus = "skipped";
  if (answers.setupWrapper) {
    aliasStatus = await appendAliasIfMissing();
  }
  console.log("Initialization complete.");
  console.log(savedToKeychain ? "API key stored in macOS Keychain." : "Could not store key in Keychain. Set ELEVENLABS_API_KEY in your shell env.");
  if (aliasStatus === "added") console.log("Added codex wrapper alias to ~/.zshrc. Open a new shell session.");
  if (aliasStatus === "exists") console.log("Wrapper alias already exists in ~/.zshrc.");
  if (aliasStatus === "failed") console.log("Could not update ~/.zshrc automatically. Add alias manually: alias codex='codex2voice codex --'");
  console.log("Next: run `codex2voice doctor` then `codex2voice status`.");
}

// src/commands/state.ts
async function setVoiceOn() {
  await updateConfig({ enabled: true, autoSpeak: true });
  console.log("Voice is ON.");
}
async function setVoiceOff() {
  await updateConfig({ enabled: false });
  console.log("Voice is OFF.");
}
async function showStatus() {
  const config = await readConfig();
  console.log("codex2voice status");
  console.log(`enabled: ${config.enabled}`);
  console.log(`autoSpeak: ${config.autoSpeak}`);
  console.log(`voiceId: ${config.voiceId || "(not set)"}`);
  console.log(`modelId: ${config.modelId}`);
  console.log(`summarizeCodeHeavy: ${config.summarizeCodeHeavy}`);
  console.log(`playbackConflictPolicy: ${config.playbackConflictPolicy}`);
}

// src/commands/doctor.ts
import { access } from "fs/promises";
import { constants } from "fs";
import { execa } from "execa";
async function checkCommand(cmd) {
  try {
    await execa("which", [cmd]);
    return true;
  } catch {
    return false;
  }
}
async function checkElevenLabs(apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5e3);
  try {
    const response = await fetch("https://api.elevenlabs.io/v1/user", {
      headers: { "xi-api-key": apiKey },
      signal: controller.signal
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
async function runDoctor() {
  await ensureCodexDir();
  const config = await readConfig();
  const hasCodex = await checkCommand("codex");
  const hasAfplay = await checkCommand("afplay");
  const apiKey = await getApiKey();
  const canReadConfig = await access(PATHS.config, constants.R_OK).then(() => true).catch(() => false);
  const canWriteDir = await access(PATHS.codexDir, constants.W_OK).then(() => true).catch(() => false);
  const apiReachable = apiKey ? await checkElevenLabs(apiKey) : false;
  console.log("codex2voice doctor");
  console.log(`codex command: ${hasCodex ? "PASS" : "FAIL"}`);
  console.log(`afplay available (macOS): ${hasAfplay ? "PASS" : "FAIL"}`);
  console.log(`config readable: ${canReadConfig ? "PASS" : "FAIL"}`);
  console.log(`codex dir writable: ${canWriteDir ? "PASS" : "FAIL"}`);
  console.log(`api key present: ${apiKey ? "PASS" : "FAIL"}`);
  console.log(`elevenlabs reachable: ${apiReachable ? "PASS" : "FAIL"}`);
  console.log(`voice id configured: ${config.voiceId ? "PASS" : "FAIL"}`);
  if (!apiKey) {
    console.log("Remediation: run `codex2voice init` or export ELEVENLABS_API_KEY.");
  }
}

// src/state/cache.ts
import fs5 from "fs/promises";
import { z as z2 } from "zod";
var cacheSchema = z2.object({
  lastText: z2.string().default(""),
  updatedAt: z2.string().default("")
});
var defaultCache = { lastText: "", updatedAt: "" };
var CACHE_DEBOUNCE_MS = Math.max(0, Number.parseInt(process.env.CODEX2VOICE_CACHE_DEBOUNCE_MS ?? "0", 10) || 0);
var debounceTimer = null;
var pendingText = null;
var pendingResolvers = [];
var pendingRejectors = [];
async function readCache() {
  await ensureCodexDir();
  try {
    const raw = await fs5.readFile(PATHS.cache, "utf8");
    return cacheSchema.parse(JSON.parse(raw));
  } catch {
    await writeCache(defaultCache);
    return defaultCache;
  }
}
async function writeCache(cache) {
  await ensureCodexDir();
  const parsed = cacheSchema.parse(cache);
  await writeJsonAtomic(PATHS.cache, parsed);
}
async function flushPendingText() {
  const text = pendingText;
  pendingText = null;
  if (!text) return;
  await writeCache({ lastText: text, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
}
function resolveAllPending() {
  const resolves = pendingResolvers;
  pendingResolvers = [];
  pendingRejectors = [];
  resolves.forEach((resolve) => resolve());
}
function rejectAllPending(error) {
  const rejects = pendingRejectors;
  pendingResolvers = [];
  pendingRejectors = [];
  rejects.forEach((reject) => reject(error));
}
async function setLastText(text) {
  const normalized = text.trim();
  if (!normalized) return;
  if (CACHE_DEBOUNCE_MS <= 0) {
    await writeCache({ lastText: normalized, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
    return;
  }
  pendingText = normalized;
  const waitForFlush = new Promise((resolve, reject) => {
    pendingResolvers.push(resolve);
    pendingRejectors.push(reject);
  });
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flushPendingText().then(() => resolveAllPending()).catch((error) => rejectAllPending(error));
  }, CACHE_DEBOUNCE_MS);
  await waitForFlush;
}

// src/core/filter.ts
function countMatches(text, regex) {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}
function summarizeCodeHeavyText(text) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const fileMentions = lines.filter((line) => /\b(src|app|lib|test|package|README|\.ts|\.js|\.tsx|\.jsx|\.py|\.md)\b/i.test(line)).slice(0, 3);
  if (fileMentions.length > 0) {
    return `I made code-focused updates. Key areas touched include ${fileMentions.join(", ")}. Please review the terminal for exact code changes.`;
  }
  return "I made code-focused updates. Please review the terminal for exact diffs and file edits.";
}
function toSpeechDecision(text, summarizeCodeHeavy = true) {
  const trimmed = text.trim();
  if (!trimmed) {
    return { shouldSpeak: false, reason: "empty", textForSpeech: "" };
  }
  const lineCount = trimmed.split("\n").length;
  const codeFenceCount = countMatches(trimmed, /```/g);
  const diffLikeLineCount = countMatches(trimmed, /^\+|^\-|^@@|^diff\s|^index\s/mg);
  const toolLineCount = countMatches(trimmed, /^\$|^npm\s|^yarn\s|^pnpm\s|^git\s/mg);
  const heavySignal = codeFenceCount * 8 + diffLikeLineCount + toolLineCount;
  const heavyThreshold = Math.max(12, Math.floor(lineCount * 0.4));
  if (heavySignal >= heavyThreshold) {
    if (!summarizeCodeHeavy) {
      return { shouldSpeak: false, reason: "code-heavy", textForSpeech: "" };
    }
    return {
      shouldSpeak: true,
      reason: "code-heavy-summary",
      textForSpeech: summarizeCodeHeavyText(trimmed)
    };
  }
  const cleaned = trimmed.replace(/```[\s\S]*?```/g, " code block omitted ").replace(/`([^`]+)`/g, "$1").replace(/\[(.*?)\]\((.*?)\)/g, "$1").replace(/^#{1,6}\s+/gm, "").replace(/^[-*]\s+/gm, "").replace(/\s+/g, " ").trim();
  if (cleaned.length < 2) {
    return { shouldSpeak: false, reason: "too-short", textForSpeech: "" };
  }
  return { shouldSpeak: true, reason: "natural-language", textForSpeech: cleaned };
}

// src/integrations/elevenlabs.ts
var ElevenLabsError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ElevenLabsError";
  }
};
async function synthesizeSpeech(text, config) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new ElevenLabsError("Missing ElevenLabs API key. Run `codex2voice init` or set ELEVENLABS_API_KEY.");
  }
  if (!config.voiceId) {
    throw new ElevenLabsError("Missing voiceId in config. Run `codex2voice init` to set it.");
  }
  const clipped = text.slice(0, config.maxCharsPerSynthesis).trim();
  if (!clipped) {
    throw new ElevenLabsError("Cannot synthesize empty text.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12e3);
  const ttsSpeed = Math.max(0.7, Math.min(1.2, config.speed));
  let response;
  try {
    response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.voiceId)}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "content-type": "application/json",
        accept: "audio/mpeg"
      },
      signal: controller.signal,
      body: JSON.stringify({
        text: clipped,
        model_id: config.modelId,
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.7,
          speed: ttsSpeed,
          style: 0.4,
          use_speaker_boost: true
        }
      })
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const body = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new ElevenLabsError("ElevenLabs auth failed. Check your API key.");
    }
    if (response.status === 429) {
      throw new ElevenLabsError("ElevenLabs rate limit reached. Retry shortly.");
    }
    throw new ElevenLabsError(`ElevenLabs request failed (${response.status}): ${body.slice(0, 200)}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// src/audio/playback.ts
import fs6 from "fs/promises";
import path4 from "path";
import { spawn } from "child_process";
import { randomUUID as randomUUID2 } from "crypto";

// src/core/logger.ts
import pino from "pino";
var isDebug = process.env.CODEX2VOICE_DEBUG === "1";
var logger = pino({
  level: isDebug ? "debug" : "silent"
});

// src/audio/playback.ts
async function readPlaybackState() {
  try {
    const raw = await fs6.readFile(PATHS.playback, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function writePlaybackState(state) {
  await writeJsonAtomic(PATHS.playback, state);
}
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
async function cleanupStaleState() {
  const state = await readPlaybackState();
  if (!state) return;
  if (!isPidAlive(state.pid)) {
    await fs6.rm(state.filePath, { force: true });
    await fs6.rm(PATHS.playback, { force: true });
  }
}
async function stopPlayback() {
  await cleanupStaleState();
  const state = await readPlaybackState();
  if (!state) return false;
  try {
    process.kill(state.pid, "SIGTERM");
  } catch {
  }
  await fs6.rm(state.filePath, { force: true });
  await fs6.rm(PATHS.playback, { force: true });
  return true;
}
async function playAudioBuffer(buffer) {
  await ensureCodexDir();
  await cleanupStaleState();
  const config = await readConfig();
  const current = await readPlaybackState();
  if (current && config.playbackConflictPolicy === "ignore") {
    logger.debug("Playback active and policy=ignore. Skipping new playback.");
    return;
  }
  if (current && config.playbackConflictPolicy === "stop-and-replace") {
    await stopPlayback();
  }
  const filePath = path4.join(PATHS.tempAudioDir, `${randomUUID2()}.mp3`);
  await fs6.writeFile(filePath, buffer);
  const playbackRate = Math.max(0.5, Math.min(2.5, config.speed));
  const child = spawn("afplay", ["-r", playbackRate.toFixed(2), filePath], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  await writePlaybackState({
    pid: child.pid ?? -1,
    filePath,
    startedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
}

// src/core/speech.ts
async function speakTextIfEligible(text, force = false) {
  const config = await readConfig();
  const decision = toSpeechDecision(text, config.summarizeCodeHeavy);
  if (!decision.shouldSpeak) {
    return { spoken: false, reason: decision.reason };
  }
  await setLastText(text);
  if (!force && (!config.enabled || !config.autoSpeak)) {
    return { spoken: false, reason: "voice-disabled" };
  }
  const audio = await synthesizeSpeech(decision.textForSpeech, config);
  await playAudioBuffer(audio);
  return { spoken: true, reason: decision.reason };
}
async function speakTextNow(text) {
  const config = await readConfig();
  const decision = toSpeechDecision(text, config.summarizeCodeHeavy);
  if (!decision.shouldSpeak) {
    return { spoken: false, reason: decision.reason };
  }
  const audio = await synthesizeSpeech(decision.textForSpeech, config);
  await playAudioBuffer(audio);
  await setLastText(text);
  return { spoken: true, reason: decision.reason };
}

// src/commands/speak.ts
async function runSpeak(textArg) {
  const text = textArg?.trim() || (await readCache()).lastText;
  if (!text) {
    console.log("No cached response found. Use codex2voice codex -- <args> first, or pass text directly.");
    return;
  }
  const result = await speakTextNow(text);
  if (!result.spoken) {
    console.log(`Nothing spoken (${result.reason}).`);
    return;
  }
  console.log(`Speaking now (${result.reason}).`);
}

// src/commands/stop.ts
async function runStop() {
  const stopped = await stopPlayback();
  console.log(stopped ? "Stopped active playback." : "No active playback found.");
}

// src/commands/uninstall.ts
import fs7 from "fs/promises";
import os3 from "os";
import path5 from "path";
import inquirer2 from "inquirer";
async function removeAliasBlock() {
  const zshrc = path5.join(os3.homedir(), ".zshrc");
  try {
    const content = await fs7.readFile(zshrc, "utf8");
    const cleaned = content.replace(/\n# codex2voice wrapper\nalias codex='codex2voice codex --'\n?/g, "\n").replace(/\n{3,}/g, "\n\n");
    await fs7.writeFile(zshrc, cleaned, "utf8");
  } catch {
  }
}
async function runUninstall() {
  const answers = await inquirer2.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: "Remove codex2voice config, cache, keychain secret, and wrapper alias?",
      default: false
    }
  ]);
  if (!answers.confirm) {
    console.log("Uninstall canceled.");
    return;
  }
  await fs7.rm(PATHS.config, { force: true });
  await fs7.rm(PATHS.cache, { force: true });
  await fs7.rm(PATHS.playback, { force: true });
  await fs7.rm(PATHS.tempAudioDir, { recursive: true, force: true });
  await deleteApiKey();
  await removeAliasBlock();
  console.log("codex2voice local state removed.");
}

// src/commands/codex.ts
import fs8 from "fs/promises";
import path6 from "path";
import os4 from "os";
import { spawn as spawn2 } from "child_process";

// src/commands/codex-events.ts
function extractFinalAnswerFromResponseItem(payload) {
  if (!payload) return "";
  if (payload.type !== "message") return "";
  if (payload.role !== "assistant") return "";
  if (payload.phase !== "final_answer") return "";
  return (payload.content ?? []).filter((item) => item.type === "output_text" && typeof item.text === "string").map((item) => item.text?.trim() ?? "").filter(Boolean).join("\n").trim();
}
function parseSpeechCandidatesDetailed(jsonlChunk, options = {}) {
  const candidates = [];
  const traces = [];
  const debug = Boolean(options.debug);
  const lines = jsonlChunk.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      if (debug) traces.push(`line ${index + 1}: skip invalid json`);
      continue;
    }
    if (event.type === "event_msg" && event.payload?.type === "agent_message" && event.payload?.phase === "final_answer") {
      const msg = (event.payload.message ?? event.payload.last_agent_message ?? "").trim();
      if (msg) {
        candidates.push(msg);
        if (debug) traces.push(`line ${index + 1}: accept event_msg.agent_message.final_answer`);
      } else if (debug) {
        traces.push(`line ${index + 1}: reject empty event_msg.agent_message.final_answer`);
      }
      continue;
    }
    if (event.type === "event_msg" && event.payload?.type === "task_complete") {
      const msg = event.payload.last_agent_message?.trim();
      if (msg) {
        candidates.push(msg);
        if (debug) traces.push(`line ${index + 1}: accept event_msg.task_complete.last_agent_message`);
      } else if (debug) {
        traces.push(`line ${index + 1}: reject empty event_msg.task_complete`);
      }
      continue;
    }
    if (event.type === "response_item") {
      const msg = extractFinalAnswerFromResponseItem(event.payload);
      if (msg) {
        candidates.push(msg);
        if (debug) traces.push(`line ${index + 1}: accept response_item.message.final_answer`);
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

// src/commands/codex.ts
var SESSIONS_DIR = path6.join(os4.homedir(), ".codex", "sessions");
var POLL_INTERVAL_MS = 140;
var DISCOVERY_INTERVAL_MS = 900;
function getSessionDayDir(date) {
  const yyyy = date.getFullYear().toString();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return path6.join(SESSIONS_DIR, yyyy, mm, dd);
}
async function listSessionFilesFast() {
  const today = getSessionDayDir(/* @__PURE__ */ new Date());
  const yesterday = getSessionDayDir(new Date(Date.now() - 24 * 60 * 60 * 1e3));
  const dirs = today === yesterday ? [today] : [today, yesterday];
  const files = [];
  for (const dir of dirs) {
    try {
      const entries = await fs8.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith(".jsonl")) continue;
        files.push(path6.join(dir, entry.name));
      }
    } catch {
    }
  }
  return files;
}
function buildCodexArgs(userArgs) {
  const joined = userArgs.join(" ");
  const hasWsOverride = joined.includes("responses_websockets") || joined.includes("responses_websockets_v2");
  if (hasWsOverride) return userArgs;
  return [
    "--disable",
    "responses_websockets",
    "--disable",
    "responses_websockets_v2",
    ...userArgs
  ];
}
async function readAppendedChunk(filePath, offset) {
  const stat = await fs8.stat(filePath);
  const size = stat.size;
  const safeOffset = offset > size ? 0 : offset;
  const length = size - safeOffset;
  if (length <= 0) return { nextOffset: size, chunk: "" };
  const handle = await fs8.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, safeOffset);
    return { nextOffset: size, chunk: buffer.toString("utf8") };
  } finally {
    await handle.close();
  }
}
async function runCodexWrapper(args, options = {}) {
  const userArgs = args.length > 0 ? args : [];
  const codexArgs = buildCodexArgs(userArgs);
  const wrapperStartedAt = Date.now();
  const debugEvents = Boolean(options.debugEvents);
  const debug = (line) => {
    if (!debugEvents) return;
    console.error(`[codex2voice debug] ${line}`);
  };
  const trackedFiles = /* @__PURE__ */ new Map();
  const spokenKeys = /* @__PURE__ */ new Set();
  const seedTrackedFiles = async () => {
    const files = await listSessionFilesFast();
    await Promise.all(
      files.map(async (filePath) => {
        if (trackedFiles.has(filePath)) return;
        try {
          const stat = await fs8.stat(filePath);
          const recentMs = Math.max(stat.birthtimeMs || 0, stat.mtimeMs || 0);
          const shouldReplayFromStart = recentMs >= wrapperStartedAt - 5e3;
          trackedFiles.set(filePath, { offset: shouldReplayFromStart ? 0 : stat.size });
          debug(`tracking file: ${filePath} from offset=${shouldReplayFromStart ? 0 : stat.size}`);
        } catch {
        }
      })
    );
  };
  let speechQueue = Promise.resolve();
  const enqueueSpeech = (message, key) => {
    if (spokenKeys.has(key)) return;
    spokenKeys.add(key);
    speechQueue = speechQueue.then(async () => {
      debug(`enqueue speech: ${message.slice(0, 120)}`);
      await setLastText(message);
      await speakTextIfEligible(message, false);
    }).catch((error) => {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`codex2voice warning: ${msg}`);
    });
  };
  let lastDiscoveryAt = 0;
  const discoverIfNeeded = async () => {
    const now = Date.now();
    if (now - lastDiscoveryAt < DISCOVERY_INTERVAL_MS) return;
    lastDiscoveryAt = now;
    await seedTrackedFiles();
  };
  const pollSession = async () => {
    await discoverIfNeeded();
    for (const [filePath, state] of trackedFiles) {
      let nextOffset = state.offset;
      let chunk = "";
      try {
        const result = await readAppendedChunk(filePath, state.offset);
        nextOffset = result.nextOffset;
        chunk = result.chunk;
      } catch {
        continue;
      }
      trackedFiles.set(filePath, { offset: nextOffset });
      if (!chunk) continue;
      const { candidates, traces } = parseSpeechCandidatesDetailed(chunk, { debug: debugEvents });
      for (const trace of traces) {
        debug(`${path6.basename(filePath)}: ${trace}`);
      }
      for (let i = 0; i < candidates.length; i += 1) {
        const message = candidates[i] ?? "";
        if (!message) continue;
        const key = `${filePath}:${state.offset}:${i}:${message}`;
        enqueueSpeech(message, key);
      }
    }
  };
  await seedTrackedFiles();
  const child = spawn2("codex", codexArgs, {
    stdio: "inherit",
    env: process.env
  });
  let polling = false;
  const timer = setInterval(() => {
    if (polling) return;
    polling = true;
    void pollSession().finally(() => {
      polling = false;
    });
  }, POLL_INTERVAL_MS);
  const exitCode = await new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
  });
  clearInterval(timer);
  await pollSession();
  await speechQueue;
  process.exitCode = exitCode;
}

// src/commands/ingest.ts
async function runIngestFromStdin(force = false) {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) {
    console.log("No input text provided on stdin.");
    return;
  }
  await setLastText(text);
  const result = await speakTextIfEligible(text, force);
  console.log(result.spoken ? `Spoken (${result.reason}).` : `Skipped (${result.reason}).`);
}

// package.json
var package_default = {
  name: "codex2voice",
  version: "0.1.2",
  description: "ElevenLabs voice companion CLI for Codex",
  repository: {
    type: "git",
    url: "git+https://github.com/goyo-lp/codex2voice.git"
  },
  bugs: {
    url: "https://github.com/goyo-lp/codex2voice/issues"
  },
  homepage: "https://github.com/goyo-lp/codex2voice#readme",
  type: "module",
  bin: {
    codex2voice: "dist/cli.js"
  },
  files: [
    "dist"
  ],
  scripts: {
    build: "tsup src/cli.ts --format esm --dts --clean --external keytar",
    prepack: "npm run build",
    dev: "tsx src/cli.ts",
    test: "vitest run",
    check: "tsc --noEmit"
  },
  keywords: [
    "codex",
    "voice",
    "elevenlabs",
    "cli"
  ],
  author: "Goyo Lozano",
  license: "ISC",
  engines: {
    node: ">=20"
  },
  os: [
    "darwin"
  ],
  publishConfig: {
    access: "public"
  },
  dependencies: {
    commander: "^14.0.3",
    execa: "^9.6.1",
    inquirer: "^13.3.0",
    pino: "^10.3.1",
    zod: "^4.3.6"
  },
  devDependencies: {
    "@types/node": "^25.3.2",
    tsup: "^8.5.1",
    tsx: "^4.21.0",
    typescript: "^5.9.3",
    vitest: "^4.0.18"
  }
};

// src/cli.ts
var program = new Command();
program.name("codex2voice").description("ElevenLabs voice companion for Codex CLI").version(package_default.version);
program.command("init").description("Run guided setup").action(runInit);
program.command("on").description("Enable voice").action(setVoiceOn);
program.command("off").description("Disable voice").action(setVoiceOff);
program.command("status").description("Show current status").action(showStatus);
program.command("doctor").description("Run diagnostic checks").action(runDoctor);
program.command("speak [text...]").description("Speak provided text or cached last response").action(async (text) => runSpeak(text?.join(" ")));
program.command("stop").description("Stop current playback").action(runStop);
program.command("uninstall").description("Remove codex2voice local config").action(runUninstall);
program.command("codex [args...]").allowUnknownOption(true).option("--debug-events", "Print event parsing traces for diagnostics").description("Run codex and auto-speak response if enabled").action(
  async (args, opts) => runCodexWrapper(args ?? [], { debugEvents: Boolean(opts.debugEvents) })
);
program.command("ingest").option("--force", "Speak even when voice is off").description("Read stdin text, cache it, and optionally speak").action(async (opts) => runIngestFromStdin(Boolean(opts.force)));
program.parseAsync(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`codex2voice error: ${message}`);
  process.exitCode = 1;
});
