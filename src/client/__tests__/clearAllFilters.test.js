import { describe, it, expect, vi } from 'vitest';
import SlopSearch from '../js/ui/search.js';
import { determineEmptyStateType } from '../js/ui/empty-states.js';

/**
 * Regression tests for "Clear all filters" on an empty state.
 *
 * Bug: the empty-state button cleared the search box and then dispatched a
 * change event per filter select, producing seven filter-change notifications
 * in one synchronous burst. Only the first got past loadPage's in-flight
 * guard, and it was built from filters that were still restrictive — so the
 * requests carrying the cleared filters were never sent and the screen kept
 * showing the empty state it was supposed to leave.
 *
 * Clearing now runs through SlopSearch.reset(), which notifies exactly once.
 */

// reset() only touches instance fields and stubbed DOM handles, so it can be
// exercised without a DOM by calling it against a minimal fake instance.
function makeInstance() {
  const notifyFilterChange = vi.fn();
  const instance = {
    defaultSort: 'featured',
    defaultOrder: 'desc',
    currentQuery: 'half-life',
    currentFilters: { engine: 'Source Engine', year: '2004' },
    currentSort: 'title',
    currentOrder: 'asc',
    keystrokeCount: 7,
    searchTimeout: null,
    suggestionsTimeout: null,
    searchInput: { value: 'half-life' },
    filterElements: { engine: { value: 'Source Engine' }, year: { value: '2004' } },
    sortSelect: { value: 'title-asc' },
    renderActiveFilters: vi.fn(),
    hideSuggestions: vi.fn(),
    hideSearchPending: vi.fn(),
    notifyFilterChange,
  };
  return { instance, notifyFilterChange };
}

describe('SlopSearch.reset', () => {
  it('clears query and filters in a single notification', () => {
    const { instance, notifyFilterChange } = makeInstance();

    SlopSearch.prototype.reset.call(instance);

    expect(instance.currentQuery).toBe('');
    expect(instance.currentFilters).toEqual({});
    expect(instance.searchInput.value).toBe('');
    expect(instance.filterElements.engine.value).toBe('');
    expect(instance.filterElements.year.value).toBe('');
    expect(notifyFilterChange).toHaveBeenCalledTimes(1);
  });

  it('restores the configured default sort, not a hardcoded one', () => {
    const { instance } = makeInstance();

    SlopSearch.prototype.reset.call(instance);

    expect(instance.currentSort).toBe('featured');
    expect(instance.currentOrder).toBe('desc');
    expect(instance.sortSelect.value).toBe('featured-desc');
  });
});

/**
 * Bug: determineEmptyStateType tested every key on the filters object, but
 * getCleanFilters always supplies sort and order, so "has filters" was always
 * true. An unfiltered empty result rendered "your filters are too restrictive"
 * with an active-filter list reading "No specific filters" — indistinguishable
 * from the page the user had just tried to clear.
 */
describe('determineEmptyStateType', () => {
  const cleared = {
    search: '', category: '', risk: '', optionSearch: '',
    developer: '', engine: '', options: '', year: '',
    sort: 'featured', order: 'desc'
  };
  const stats = { total: 2402 };

  it('does not treat sort and order as active filters', () => {
    expect(determineEmptyStateType(cleared, stats)).toBe('default');
  });

  it('still reports a real filter as restrictive', () => {
    expect(determineEmptyStateType({ ...cleared, engine: 'GoldSrc' }, stats))
      .toBe('all-games-filtered');
  });

  it('prefers the search-specific state when a query is present', () => {
    expect(determineEmptyStateType({ ...cleared, search: 'portal' }, stats))
      .toBe('search-no-results');
  });

  it('reports an empty database regardless of filters', () => {
    expect(determineEmptyStateType(cleared, { total: 0 })).toBe('database-empty');
  });
});
