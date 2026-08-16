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

  it('handles Proton environment variables, which need the same wrapping', () => {
    expect(pasteableCommand({ usage_example: 'PROTON_NO_ESYNC=1 %command%' }, 'PROTON_NO_ESYNC=1'))
      .toBe('PROTON_NO_ESYNC=1 %command%');
    expect(pasteableCommand({ usage_example: 'PROTON_LOG=1 %command%' }, 'PROTON_LOG=1'))
      .toBe('PROTON_LOG=1 %command%');
  });

  /**
   * The dictionary documents one example per variable NAME, but rows exist per
   * variable VALUE. Substituting on the %command% wrap alone offered the flag
   * that enables esync from the row for disabling it — the same class of error
   * as the illustrative examples below, arriving through a different door.
   */
  it('refuses an example that documents a different value', () => {
    expect(pasteableCommand({ usage_example: 'PROTON_NO_ESYNC=1 %command%' }, 'PROTON_NO_ESYNC=0'))
      .toBe('PROTON_NO_ESYNC=0');
    expect(pasteableCommand({ usage_example: 'PROTON_NO_ESYNC=1 %command%' }, 'PROTON_NO_ESYNC=2'))
      .toBe('PROTON_NO_ESYNC=2');
    expect(pasteableCommand({ usage_example: 'PROTON_USE_D9VK=1 %command%' }, 'PROTON_USE_D9VK=true'))
      .toBe('PROTON_USE_D9VK=true');
    // Stored command is malformed; the clean example is not a licence to
    // silently swap it for a different string
    expect(pasteableCommand(
      { usage_example: 'PROTON_FORCE_LARGE_ADDRESS_AWARE=1 %command%' },
      'PROTON_FORCE_LARGE_ADDRESS_AWARE=1configuration'
    )).toBe('PROTON_FORCE_LARGE_ADDRESS_AWARE=1configuration');
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
