import { describe, it, expect } from 'vitest';
import { FEATURED_APP_IDS, FEATURED_RANK, FEATURED_ID_LIST } from '../config/featuredGames.js';
import { querySchema } from '../schemas/gameQuerySchema.js';

describe('featured lineup', () => {
  it('holds unique app_ids', () => {
    expect(new Set(FEATURED_APP_IDS).size).toBe(FEATURED_APP_IDS.length);
  });

  it('stays shorter than a page, so the tail of page one is still data-driven', () => {
    expect(FEATURED_APP_IDS.length).toBeLessThan(20);
  });

  it('ranks every id by its display position', () => {
    FEATURED_APP_IDS.forEach((id, i) => expect(FEATURED_RANK.get(id)).toBe(i));
  });

  it('formats the exclusion list as a PostgREST id tuple', () => {
    expect(FEATURED_ID_LIST).toMatch(/^\(\d+(,\d+)*\)$/);
  });

  it('leads with Counter-Strike 2, not the 2000 original', () => {
    expect(FEATURED_APP_IDS[0]).toBe(730);
    expect(FEATURED_APP_IDS).not.toContain(10);
  });
});

describe('querySchema sorting', () => {
  it('defaults to the featured ordering', () => {
    expect(querySchema.parse({}).sort).toBe('featured');
  });

  it('still accepts the raw option-count sort', () => {
    expect(querySchema.parse({ sort: 'total_options_count' }).sort).toBe('total_options_count');
  });
});
