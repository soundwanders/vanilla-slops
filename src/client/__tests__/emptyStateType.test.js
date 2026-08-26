import { describe, it, expect } from 'vitest';
import { determineEmptyStateType } from '../js/ui/empty-states.js';

/**
 * Regression tests for empty-state selection.
 *
 * Bug: the function led with `if (stats.total === 0) return 'database-empty'`,
 * believing stats.total was the catalogue size. It is the count for the CURRENT
 * QUERY — refreshFilterStatistics sends the active filters — so `total === 0`
 * means "this query matched nothing", which is precisely when an empty state
 * renders. It could never tell an empty catalogue from an empty filter.
 *
 * Users saw "the game database appears to be empty" under five active filter
 * chips, with a Refresh button that re-ran the same filtered query and returned
 * them to the identical screen.
 */

describe('determineEmptyStateType', () => {
  it('blames the search when one is active', () => {
    expect(determineEmptyStateType({ search: 'zzzznotagame' })).toBe('search-no-results');
  });

  it('blames the filters when filters are active', () => {
    expect(determineEmptyStateType({ engine: 'PopCap Games Framework' })).toBe('all-games-filtered');
  });

  it.each([
    ['category', 'Skip-Intro'],
    ['risk', 'caution'],
    ['developer', 'Ubisoft Montreal'],
    ['engine', 'PopCap Games Framework'],
    ['year', '2020'],
    ['options', 'with-options'],
    ['optionSearch', '-novid'],
  ])('treats %s as a filter', (key, value) => {
    expect(determineEmptyStateType({ [key]: value })).toBe('all-games-filtered');
  });

  it('reports an empty catalogue only when nothing is filtered', () => {
    expect(determineEmptyStateType({})).toBe('database-empty');
    expect(determineEmptyStateType()).toBe('database-empty');
  });

  it('does not call a filtered result an empty database', () => {
    // The exact combination from the report: five filters, zero results.
    const reported = {
      category: 'Skip-Intro',
      developer: 'Ubisoft Montreal',
      risk: 'caution',
      engine: 'PopCap Games Framework',
      year: '2020',
    };
    expect(determineEmptyStateType(reported)).not.toBe('database-empty');
    expect(determineEmptyStateType(reported)).toBe('all-games-filtered');
  });

  it('ignores empty and whitespace-only filter values', () => {
    expect(determineEmptyStateType({ engine: '', search: '   ' })).toBe('database-empty');
  });

  it('prefers the search explanation when both are present', () => {
    // Clearing the search is the smaller, likelier fix, and that state offers
    // both buttons anyway.
    expect(determineEmptyStateType({ search: 'halo', engine: 'Unity Engine' })).toBe('search-no-results');
  });
});
