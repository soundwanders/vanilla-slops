import { describe, it, expect } from 'vitest';
import { pasteableCommand } from '../js/ui/table-shared.js';

/**
 * Steam substitutes `%command%` with the game's executable, so a wrapper tool
 * has to wrap it: `gamemoderun %command%`. Those two options are stored as bare
 * tool names (`gamemode`, `mangohud`) that do nothing when pasted on their own,
 * and between them they carry ~4,000 game-option links — a quarter of the
 * catalogue was offering an inert string as the copyable thing.
 *
 * The rule has to stay narrow. Most usage examples are illustrative, not
 * literal, so copying the example wholesale would hand the user a different
 * setting than the one they clicked — that is what the second block pins down.
 */
describe('pasteableCommand', () => {
  it('substitutes the working form when the example wraps %command%', () => {
    expect(pasteableCommand({ usage_example: 'gamemoderun %command%' }, 'gamemode'))
      .toBe('gamemoderun %command%');
    expect(pasteableCommand({ usage_example: 'mangohud %command%' }, 'mangohud'))
      .toBe('mangohud %command%');
  });

  it('keys on %command%, not on a list of tool names', () => {
    // A wrapper documented later needs no code change
    expect(pasteableCommand({ usage_example: 'strangle 60 %command%' }, 'strangle'))
      .toBe('strangle 60 %command%');
  });

  it('leaves an illustrative example alone', () => {
    // -w 640's example documents a different resolution; copying it would
    // silently change what the user picked
    expect(pasteableCommand({ usage_example: '-w 1920 -h 1080' }, '-w 640')).toBe('-w 640');
    expect(pasteableCommand({ usage_example: '-windowed -ResX=1920 -ResY=1080' }, '-ResX=3440'))
      .toBe('-ResX=3440');
    expect(pasteableCommand({ usage_example: '-threads 4' }, '-threads')).toBe('-threads');
  });

  it('falls back to the command when there is no example', () => {
    expect(pasteableCommand({}, '-novid')).toBe('-novid');
    expect(pasteableCommand({ usage_example: null }, '-novid')).toBe('-novid');
    expect(pasteableCommand({ usage_example: '' }, '-novid')).toBe('-novid');
  });
});
