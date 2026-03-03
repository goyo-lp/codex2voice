#!/usr/bin/env node

// src/cli.ts
import { Command } from "commander";

// src/commands/init.ts
import fs5 from "fs/promises";
import os3 from "os";
import path4 from "path";
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
import fs4 from "fs/promises";
import os2 from "os";
import path3 from "path";
var SERVICE = "codex2voice";
var ACCOUNT = "elevenlabs_api_key";
var CODEX_HOME = process.env.CODEX2VOICE_HOME ?? path3.join(os2.homedir(), ".codex");
var SECRET_FILE = path3.join(CODEX_HOME, "voice-secret.json");
var keytarPromise = null;
async function getKeytar() {
  if (!keytarPromise) {
    keytarPromise = Function("moduleName", "return import(moduleName)")("keytar").then((mod) => mod.default).catch(() => null);
  }
  return keytarPromise;
}
async function setApiKeyToFile(key) {
  try {
    await fs4.mkdir(CODEX_HOME, { recursive: true });
    await fs4.writeFile(
      SECRET_FILE,
      JSON.stringify({ [ACCOUNT]: key }, null, 2),
      { encoding: "utf8", mode: 384 }
    );
    await fs4.chmod(SECRET_FILE, 384);
    return true;
  } catch {
    return false;
  }
}
async function getApiKeyFromFile() {
  try {
    const raw = await fs4.readFile(SECRET_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const value = parsed[ACCOUNT];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}
async function deleteApiKeyFromFile() {
  try {
    await fs4.rm(SECRET_FILE, { force: true });
  } catch {
  }
}
async function setApiKey(key) {
  try {
    const keytar = await getKeytar();
    if (keytar) {
      await keytar.setPassword(SERVICE, ACCOUNT, key);
      return "keychain";
    }
  } catch {
  }
  return await setApiKeyToFile(key) ? "file" : "none";
}
async function getApiKey() {
  try {
    const keytar = await getKeytar();
    if (keytar) {
      const fromKeychain = await keytar.getPassword(SERVICE, ACCOUNT);
      if (fromKeychain) return fromKeychain;
    }
  } catch {
  }
  const fromFile = await getApiKeyFromFile();
  if (fromFile) return fromFile;
  return process.env.ELEVENLABS_API_KEY ?? null;
}
async function deleteApiKey() {
  try {
    const keytar = await getKeytar();
    if (keytar) {
      await keytar.deletePassword(SERVICE, ACCOUNT);
    }
  } catch {
  }
  await deleteApiKeyFromFile();
}

// src/commands/init.ts
var WRAPPER_MARKER = "# codex2voice wrapper";
var CODEX_ALIAS_LINE = "alias codex='codex2voice codex --'";
var OPT_IN_ALIAS_LINE = "alias codex-voice='codex2voice codex --'";
function resolveInitApiKeyDecision(existingApiKey, answers) {
  const hasExisting = Boolean(existingApiKey && existingApiKey.trim());
  const wantsReplace = Boolean(answers.replaceApiKey);
  const provided = String(answers.apiKey ?? "").trim();
  if (hasExisting && !wantsReplace) {
    return { action: "retain" };
  }
  if (provided) {
    return { action: "persist", apiKey: provided };
  }
  if (hasExisting) {
    return { action: "retain" };
  }
  throw new Error("Missing ElevenLabs API key.");
}
function upsertWrapperAliases(content) {
  if (content.includes(CODEX_ALIAS_LINE)) {
    return { nextContent: content, changed: false };
  }
  const cleaned = content.replace(/\n# codex2voice wrapper[^\n]*\n?/g, "\n").replace(/\nalias codex-voice='codex2voice codex --'\n?/g, "\n").replace(/\nalias codex='codex2voice codex --'\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  const block = `

${WRAPPER_MARKER}
${CODEX_ALIAS_LINE}
${OPT_IN_ALIAS_LINE}
`;
  return { nextContent: `${cleaned}${block}`, changed: true };
}
async function appendAliasIfMissing() {
  const zshrc = path4.join(os3.homedir(), ".zshrc");
  try {
    let content = "";
    try {
      content = await fs5.readFile(zshrc, "utf8");
    } catch {
      content = "";
    }
    const { nextContent, changed } = upsertWrapperAliases(content);
    if (!changed) {
      return "exists";
    }
    await fs5.writeFile(zshrc, nextContent, "utf8");
    return "added";
  } catch {
    return "failed";
  }
}
async function runInit() {
  const current = await readConfig();
  const existingApiKey = await getApiKey();
  const hasExistingApiKey = Boolean(existingApiKey && existingApiKey.trim());
  const answers = await inquirer.prompt([
    {
      type: "confirm",
      name: "replaceApiKey",
      message: "An ElevenLabs API key is already saved. Replace it?",
      default: false,
      when: () => hasExistingApiKey
    },
    {
      type: "password",
      name: "apiKey",
      message: hasExistingApiKey ? "Enter your new ElevenLabs API key:" : "Enter your ElevenLabs API key:",
      mask: "*",
      when: (input) => !hasExistingApiKey || Boolean(input.replaceApiKey),
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
      default: current.enabled
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
  const apiKeyDecision = resolveInitApiKeyDecision(existingApiKey, {
    replaceApiKey: answers.replaceApiKey,
    apiKey: answers.apiKey
  });
  let keySaveMode = "retained";
  if (apiKeyDecision.action === "persist") {
    keySaveMode = await setApiKey(apiKeyDecision.apiKey);
  }
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
  if (keySaveMode === "keychain") {
    console.log("API key stored in macOS Keychain.");
  } else if (keySaveMode === "file") {
    console.log("API key stored in local codex2voice secret file (~/.codex/voice-secret.json).");
  } else if (keySaveMode === "retained") {
    console.log("API key unchanged. Using previously persisted key.");
  } else {
    console.log("Could not persist API key. Set ELEVENLABS_API_KEY in your shell env.");
  }
  if (aliasStatus === "added") console.log("Configured codex wrapper aliases in ~/.zshrc. Open a new shell session or run `source ~/.zshrc`.");
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
  const apiKey = await getApiKey();
  console.log("codex2voice status");
  console.log(`enabled: ${config.enabled}`);
  console.log(`autoSpeak: ${config.autoSpeak}`);
  console.log(`voiceId: ${config.voiceId || "(not set)"}`);
  console.log(`apiKey: ${apiKey ? "configured" : "(not set)"}`);
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
import fs6 from "fs/promises";
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
    const raw = await fs6.readFile(PATHS.cache, "utf8");
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
import fs7 from "fs/promises";
import path5 from "path";
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
    const raw = await fs7.readFile(PATHS.playback, "utf8");
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
    await fs7.rm(state.filePath, { force: true });
    await fs7.rm(PATHS.playback, { force: true });
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
  await fs7.rm(state.filePath, { force: true });
  await fs7.rm(PATHS.playback, { force: true });
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
  const filePath = path5.join(PATHS.tempAudioDir, `${randomUUID2()}.mp3`);
  await fs7.writeFile(filePath, buffer);
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
import fs8 from "fs/promises";
import os4 from "os";
import path6 from "path";
import inquirer2 from "inquirer";
function removeWrapperAliases(content) {
  return content.replace(/\n# codex2voice wrapper[^\n]*\n?/g, "\n").replace(/\nalias codex='codex2voice codex --'\n?/g, "\n").replace(/\nalias codex-voice='codex2voice codex --'\n?/g, "\n").replace(/\n{3,}/g, "\n\n");
}
async function removeAliasBlock() {
  const zshrc = path6.join(os4.homedir(), ".zshrc");
  try {
    const content = await fs8.readFile(zshrc, "utf8");
    const cleaned = removeWrapperAliases(content);
    await fs8.writeFile(zshrc, cleaned, "utf8");
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
  await fs8.rm(PATHS.config, { force: true });
  await fs8.rm(PATHS.cache, { force: true });
  await fs8.rm(PATHS.playback, { force: true });
  await fs8.rm(PATHS.tempAudioDir, { recursive: true, force: true });
  await deleteApiKey();
  await removeAliasBlock();
  console.log("codex2voice local state removed.");
}

// src/commands/codex.ts
import fs9 from "fs/promises";
import path7 from "path";
import os5 from "os";
import { spawn as spawn2 } from "child_process";

// src/commands/codex-events.ts
function extractFinalAnswerFromResponseItem(payload) {
  if (!payload) return "";
  if (payload.type !== "message") return "";
  if (payload.role !== "assistant") return "";
  if (payload.phase !== "final_answer") return "";
  return (payload.content ?? []).filter((item) => item.type === "output_text" && typeof item.text === "string").map((item) => item.text?.trim() ?? "").filter(Boolean).join("\n").trim();
}
function normalizeUserMessageForControl(message) {
  return message.trim().toLowerCase().replace(/[^a-z0-9/\s]+/g, " ").replace(/\s+/g, " ");
}
function parseManualVoiceSignalFromUserMessage(message) {
  const normalized = normalizeUserMessageForControl(message);
  if (!normalized) return null;
  if (/^\/voice\s+(?:on|enable|enabled|unmute)\b/.test(normalized)) return "manual_voice_on";
  if (/^\/voice\s+(?:off|disable|disabled|mute)\b/.test(normalized)) return "manual_voice_off";
  if (/^\/voice\s+(?:default|auto|clear|reset)\b/.test(normalized)) return "manual_voice_default";
  if (/\bvoice\s+on\b/.test(normalized) || /\bturn\s+(?:the\s+)?voice\s+on\b/.test(normalized) || /\benable\s+voice\b/.test(normalized) || /\bunmute\s+voice\b/.test(normalized) || /\bstart\s+speaking\b/.test(normalized)) {
    return "manual_voice_on";
  }
  if (/\bvoice\s+off\b/.test(normalized) || /\bturn\s+(?:the\s+)?voice\s+off\b/.test(normalized) || /\bdisable\s+voice\b/.test(normalized) || /\bmute\s+voice\b/.test(normalized) || /\bstop\s+speaking\b/.test(normalized)) {
    return "manual_voice_off";
  }
  if (/\bvoice\s+(?:default|auto)\b/.test(normalized) || /\breset\s+voice\b/.test(normalized) || /\bclear\s+voice\s+(?:override|mode)\b/.test(normalized)) {
    return "manual_voice_default";
  }
  return null;
}
function parseControlSignalFromModeLabel(value) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "plan") return "plan_enter";
  if (normalized === "default") return "plan_exit";
  return null;
}
function parseControlSignalFromUserMessage(message) {
  const normalized = message.trim().toLowerCase();
  if (/^\/plan(?:\s|$)/.test(normalized)) return "plan_enter";
  if (/^\/default(?:\s|$)/.test(normalized)) return "plan_exit";
  const manualSignal = parseManualVoiceSignalFromUserMessage(message);
  if (manualSignal) return manualSignal;
  return null;
}
function parseSessionActionsDetailed(jsonlChunk, options = {}) {
  const actions = [];
  const traces = [];
  const debug = Boolean(options.debug);
  let lastAccepted = null;
  const pushCandidate = (message, line, source) => {
    if (lastAccepted && lastAccepted.message === message && line - lastAccepted.line <= 5) {
      if (debug) traces.push(`line ${line}: dedupe ${source}`);
      return;
    }
    actions.push({ kind: "candidate", message, line, source });
    lastAccepted = { message, line };
    if (debug) traces.push(`line ${line}: accept ${source}`);
  };
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
    if (event.type === "event_msg" && event.payload?.type === "task_started") {
      const signal = parseControlSignalFromModeLabel(event.payload.collaboration_mode_kind ?? "");
      if (signal) {
        actions.push({
          kind: "control",
          signal,
          line: index + 1,
          source: "event_msg.task_started.collaboration_mode_kind"
        });
        if (debug) traces.push(`line ${index + 1}: control ${signal}`);
      } else if (debug) {
        traces.push(`line ${index + 1}: skip task_started mode`);
      }
      continue;
    }
    if (event.type === "turn_context") {
      const signal = parseControlSignalFromModeLabel(event.payload?.collaboration_mode?.mode ?? "");
      if (signal) {
        actions.push({
          kind: "control",
          signal,
          line: index + 1,
          source: "turn_context.collaboration_mode.mode"
        });
        if (debug) traces.push(`line ${index + 1}: control ${signal}`);
      } else if (debug) {
        traces.push(`line ${index + 1}: skip turn_context mode`);
      }
      continue;
    }
    if (event.type === "event_msg" && event.payload?.type === "user_message") {
      const userMessage = (event.payload.message ?? "").trim();
      const signal = parseControlSignalFromUserMessage(userMessage);
      if (signal) {
        actions.push({
          kind: "control",
          signal,
          line: index + 1,
          source: "event_msg.user_message.command"
        });
        if (debug) traces.push(`line ${index + 1}: control ${signal}`);
      } else if (debug) {
        traces.push(`line ${index + 1}: skip user_message`);
      }
      continue;
    }
    if (event.type === "event_msg" && event.payload?.type === "agent_message" && event.payload?.phase === "final_answer") {
      const msg = (event.payload.message ?? event.payload.last_agent_message ?? "").trim();
      if (msg) {
        pushCandidate(msg, index + 1, "event_msg.agent_message.final_answer");
      } else if (debug) {
        traces.push(`line ${index + 1}: reject empty event_msg.agent_message.final_answer`);
      }
      continue;
    }
    if (event.type === "event_msg" && event.payload?.type === "task_complete") {
      const msg = event.payload.last_agent_message?.trim();
      if (msg) {
        pushCandidate(msg, index + 1, "event_msg.task_complete.last_agent_message");
      } else if (debug) {
        traces.push(`line ${index + 1}: reject empty event_msg.task_complete`);
      }
      continue;
    }
    if (event.type === "response_item") {
      const msg = extractFinalAnswerFromResponseItem(event.payload);
      if (msg) {
        pushCandidate(msg, index + 1, "response_item.message.final_answer");
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

// src/commands/codex.ts
var SESSIONS_DIR = path7.join(os5.homedir(), ".codex", "sessions");
var MIN_POLL_INTERVAL_MS = 140;
var MAX_POLL_INTERVAL_MS = 1100;
var IDLE_POLL_BACKOFF_STEP_MS = 120;
var DISCOVERY_INTERVAL_MS = 900;
var DISCOVERY_INTERVAL_LOCKED_MS = 3e3;
var ACTIVE_FILE_SWEEP_INTERVAL_MS = 2800;
var ACTIVE_FILE_STALE_MS = 6e3;
var DUPLICATE_SPEECH_WINDOW_MS = 8e3;
var MAX_APPENDED_READ_BYTES = 512 * 1024;
var DAY_MS = 24 * 60 * 60 * 1e3;
var REPLAY_WINDOW_MS = 5e3;
var WS_DISABLE_FLAGS = ["responses_websockets", "responses_websockets_v2"];
var SESSION_CONTROL_DIR = path7.join(os5.tmpdir(), "codex2voice-session-control");
var SESSION_CONTROL_ENV = "CODEX2VOICE_SESSION_CONTROL_FILE";
function shouldReplayFromStart(stat, wrapperStartedAt) {
  if (!Number.isFinite(stat.birthtimeMs) || stat.birthtimeMs <= 0) return false;
  return stat.birthtimeMs >= wrapperStartedAt - REPLAY_WINDOW_MS;
}
function normalizeSpeechKey(message) {
  return message.trim().replace(/\s+/g, " ").toLowerCase();
}
function getSessionDayDir(date) {
  const yyyy = date.getFullYear().toString();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return path7.join(SESSIONS_DIR, yyyy, mm, dd);
}
async function listSessionFilesFast() {
  const today = getSessionDayDir(/* @__PURE__ */ new Date());
  const yesterday = getSessionDayDir(new Date(Date.now() - DAY_MS));
  const dirs = today === yesterday ? [today] : [today, yesterday];
  const files = [];
  for (const dir of dirs) {
    try {
      const entries = await fs9.readdir(dir, { withFileTypes: true });
      await Promise.all(
        entries.map(async (entry) => {
          if (!entry.isFile()) return;
          if (!entry.name.endsWith(".jsonl")) return;
          const filePath = path7.join(dir, entry.name);
          try {
            const stat = await fs9.stat(filePath);
            files.push({
              filePath,
              size: stat.size,
              birthtimeMs: stat.birthtimeMs,
              mtimeMs: stat.mtimeMs
            });
          } catch {
          }
        })
      );
    } catch {
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files;
}
function computeNextPollInterval(previousMs, hadActivity) {
  if (hadActivity) return MIN_POLL_INTERVAL_MS;
  const previous = Number.isFinite(previousMs) ? previousMs : MIN_POLL_INTERVAL_MS;
  const stepped = previous + IDLE_POLL_BACKOFF_STEP_MS;
  return Math.min(MAX_POLL_INTERVAL_MS, Math.max(MIN_POLL_INTERVAL_MS, stepped));
}
function selectTrackedFilesForPoll(candidates, activeFilePath, includeBackgroundSweep) {
  if (activeFilePath && candidates.some((candidate) => candidate.filePath === activeFilePath)) {
    if (!includeBackgroundSweep) return [activeFilePath];
    return [
      activeFilePath,
      ...candidates.filter((candidate) => candidate.filePath !== activeFilePath).map((candidate) => candidate.filePath)
    ];
  }
  const fresh = candidates.filter((candidate) => candidate.isFresh).map((candidate) => candidate.filePath);
  if (fresh.length > 0) return fresh;
  return candidates.map((candidate) => candidate.filePath);
}
function hasWsFeatureToken(token) {
  return token.split(",").map((part) => part.trim()).some((part) => WS_DISABLE_FLAGS.includes(part));
}
function hasWebSocketFeatureOverride(userArgs) {
  for (let i = 0; i < userArgs.length; i += 1) {
    const token = userArgs[i] ?? "";
    if (token === "--enable" || token === "--disable") {
      const next = userArgs[i + 1] ?? "";
      if (hasWsFeatureToken(next)) return true;
      i += 1;
      continue;
    }
    if (token.startsWith("--enable=")) {
      if (hasWsFeatureToken(token.slice("--enable=".length))) return true;
      continue;
    }
    if (token.startsWith("--disable=")) {
      if (hasWsFeatureToken(token.slice("--disable=".length))) return true;
      continue;
    }
  }
  return false;
}
function buildCodexArgs(userArgs) {
  if (hasWebSocketFeatureOverride(userArgs)) return userArgs;
  return [
    "--disable",
    "responses_websockets",
    "--disable",
    "responses_websockets_v2",
    ...userArgs
  ];
}
async function readAppendedChunk(filePath, offset) {
  const stat = await fs9.stat(filePath);
  const size = stat.size;
  const didResetOffset = offset > size;
  const safeOffset = didResetOffset ? 0 : offset;
  const length = size - safeOffset;
  if (length <= 0) return { nextOffset: size, chunk: "", didResetOffset };
  const bytesToRead = Math.min(length, MAX_APPENDED_READ_BYTES);
  const handle = await fs9.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(bytesToRead);
    await handle.read(buffer, 0, bytesToRead, safeOffset);
    return {
      nextOffset: safeOffset + bytesToRead,
      chunk: buffer.toString("utf8"),
      didResetOffset
    };
  } finally {
    await handle.close();
  }
}
function splitCompleteJsonlChunk(text) {
  if (!text) return { completeChunk: "", trailingPartial: "" };
  const lastNewline = text.lastIndexOf("\n");
  if (lastNewline < 0) {
    return { completeChunk: "", trailingPartial: text };
  }
  return {
    completeChunk: text.slice(0, lastNewline + 1),
    trailingPartial: text.slice(lastNewline + 1)
  };
}
function normalizeManualVoiceValue(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "on") return "on";
  if (normalized === "off") return "off";
  if (normalized === "default" || normalized === "clear" || normalized === "auto") return "default";
  return null;
}
function createSessionVoiceState() {
  return {
    planMode: false,
    manualVoiceOverride: null
  };
}
function isSessionVoiceEnabledForState(state) {
  if (state.manualVoiceOverride === "on") return true;
  if (state.manualVoiceOverride === "off") return false;
  return state.planMode;
}
function reduceSessionVoiceState(state, signal) {
  switch (signal) {
    case "plan_enter":
      return { ...state, planMode: true };
    case "plan_exit":
      return { ...state, planMode: false };
    case "manual_voice_on":
      return { ...state, manualVoiceOverride: "on" };
    case "manual_voice_off":
      return { ...state, manualVoiceOverride: "off" };
    case "manual_voice_default":
      return { ...state, manualVoiceOverride: null };
    default:
      return state;
  }
}
function createPollMetrics(now) {
  return {
    sinceMs: now,
    tickCount: 0,
    activeTickCount: 0,
    filesPolled: 0,
    chunkReads: 0,
    candidateCount: 0,
    sweepCount: 0,
    intervalChangeCount: 0,
    lockAcquireCount: 0,
    lockSwitchCount: 0,
    lockClearCount: 0
  };
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
  const errorMessage = (error) => error instanceof Error ? error.message : String(error);
  const trackedFiles = /* @__PURE__ */ new Map();
  const recentMessages = /* @__PURE__ */ new Map();
  let activeFilePath = null;
  const sessionVoiceState = createSessionVoiceState();
  const sessionControlFile = path7.join(SESSION_CONTROL_DIR, `session-${process.pid}-${wrapperStartedAt}.json`);
  let sessionControlMtimeMs = 0;
  let lastAppliedSessionControl = null;
  const METRICS_LOG_INTERVAL_MS = 2500;
  let metrics = createPollMetrics(Date.now());
  const isSessionVoiceEnabled = () => isSessionVoiceEnabledForState(sessionVoiceState);
  const setManualVoiceOverride = (value, reason) => {
    if (sessionVoiceState.manualVoiceOverride === value) return;
    sessionVoiceState.manualVoiceOverride = value;
    debug(`manual voice override=${value ?? "default"} (${reason})`);
  };
  const setPlanMode = (enabled, reason) => {
    if (sessionVoiceState.planMode === enabled) return;
    sessionVoiceState.planMode = enabled;
    debug(`plan mode ${enabled ? "on" : "off"} (${reason})`);
  };
  const applySessionControlSignal = (signal, reason) => {
    const before = {
      planMode: sessionVoiceState.planMode,
      manualVoiceOverride: sessionVoiceState.manualVoiceOverride
    };
    const after = reduceSessionVoiceState(before, signal);
    setPlanMode(after.planMode, reason);
    setManualVoiceOverride(after.manualVoiceOverride, reason);
  };
  const writeSessionControlDefaults = async () => {
    try {
      await fs9.mkdir(SESSION_CONTROL_DIR, { recursive: true });
      await fs9.writeFile(
        sessionControlFile,
        JSON.stringify({
          manualVoice: "default",
          updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          source: "codex2voice-wrapper"
        }, null, 2),
        "utf8"
      );
      lastAppliedSessionControl = "default";
    } catch (error) {
      debug(`session control init failed: ${errorMessage(error)}`);
    }
  };
  const readSessionControlIfChanged = async () => {
    let stat;
    try {
      stat = await fs9.stat(sessionControlFile);
    } catch {
      return;
    }
    if (stat.mtimeMs <= sessionControlMtimeMs) return;
    sessionControlMtimeMs = stat.mtimeMs;
    try {
      const raw = await fs9.readFile(sessionControlFile, "utf8");
      const parsed = JSON.parse(raw);
      const normalized = normalizeManualVoiceValue(parsed.manualVoice);
      if (!normalized || normalized === lastAppliedSessionControl) return;
      lastAppliedSessionControl = normalized;
      if (normalized === "on") setManualVoiceOverride("on", "session-control-file");
      if (normalized === "off") setManualVoiceOverride("off", "session-control-file");
      if (normalized === "default") setManualVoiceOverride(null, "session-control-file");
    } catch (error) {
      debug(`session control read failed: ${errorMessage(error)}`);
    }
  };
  const clearActiveFileIfMatching = (filePath, reason) => {
    if (activeFilePath !== filePath) return;
    activeFilePath = null;
    metrics.lockClearCount += 1;
    debug(`${reason}: ${filePath}`);
  };
  const setActiveFile = (filePath, reason) => {
    if (activeFilePath && activeFilePath !== filePath) {
      metrics.lockSwitchCount += 1;
    } else if (!activeFilePath) {
      metrics.lockAcquireCount += 1;
    }
    activeFilePath = filePath;
    debug(`${reason}: ${filePath}`);
  };
  const shouldSwitchActiveFile = (candidateFilePath, now) => {
    if (activeFilePath === candidateFilePath) return false;
    const currentActive = activeFilePath ? trackedFiles.get(activeFilePath) : null;
    const activeIsStale = !currentActive || now - currentActive.lastChunkAt >= ACTIVE_FILE_STALE_MS;
    return !activeFilePath || activeIsStale;
  };
  const pruneRecentMessages = (now) => {
    for (const [key, seenAt] of recentMessages) {
      if (now - seenAt <= DUPLICATE_SPEECH_WINDOW_MS) continue;
      recentMessages.delete(key);
    }
  };
  const flushMetricsIfNeeded = (force = false, pollIntervalMs2 = MIN_POLL_INTERVAL_MS) => {
    if (!debugEvents) return;
    const now = Date.now();
    const elapsedMs = now - metrics.sinceMs;
    if (!force && elapsedMs < METRICS_LOG_INTERVAL_MS) return;
    if (!force && metrics.tickCount === 0) return;
    const durationSec = Math.max(1e-3, elapsedMs / 1e3);
    const ticksPerSec = (metrics.tickCount / durationSec).toFixed(2);
    const filesPerTick = metrics.tickCount > 0 ? (metrics.filesPolled / metrics.tickCount).toFixed(2) : "0.00";
    const chunksPerTick = metrics.tickCount > 0 ? (metrics.chunkReads / metrics.tickCount).toFixed(2) : "0.00";
    const activeLabel = activeFilePath ? path7.basename(activeFilePath) : "none";
    debug(
      [
        "metrics",
        `window=${durationSec.toFixed(1)}s`,
        `ticks=${metrics.tickCount}`,
        `tps=${ticksPerSec}`,
        `activeTicks=${metrics.activeTickCount}`,
        `intervalMs=${pollIntervalMs2}`,
        `filesPerTick=${filesPerTick}`,
        `chunksPerTick=${chunksPerTick}`,
        `candidates=${metrics.candidateCount}`,
        `sweeps=${metrics.sweepCount}`,
        `intervalChanges=${metrics.intervalChangeCount}`,
        `lock+${metrics.lockAcquireCount}/~${metrics.lockSwitchCount}/-${metrics.lockClearCount}`,
        `plan=${sessionVoiceState.planMode ? "on" : "off"}`,
        `manual=${sessionVoiceState.manualVoiceOverride ?? "default"}`,
        `voice=${isSessionVoiceEnabled() ? "on" : "off"}`,
        `active=${activeLabel}`
      ].join(" ")
    );
    metrics = createPollMetrics(now);
  };
  const seedTrackedFiles = async () => {
    const files = await listSessionFilesFast();
    const discoveredPaths = new Set(files.map((file) => file.filePath));
    let changed = false;
    for (const file of files) {
      if (trackedFiles.has(file.filePath)) continue;
      const replayFromStart = shouldReplayFromStart({ birthtimeMs: file.birthtimeMs }, wrapperStartedAt);
      trackedFiles.set(file.filePath, {
        offset: replayFromStart ? 0 : file.size,
        isFresh: replayFromStart,
        lastChunkAt: 0,
        pendingLine: ""
      });
      debug(`tracking file: ${file.filePath} from offset=${replayFromStart ? 0 : file.size}`);
      changed = true;
    }
    for (const trackedPath of Array.from(trackedFiles.keys())) {
      if (discoveredPaths.has(trackedPath)) continue;
      trackedFiles.delete(trackedPath);
      clearActiveFileIfMatching(trackedPath, "active file disappeared");
      changed = true;
    }
    return changed;
  };
  let speechQueue = Promise.resolve();
  const enqueueSpeech = (message) => {
    const now = Date.now();
    pruneRecentMessages(now);
    const messageKey = normalizeSpeechKey(message);
    const previousAt = recentMessages.get(messageKey);
    if (previousAt && now - previousAt < DUPLICATE_SPEECH_WINDOW_MS) {
      debug(`skip duplicate speech within ${DUPLICATE_SPEECH_WINDOW_MS}ms: ${message.slice(0, 120)}`);
      return;
    }
    recentMessages.set(messageKey, now);
    speechQueue = speechQueue.then(async () => {
      await setLastText(message);
      await readSessionControlIfChanged();
      const shouldSpeakNow = isSessionVoiceEnabled();
      if (!shouldSpeakNow) {
        debug(`skip speech (session voice off): ${message.slice(0, 120)}`);
        return;
      }
      debug(`enqueue speech: ${message.slice(0, 120)}`);
      await speakTextNow(message);
    }).catch((error) => {
      console.error(`codex2voice warning: ${errorMessage(error)}`);
    });
  };
  let lastDiscoveryAt = 0;
  const discoverIfNeeded = async () => {
    const now = Date.now();
    const discoveryInterval = activeFilePath ? DISCOVERY_INTERVAL_LOCKED_MS : DISCOVERY_INTERVAL_MS;
    if (now - lastDiscoveryAt < discoveryInterval) return false;
    lastDiscoveryAt = now;
    return seedTrackedFiles();
  };
  let lastBackgroundSweepAt = 0;
  const pollSession = async () => {
    metrics.tickCount += 1;
    await readSessionControlIfChanged();
    const discoveredChanges = await discoverIfNeeded();
    let hadActivity = discoveredChanges;
    const now = Date.now();
    const shouldSweepAll = Boolean(
      activeFilePath && now - lastBackgroundSweepAt >= ACTIVE_FILE_SWEEP_INTERVAL_MS
    );
    if (shouldSweepAll) {
      lastBackgroundSweepAt = now;
      metrics.sweepCount += 1;
    }
    const pollCandidates = Array.from(trackedFiles.entries()).map(([filePath, state]) => ({
      filePath,
      isFresh: state.isFresh
    }));
    const filesToPoll = selectTrackedFilesForPoll(pollCandidates, activeFilePath, shouldSweepAll);
    for (const filePath of filesToPoll) {
      const state = trackedFiles.get(filePath);
      if (!state) continue;
      metrics.filesPolled += 1;
      let nextOffset = state.offset;
      let chunk = "";
      let pendingLine = state.pendingLine;
      try {
        const result = await readAppendedChunk(filePath, state.offset);
        nextOffset = result.nextOffset;
        chunk = result.chunk;
        if (result.didResetOffset) pendingLine = "";
      } catch {
        clearActiveFileIfMatching(filePath, "active file unreadable, clearing lock");
        continue;
      }
      const framed = splitCompleteJsonlChunk(`${pendingLine}${chunk}`);
      trackedFiles.set(filePath, {
        ...state,
        offset: nextOffset,
        lastChunkAt: chunk ? now : state.lastChunkAt,
        pendingLine: framed.trailingPartial
      });
      if (!chunk) continue;
      hadActivity = true;
      metrics.chunkReads += 1;
      if (!activeFilePath && state.isFresh) {
        setActiveFile(filePath, "locked onto active file");
      }
      if (!framed.completeChunk) continue;
      const { actions, traces } = parseSessionActionsDetailed(framed.completeChunk, { debug: debugEvents });
      for (const trace of traces) {
        debug(`${path7.basename(filePath)}: ${trace}`);
      }
      const candidateCount = actions.filter((action) => action.kind === "candidate").length;
      metrics.candidateCount += candidateCount;
      for (const action of actions) {
        if (action.kind === "control") {
          await readSessionControlIfChanged();
          applySessionControlSignal(action.signal, `${path7.basename(filePath)}:${action.line}:${action.source}`);
          continue;
        }
        if (!action.message) continue;
        if (shouldSwitchActiveFile(filePath, now)) {
          setActiveFile(filePath, "switching active file based on final-answer candidate");
        }
        enqueueSpeech(action.message);
      }
    }
    if (hadActivity) metrics.activeTickCount += 1;
    return hadActivity;
  };
  await seedTrackedFiles();
  await writeSessionControlDefaults();
  const child = spawn2("codex", codexArgs, {
    stdio: "inherit",
    env: {
      ...process.env,
      [SESSION_CONTROL_ENV]: sessionControlFile
    }
  });
  let pollIntervalMs = MIN_POLL_INTERVAL_MS;
  let polling = false;
  let timer = null;
  const tick = () => {
    if (polling) return;
    polling = true;
    void pollSession().then((hadActivity) => {
      const nextInterval = computeNextPollInterval(pollIntervalMs, hadActivity);
      if (nextInterval !== pollIntervalMs) {
        metrics.intervalChangeCount += 1;
        pollIntervalMs = nextInterval;
        if (timer) clearInterval(timer);
        timer = setInterval(tick, pollIntervalMs);
      }
      flushMetricsIfNeeded(false, pollIntervalMs);
    }).catch((error) => {
      console.error(`codex2voice warning: polling failed: ${errorMessage(error)}`);
    }).finally(() => {
      polling = false;
    });
  };
  timer = setInterval(tick, pollIntervalMs);
  tick();
  const exitCode = await new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
  });
  if (timer) clearInterval(timer);
  await pollSession();
  flushMetricsIfNeeded(true, pollIntervalMs);
  await speechQueue;
  try {
    await fs9.rm(sessionControlFile, { force: true });
  } catch {
  }
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
  name: "@glozanop/codex2voice",
  version: "0.1.3",
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
    "dist",
    "scripts",
    "skills"
  ],
  scripts: {
    build: "tsup src/cli.ts --format esm --dts --clean --external keytar",
    prepack: "npm run build",
    postinstall: "node ./scripts/postinstall.mjs",
    dev: "tsx src/cli.ts",
    test: "vitest run",
    check: "tsc --noEmit",
    "local:install": "sh ./scripts/local-install.sh",
    "local:install:tarball": "sh ./scripts/local-install-tarball.sh",
    "local:install:skills": "sh ./scripts/install-skills.sh",
    "local:uninstall": "sh ./scripts/local-uninstall.sh",
    "local:reinstall": "npm run local:uninstall && npm run local:install"
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
