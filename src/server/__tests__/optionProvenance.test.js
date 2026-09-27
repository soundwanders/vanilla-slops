import { describe, it, expect } from 'vitest';
import { resolveProvenance } from '../utils/optionProvenance.js';

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
