import { describe, it, expect, vi } from 'vitest';

// The service imports the Supabase client at module scope, which needs env vars
// this test has no business owning. Only applyOptionAttributeFilter is under
// test and it never touches the client — it decorates a query builder it is
// handed — so the module is stubbed out.
vi.mock('../config/supabaseClient.js', () => ({ default: {} }));

const { applyOptionAttributeFilter } = await import('../services/gamesService.js');

/** Records what the service asks of a query builder, without a database. */
function spyQuery() {
  const calls = [];
  const q = {
    calls,
    eq: (...a) => (calls.push(['eq', ...a]), q),
    contains: (...a) => (calls.push(['contains', ...a]), q),
    ilike: (...a) => (calls.push(['ilike', ...a]), q),
  };
  return q;
}

const patternFor = (command) =>
  applyOptionAttributeFilter(spyQuery(), { command }).calls.find((c) => c[0] === 'ilike')?.[2];

describe('applyOptionAttributeFilter — command passthrough', () => {
  // The regression this file exists for. Rev 15 renamed the two highest-reach
  // commands in the catalogue to forms containing `%`. The filter used to strip
  // `% , ( )` from the value, which turned a search matching 2,108 games into
  // one matching none. Anything that mangles the command before it reaches
  // `.ilike()` breaks these.
  it('preserves the % in the renamed wrapper commands', () => {
    expect(patternFor('gamemoderun %command%')).toBe('%gamemoderun %command%%');
    expect(patternFor('mangohud %command%')).toBe('%mangohud %command%%');
  });

  it('preserves a comma, which the old strip also broke', () => {
    // WINEDLLOVERRIDES=xaudio2_7=n,b is a real published command on 2 games.
    expect(patternFor('xaudio2_7=n,b')).toBe('%xaudio2_7=n,b%');
  });

  it('preserves ordinary flags unchanged', () => {
    expect(patternFor('-novid')).toBe('%-novid%');
    expect(patternFor('PROTON_NO_ESYNC=1')).toBe('%PROTON_NO_ESYNC=1%');
    expect(patternFor('+set r_customwidth')).toBe('%+set r_customwidth%');
  });

  it('passes punctuation through rather than stripping it', () => {
    // Safe because supabase-js quotes the value: verified against the live
    // database, these return zero rows rather than an error.
    expect(patternFor('a)b(c')).toBe('%a)b(c%');
    expect(patternFor("quote'd")).toBe("%quote'd%");
  });
});

describe('applyOptionAttributeFilter — the other filters', () => {
  it('filters risk on the published view, never the base table', () => {
    const q = applyOptionAttributeFilter(spyQuery(), { risk: 'safe' });
    expect(q.calls).toEqual([
      ['eq', 'game_launch_options.public_launch_options.risk_level', 'safe'],
    ]);
  });

  it('matches a category against the text[] column', () => {
    const q = applyOptionAttributeFilter(spyQuery(), { category: 'Performance' });
    expect(q.calls).toEqual([
      ['contains', 'game_launch_options.public_launch_options.categories', ['Performance']],
    ]);
  });

  it('targets the view for command search too', () => {
    const q = applyOptionAttributeFilter(spyQuery(), { command: '-novid' });
    expect(q.calls[0][1]).toBe('game_launch_options.public_launch_options.command');
  });

  it('applies every filter given, and none that is not', () => {
    const all = applyOptionAttributeFilter(spyQuery(), {
      category: 'Display', risk: 'safe', command: '-novid',
    });
    expect(all.calls.map((c) => c[0])).toEqual(['eq', 'contains', 'ilike']);

    expect(applyOptionAttributeFilter(spyQuery(), {}).calls).toEqual([]);
    expect(applyOptionAttributeFilter(spyQuery()).calls).toEqual([]);
    expect(applyOptionAttributeFilter(spyQuery(), {
      category: '', risk: '', command: '',
    }).calls).toEqual([]);
  });
});
