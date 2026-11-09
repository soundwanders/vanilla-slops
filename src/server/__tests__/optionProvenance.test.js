import { describe, it, expect } from 'vitest';
import { resolveProvenance, compareGameOptions } from '../utils/optionProvenance.js';

// Max Payne 3 (app 204100), as the live database held it on 2026-09-27: the
// shared rows carry other games' text and citations, the links carry its own.
const STEREO = {
  option: {
    description: 'Enables stereo audio support',
    source: 'PCGamingWiki',
    source_url: 'https://www.pcgamingwiki.com/w/index.php?curid=299',
    last_verified_at: '2026-09-24T10:00:00+00:00',
  },
  link: {
    description: 'Force 3D stereo support [0–1] (1 is on)',
    source: 'PCGamingWiki',
    source_url: 'https://www.pcgamingwiki.com/w/index.php?curid=2846',
    last_verified_at: '2026-09-27T14:00:00+00:00',
  },
};

const NO_EVIDENCE = { description: null, source: null, source_url: null, last_verified_at: null };

describe('resolveProvenance', () => {
  it('shows the game\'s own text with its own citation and date', () => {
    expect(resolveProvenance(STEREO.link, STEREO.option)).toEqual({
      description: 'Force 3D stereo support [0–1] (1 is on)',
      source: 'PCGamingWiki',
      source_url: 'https://www.pcgamingwiki.com/w/index.php?curid=2846',
      last_verified_at: '2026-09-27T14:00:00+00:00',
      // Already the citation, so it is not repeated as extra evidence.
      game_source: null,
      game_source_url: null,
      game_verified_at: null,
    });
  });

  it('falls back to the shared row when the link carries nothing', () => {
    expect(resolveProvenance(NO_EVIDENCE, STEREO.option)).toEqual({
      ...STEREO.option,
      game_source: null,
      game_source_url: null,
      game_verified_at: null,
    });
  });

  it('keeps the shared text and citation, and adds the game\'s page as evidence', () => {
    // The link has its own page but no text of its own: the text is the shared
    // row's, so its citation must be too, and the game's page is extra.
    const link = { ...STEREO.link, description: null };
    const r = resolveProvenance(link, STEREO.option);
    expect(r.description).toBe('Enables stereo audio support');
    expect(r.source_url).toBe(STEREO.option.source_url);
    expect(r.last_verified_at).toBe(STEREO.option.last_verified_at);
    expect(r.game_source).toBe('PCGamingWiki');
    expect(r.game_source_url).toBe(STEREO.link.source_url);
    expect(r.game_verified_at).toBe(STEREO.link.last_verified_at);
  });

  it('does not repeat a game page that is already the citation', () => {
    const link = { ...NO_EVIDENCE, source: 'PCGamingWiki', source_url: STEREO.option.source_url, last_verified_at: '2026-09-27T14:00:00+00:00' };
    const r = resolveProvenance(link, STEREO.option);
    expect(r.game_source_url).toBeNull();
    expect(r.source_url).toBe(STEREO.option.source_url);
  });

  it('gives the game\'s own text even when the shared row has none', () => {
    const option = { ...STEREO.option, description: null };
    expect(resolveProvenance(STEREO.link, option).description).toBe(STEREO.link.description);
  });

  it('survives a missing link and missing fields', () => {
    const r = resolveProvenance(null, { description: 'x' });
    expect(r).toEqual({
      description: 'x', source: null, source_url: null, last_verified_at: null,
      game_source: null, game_source_url: null, game_verified_at: null,
    });
  });
});

describe('compareGameOptions', () => {
  const row = (command, source_url = null, upvotes = 0) =>
    ({ source_url, public_launch_options: { command, upvotes } });
  const order = (rows) => [...rows].sort(compareGameOptions).map((r) => r.public_launch_options.command);

  // Cyberpunk 2077 (1091500) on 2026-11-07: its own page documents
  // --launcher-skip, which came last of 21 behind engine-wide flags.
  it('puts the options the game\'s own page lists first', () => {
    expect(order([
      row('-fullscreen'),
      row('-dx11'),
      row('--launcher-skip', 'https://www.pcgamingwiki.com/wiki/Cyberpunk_2077'),
    ])).toEqual(['--launcher-skip', '-dx11', '-fullscreen']);
  });

  it('ranks votes after the game\'s own evidence, not before', () => {
    expect(order([
      row('-a', null, 5),
      row('-b', 'https://example.org/b', 0),
    ])).toEqual(['-b', '-a']);
    expect(order([row('-a', null, 0), row('-b', null, 3)])).toEqual(['-b', '-a']);
  });

  it('is a total order, so the list does not reshuffle between requests', () => {
    const rows = [row('-novid'), row('+fps_max'), row('-console'), row('gamemoderun %command%')];
    expect(order(rows)).toEqual(order([...rows].reverse()));
  });

  // slop-scraper rev 24: every wrapper link is report-backed and cites its
  // game's ProtonDB page. Real evidence, but generic: it ranks after the game's
  // other cited options, which it would otherwise beat on the alphabet alone.
  it('ranks a cited wrapper after the game\'s other cited options, before the rest', () => {
    const protondb = 'https://www.protondb.com/app/457140';
    expect(order([
      row('-windowed'),
      row('gamemoderun %command%', protondb),
      row('mangohud %command%', protondb),
      row('PROTON_USE_WINED3D=1', protondb),
    ])).toEqual(['PROTON_USE_WINED3D=1', 'gamemoderun %command%', 'mangohud %command%', '-windowed']);
  });

  it('ranks an uncited wrapper with the rest, not in the wrapper tier', () => {
    expect(order([row('gamemoderun %command%'), row('-a', null)]))
      .toEqual(['-a', 'gamemoderun %command%']);
  });
});

describe('resolveProvenance — Linux wrappers', () => {
  const shared = {
    command: 'gamemoderun %command%',
    description: 'Runs the game under Feral GameMode.',
    source: 'Feral GameMode',
    source_url: 'https://github.com/FeralInteractive/gamemode',
    last_verified_at: null,
  };
  const report = {
    description: null,
    source: 'ProtonDB',
    source_url: 'https://www.protondb.com/app/1091500',
    last_verified_at: '2026-11-09T00:00:00+00:00',
  };

  // Rev 22 asked for these citations to be ignored; rev 24 lifted that.
  it('shows the game\'s ProtonDB page as its own evidence beside the shared text', () => {
    expect(resolveProvenance(report, shared)).toEqual({
      description: shared.description,
      source: shared.source,
      source_url: shared.source_url,
      last_verified_at: null,
      game_source: 'ProtonDB',
      game_source_url: report.source_url,
      game_verified_at: report.last_verified_at,
    });
  });
});
