import { describe, it, expect } from 'vitest';
import {
  engineSlug, countEngineFlags, selectHubs, resolveHub, gameHasEngineHub,
  MIN_HUB_FLAGS, MIN_HUB_GAMES,
} from '../utils/engineHubs.js';

describe('engineSlug', () => {
  it('uses the same slug rule as game pages', () => {
    expect(engineSlug('Unity Engine')).toBe('unity-engine');
    expect(engineSlug('id Tech')).toBe('id-tech');
    expect(engineSlug('Source 2')).toBe('source-2');
  });
});

describe('countEngineFlags', () => {
  it('counts options per named engine, ignoring Universal', () => {
    const counts = countEngineFlags([
      { engine_compatibility: ['Unity Engine'] },
      { engine_compatibility: ['Unity Engine'] },
      { engine_compatibility: ['Universal'] },
      { engine_compatibility: ['Source Engine', 'Universal'] },
    ]);
    expect(counts.get('Unity Engine')).toBe(2);
    expect(counts.get('Source Engine')).toBe(1);
    expect(counts.has('Universal')).toBe(false);
  });

  it('counts an option once even if it names an engine twice', () => {
    const counts = countEngineFlags([{ engine_compatibility: ['id Tech', 'id Tech'] }]);
    expect(counts.get('id Tech')).toBe(1);
  });

  it('survives empty, null and malformed input', () => {
    expect(countEngineFlags(null).size).toBe(0);
    expect(countEngineFlags([{}, { engine_compatibility: null }, null]).size).toBe(0);
    expect(countEngineFlags([{ engine_compatibility: ['', 'Unknown'] }]).size).toBe(0);
  });
});

describe('selectHubs', () => {
  // The four engines with documented flags on 2026-09-27, at their real sizes.
  const flags = new Map([
    ['Source Engine', 26], ['Unity Engine', 14], ['Unreal Engine', 10], ['id Tech', 5],
  ]);
  const games = new Map([
    ['Unity Engine', 696], ['Unreal Engine', 310], ['Source Engine', 44], ['id Tech', 29],
  ]);

  it('orders hubs by how many games they cover', () => {
    expect(selectHubs(flags, games).map((h) => h.slug))
      .toEqual(['unity-engine', 'unreal-engine', 'source-engine', 'id-tech']);
  });

  it('carries the counts the pages quote', () => {
    const unity = selectHubs(flags, games)[0];
    expect(unity).toEqual({
      engine: 'Unity Engine', slug: 'unity-engine', flags: 14, games: 696, indexable: true,
    });
  });

  it('keeps a thin hub reachable but not indexable', () => {
    const hubs = selectHubs(
      new Map([['Tiny', MIN_HUB_FLAGS - 1], ['Small', MIN_HUB_FLAGS]]),
      new Map([['Tiny', 50], ['Small', MIN_HUB_GAMES - 1]]),
    );
    expect(hubs).toHaveLength(2);
    expect(hubs.every((h) => h.indexable === false)).toBe(true);
  });

  it('drops an engine with no game to show', () => {
    expect(selectHubs(new Map([['Orphan', 9]]), new Map())).toEqual([]);
  });

  it('gives a contested slug to the larger engine only', () => {
    const hubs = selectHubs(
      new Map([['Foo Engine', 3], ['Foo-Engine', 3]]),
      new Map([['Foo Engine', 5], ['Foo-Engine', 50]]),
    );
    expect(hubs).toHaveLength(1);
    expect(hubs[0].engine).toBe('Foo-Engine');
  });
});

describe('resolveHub', () => {
  const hubs = [{ slug: 'unity-engine' }, { slug: 'id-tech' }];

  it('finds a hub by its canonical slug', () => {
    expect(resolveHub(hubs, 'id-tech')).toEqual({ hub: hubs[1], canonical: true });
  });

  it('finds a hub by a differently cased slug, flagged for redirect', () => {
    expect(resolveHub(hubs, 'Unity-Engine')).toEqual({ hub: hubs[0], canonical: false });
  });

  it('returns nothing for an unknown slug', () => {
    expect(resolveHub(hubs, 'frostbite-engine')).toEqual({ hub: null, canonical: false });
    expect(resolveHub(hubs, undefined)).toEqual({ hub: null, canonical: false });
  });
});

describe('gameHasEngineHub', () => {
  it('is true when one of the game\'s options names its engine', () => {
    const game = { engine: 'Unity Engine' };
    expect(gameHasEngineHub(game, [
      { engine_compatibility: ['Universal'] },
      { engine_compatibility: ['Unity Engine'] },
    ])).toBe(true);
  });

  it('ignores flags labelled for a different engine', () => {
    // The live data has Unity-only flags linked to Unreal games. Those must
    // not make an Unreal game link to a hub its engine may not have.
    expect(gameHasEngineHub({ engine: 'Unreal Engine' }, [
      { engine_compatibility: ['Unity Engine'] },
    ])).toBe(false);
  });

  it('is false for an unknown engine or no options', () => {
    expect(gameHasEngineHub({ engine: 'Unknown' }, [{ engine_compatibility: ['Unknown'] }])).toBe(false);
    expect(gameHasEngineHub({ engine: null }, [])).toBe(false);
    expect(gameHasEngineHub({ engine: 'id Tech' }, null)).toBe(false);
  });
});
