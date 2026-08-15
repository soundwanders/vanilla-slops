import { describe, it, expect } from 'vitest';
import { getURLParams, getBaseFiltersFromURL, getCleanFilters } from '../js/state/stateSelectors.js';
import { DEFAULT_SORT, DEFAULT_ORDER } from '../js/constants.js';

/**
 * Regression tests for filter <-> URL serialization.
 *
 * Bug: the URL was only written on sort changes, so filters never reached the
 * address bar and a reload restored whatever stale query was still sitting
 * there — including the filters "clear all" had just removed.
 *
 * getURLParams is the serializer both directions go through, so the round trip
 * is what has to hold: state -> params -> state must come back unchanged.
 */
function stateWith(filters = {}, currentPage = 1) {
  return { filters, currentPage };
}

describe('getURLParams', () => {
  it('writes nothing for an unfiltered default view', () => {
    expect(getURLParams(stateWith()).toString()).toBe('');
  });

  it('omits sort and order when they are the defaults', () => {
    const params = getURLParams(stateWith({ sort: DEFAULT_SORT, order: DEFAULT_ORDER }));
    expect(params.has('sort')).toBe(false);
    expect(params.has('order')).toBe(false);
  });

  it('writes sort and order once they differ from the defaults', () => {
    const params = getURLParams(stateWith({ sort: 'title', order: 'asc' }));
    expect(params.get('sort')).toBe('title');
    expect(params.get('order')).toBe('asc');
  });

  it('writes an active filter', () => {
    const params = getURLParams(stateWith({ engine: 'GoldSrc', year: '2004' }));
    expect(params.get('engine')).toBe('GoldSrc');
    expect(params.get('year')).toBe('2004');
  });

  it('omits page 1 and writes any later page', () => {
    expect(getURLParams(stateWith({}, 1)).has('page')).toBe(false);
    expect(getURLParams(stateWith({}, 3)).get('page')).toBe('3');
  });
});

describe('filter URL round trip', () => {
  const cases = [
    ['no filters', {}],
    ['one filter', { engine: 'Source 2' }],
    ['several filters', { engine: 'GoldSrc', year: '2004', risk: 'safe' }],
    ['search only', { search: 'half-life' }],
    ['non-default sort', { sort: 'title', order: 'asc' }],
    ['default sort with a filter', { developer: 'Valve', sort: DEFAULT_SORT, order: DEFAULT_ORDER }],
    ['sort default but order flipped', { sort: DEFAULT_SORT, order: 'asc' }],
  ];

  it.each(cases)('survives a trip through the URL: %s', (_label, filters) => {
    const state = stateWith(filters);
    const restored = getBaseFiltersFromURL(getURLParams(state));
    expect(restored).toEqual(getCleanFilters(state));
  });
});
