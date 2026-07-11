import { describe, it, expect, vi } from 'vitest';
import SlopSearch from '../js/ui/search.js';

/**
 * Regression tests for filter change notification.
 *
 * Bug: removing an active filter token deleted the key from currentFilters,
 * so notifyFilterChange omitted it entirely. Downstream MERGE_FILTERS then
 * kept the stale value in state and the filter stayed applied forever.
 * notifyFilterChange must send an explicit '' for every registered filter
 * key that has no current value.
 */

// notifyFilterChange only touches instance fields, so it can be exercised
// without a DOM by calling it against a minimal fake instance.
function makeInstance({ currentFilters = {}, filterElements = {} } = {}) {
  const onFilterChange = vi.fn();
  const instance = {
    currentQuery: '',
    currentSort: 'title',
    currentOrder: 'asc',
    currentFilters,
    filterElements,
    onFilterChange,
  };
  return { instance, onFilterChange };
}

const FILTER_ELEMENTS = { developer: {}, engine: {}, options: {}, year: {} };

describe('SlopSearch.notifyFilterChange', () => {
  it('sends explicit empty strings for registered filters with no value', () => {
    const { instance, onFilterChange } = makeInstance({
      currentFilters: { developer: 'PopCap Games, Inc.' },
      filterElements: FILTER_ELEMENTS,
    });

    SlopSearch.prototype.notifyFilterChange.call(instance);

    const payload = onFilterChange.mock.calls[0][0];
    expect(payload.developer).toBe('PopCap Games, Inc.');
    expect(payload.engine).toBe('');
    expect(payload.options).toBe('');
    expect(payload.year).toBe('');
  });

  it('clears a removed filter instead of omitting it', () => {
    const { instance, onFilterChange } = makeInstance({
      currentFilters: { developer: 'PopCap Games, Inc.', engine: 'Source Engine' },
      filterElements: FILTER_ELEMENTS,
    });

    // Simulate removeFilter('developer')
    delete instance.currentFilters.developer;
    SlopSearch.prototype.notifyFilterChange.call(instance);

    const payload = onFilterChange.mock.calls[0][0];
    expect(payload).toHaveProperty('developer', '');
    expect(payload.engine).toBe('Source Engine');
  });

  it('clears every filter after reset empties currentFilters', () => {
    const { instance, onFilterChange } = makeInstance({
      currentFilters: {},
      filterElements: FILTER_ELEMENTS,
    });

    SlopSearch.prototype.notifyFilterChange.call(instance);

    const payload = onFilterChange.mock.calls[0][0];
    Object.keys(FILTER_ELEMENTS).forEach((key) => {
      expect(payload).toHaveProperty(key, '');
    });
  });

  it('always includes search, sort, and order', () => {
    const { instance, onFilterChange } = makeInstance({
      filterElements: FILTER_ELEMENTS,
    });
    instance.currentQuery = 'half life';
    instance.currentSort = 'options';
    instance.currentOrder = 'desc';

    SlopSearch.prototype.notifyFilterChange.call(instance);

    const payload = onFilterChange.mock.calls[0][0];
    expect(payload.search).toBe('half life');
    expect(payload.sort).toBe('options');
    expect(payload.order).toBe('desc');
  });
});
