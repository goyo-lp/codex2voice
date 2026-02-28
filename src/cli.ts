#!/usr/bin/env node
import { Command } from 'commander';
import { runInit } from './commands/init.js';
import { setVoiceOn, setVoiceOff, showStatus } from './commands/state.js';
import { runDoctor } from './commands/doctor.js';
import { runSpeak } from './commands/speak.js';
import { runStop } from './commands/stop.js';
import { runUninstall } from './commands/uninstall.js';
import { runCodexWrapper } from './commands/codex.js';
import { runIngestFromStdin } from './commands/ingest.js';

const program = new Command();

program
  .name('codex2voice')
  .description('ElevenLabs voice companion for Codex CLI')
  .version('0.1.0');

program.command('init').description('Run guided setup').action(runInit);
program.command('on').description('Enable voice').action(setVoiceOn);
program.command('off').description('Disable voice').action(setVoiceOff);
program.command('status').description('Show current status').action(showStatus);
program.command('doctor').description('Run diagnostic checks').action(runDoctor);
program
  .command('speak [text...]')
  .description('Speak provided text or cached last response')
  .action(async (text: string[] | undefined) => runSpeak(text?.join(' ')));
program.command('stop').description('Stop current playback').action(runStop);
program.command('uninstall').description('Remove codex2voice local config').action(runUninstall);
program
  .command('codex [args...]')
  .allowUnknownOption(true)
  .option('--debug-events', 'Print event parsing traces for diagnostics')
  .description('Run codex and auto-speak response if enabled')
  .action(async (args: string[] | undefined, opts: { debugEvents?: boolean }) =>
    runCodexWrapper(args ?? [], { debugEvents: Boolean(opts.debugEvents) })
  );
program
  .command('ingest')
  .option('--force', 'Speak even when voice is off')
  .description('Read stdin text, cache it, and optionally speak')
  .action(async (opts: { force?: boolean }) => runIngestFromStdin(Boolean(opts.force)));

program.parseAsync(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`codex2voice error: ${message}`);
  process.exitCode = 1;
});
