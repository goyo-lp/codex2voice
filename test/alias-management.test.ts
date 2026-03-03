import { describe, expect, it } from 'vitest';
import { upsertWrapperAliases } from '../src/commands/init.js';
import { removeWrapperAliases } from '../src/commands/uninstall.js';

describe('alias management', () => {
  it('adds codex and codex-voice aliases when absent', () => {
    const input = 'export PATH="/opt/homebrew/bin:$PATH"\n';
    const { nextContent, changed } = upsertWrapperAliases(input);

    expect(changed).toBe(true);
    expect(nextContent).toContain("alias codex='codex2voice codex --'");
    expect(nextContent).toContain("alias codex-voice='codex2voice codex --'");
  });

  it('migrates old opt-in marker block to codex alias', () => {
    const input = [
      'export PATH="/opt/homebrew/bin:$PATH"',
      '',
      '# codex2voice wrapper (kept as opt-in command)',
      "alias codex-voice='codex2voice codex --'",
      ''
    ].join('\n');

    const { nextContent, changed } = upsertWrapperAliases(input);
    expect(changed).toBe(true);
    expect(nextContent).toContain("alias codex='codex2voice codex --'");
    expect(nextContent).toContain("alias codex-voice='codex2voice codex --'");
  });

  it('keeps file unchanged when codex alias already exists', () => {
    const input = [
      'export PATH="/opt/homebrew/bin:$PATH"',
      '',
      '# codex2voice wrapper',
      "alias codex='codex2voice codex --'",
      "alias codex-voice='codex2voice codex --'",
      ''
    ].join('\n');

    const { nextContent, changed } = upsertWrapperAliases(input);
    expect(changed).toBe(false);
    expect(nextContent).toBe(input);
  });

  it('removes managed aliases and marker during uninstall', () => {
    const input = [
      'export PATH="/opt/homebrew/bin:$PATH"',
      '',
      '# codex2voice wrapper',
      "alias codex='codex2voice codex --'",
      "alias codex-voice='codex2voice codex --'",
      '',
      'alias ll="ls -la"',
      ''
    ].join('\n');

    const cleaned = removeWrapperAliases(input);
    expect(cleaned).not.toContain('# codex2voice wrapper');
    expect(cleaned).not.toContain("alias codex='codex2voice codex --'");
    expect(cleaned).not.toContain("alias codex-voice='codex2voice codex --'");
    expect(cleaned).toContain('alias ll="ls -la"');
  });
});
