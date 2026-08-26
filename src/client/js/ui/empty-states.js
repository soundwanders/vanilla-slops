import { CONFIG, TableState, getTableContainer } from './table-shared.js';
import { enhanceMobileEmptyState, ensureTouchTarget } from './mobile-gestures.js';

export function renderEmptyState(filters = {}) {
  const container = getTableContainer();
  if (!container) return;

  TableState.currentFilters = filters;

  const type = determineEmptyStateType(filters);
  container.innerHTML = createEmptyStateHTML(type, filters);
  setupEmptyStateEventListeners();

  if (TableState.isMobile) enhanceMobileEmptyState(container);
}

export function renderBasicEmptyState(container) {
  container.innerHTML = `
    <div class="no-results ${TableState.isMobile ? 'mobile-no-results' : ''}">
      <div class="empty-icon">🎮</div>
      <h3>No games found</h3>
      <p>Try adjusting your search criteria or filters.</p>
      ${TableState.isMobile ? '<p class="mobile-hint">Tap the filter button to adjust your search.</p>' : ''}
    </div>
  `;
}

// Only these count as "filters" for empty-state purposes. sort/order always
// carry a value, so testing every key made hasFilters permanently true and
// showed "your filters are too restrictive" on an unfiltered empty result.
const FILTER_KEYS = [
  'search', 'category', 'risk', 'optionSearch',
  'developer', 'engine', 'options', 'year'
];

/**
 * Pick the empty state that describes why the result set is empty.
 *
 * Order matters, and getting it wrong is what made this function a bug. It used
 * to lead with `if (stats.total === 0) return 'database-empty'`, reading
 * `stats.total` as the size of the catalogue. It is not, and could not be:
 *
 *   - It is FILTER-SCOPED. `refreshFilterStatistics` sends the active filters to
 *     /api/games/statistics, so `total` counts the current query. `total === 0`
 *     means "this query matched nothing" — the exact condition that renders an
 *     empty state at all. It could never separate an empty catalogue from an
 *     empty filter, because for this code path they are the same number.
 *   - It is refreshed AFTER the render, so each render read the previous query's
 *     total.
 *
 * Which is why the symptom looked intermittent. The first render to fall into
 * emptiness still held the previous query's non-zero total and picked the right
 * state; every re-render after it — a sort change, a page change — saw 0 and
 * announced that the database was empty, above the user's own filter chips, with
 * a Refresh button that re-ran the identical query.
 *
 * So the decision is made from the filters alone, which are the only input here
 * that is both known and current.
 *
 * So the decision is made from the filters alone, which are the only thing here
 * that is actually known to be true. An empty result with filters applied is
 * explained by the filters. An empty result with NO filters is the only case
 * where "there is nothing to show" is a fair thing to tell someone.
 *
 * @param {Object} filters - Cleaned filter state
 * @returns {'search-no-results'|'all-games-filtered'|'database-empty'}
 */
export function determineEmptyStateType(filters = {}) {
  const hasSearch = filters.search && filters.search.trim();
  const hasFilters = FILTER_KEYS.some(key => filters[key] && filters[key].toString().trim());

  if (hasSearch) return 'search-no-results';
  if (hasFilters) return 'all-games-filtered';
  return 'database-empty';
}

function createEmptyStateHTML(type, filters) {
  const emptyStates = {
    'search-no-results': () => createSearchNoResultsHTML(filters),
    'all-games-filtered': () => createAllFilteredHTML(filters),
    'database-empty': () => createDatabaseEmptyHTML()
  };

  // An unrecognised type means the filters said something this function does not
  // model. Explaining the filters is still the better guess than announcing an
  // empty database.
  const createHTML = emptyStates[type] || emptyStates['all-games-filtered'];
  const mobileClass = TableState.isMobile ? 'mobile-empty-state' : '';
  return `<div class="${CONFIG.CLASSES.emptyTableState} ${type} ${mobileClass}">${createHTML()}</div>`;
}

function createSearchNoResultsHTML(filters) {
  const searchTerm = filters.search || '';
  const btn = TableState.isMobile ? 'btn mobile-btn' : 'btn';

  return `
    <div class="empty-icon">🔍</div>
    <h3 class="empty-title">No results found${searchTerm ? ` for "${searchTerm}"` : ''}</h3>
    <p class="empty-description">No games match your search criteria.</p>
    <div class="empty-actions ${TableState.isMobile ? 'mobile-actions' : ''}">
      <button class="${btn} btn-secondary" data-action="clear-search">Clear search</button>
      <button class="${btn} btn-secondary" data-action="clear-filters">Clear all filters</button>
    </div>
    <div class="search-tips ${TableState.isMobile ? 'mobile-tips' : ''}">
      <h4>Search tips:</h4>
      <ul>
        <li>Try different keywords or shorter terms</li>
        <li>Check for typos in game names</li>
        <li>Search by developer (e.g., "Valve", "id Software")</li>
        <li>Use partial game titles (e.g., "Half" for Half-Life)</li>
      </ul>
    </div>
  `;
}

function createAllFilteredHTML(filters) {
  const activeFilters = getActiveFiltersDescription(filters);
  const btn = TableState.isMobile ? 'btn mobile-btn' : 'btn';

  return `
    <div class="empty-icon">🎛️</div>
    <h3 class="empty-title">No games match your filters</h3>
    <p class="empty-description">Your current filters are too restrictive. Try adjusting them to see more results.</p>
    <div class="active-filters-summary ${TableState.isMobile ? 'mobile-filters' : ''}">
      <h4>Active filters:</h4>
      <div class="filter-summary">${activeFilters}</div>
    </div>
    <div class="empty-actions ${TableState.isMobile ? 'mobile-actions' : ''}">
      <button class="${btn} btn-primary" data-action="clear-filters">Clear all filters</button>
    </div>
  `;
}

/**
 * The genuinely-nothing-to-show state.
 *
 * Reachable only when NO search and NO filters are active, which is what makes
 * "we could not load anything" a fair thing to say. Before the ordering fix
 * this rendered over any empty filtered result too, where it was simply false —
 * and where its Refresh button re-issued the same filtered request and landed
 * the user back on this screen, with no way out that did not involve editing
 * the URL.
 *
 * Reloading is the right offer HERE, because with no filters in play the likely
 * cause is a request that failed rather than a catalogue that is empty. The
 * copy leads with that reading instead of asserting the database is empty, and
 * the home link is there for the case where the page was reached with state
 * that a reload would faithfully restore.
 */
function createDatabaseEmptyHTML() {
  const btn = TableState.isMobile ? 'btn mobile-btn' : 'btn';
  return `
    <div class="empty-icon">🗄️</div>
    <h3 class="empty-title">Couldn't load any games</h3>
    <p class="empty-description">Nothing came back from the catalogue. That is usually a connection problem rather than an empty database, so it is worth trying again.</p>
    <div class="empty-actions ${TableState.isMobile ? 'mobile-actions' : ''}">
      <button class="${btn} btn-primary" data-action="reload">Try again</button>
      <a class="${btn} btn-secondary" href="/">Back to all games</a>
    </div>
  `;
}

const RISK_LABELS = { safe: 'Safe', caution: 'Caution', experimental: 'Experimental' };

function getActiveFiltersDescription(filters) {
  const active = [];
  if (filters.search) active.push(`Search: "${filters.search}"`);
  if (filters.developer) active.push(`Developer: ${filters.developer}`);
  if (filters.engine) active.push(`Engine: ${filters.engine}`);
  if (filters.category) active.push(`Category: ${filters.category}`);
  if (filters.risk) active.push(`Risk: ${RISK_LABELS[filters.risk] || filters.risk}`);
  if (filters.year) active.push(`Year: ${filters.year}`);
  if (filters.options) active.push(`Options: ${filters.options}`);
  // In FILTER_KEYS, so it can be the sole reason a result set is empty. Missing
  // from here, that produced an "Active filters:" panel listing none of them.
  if (filters.optionSearch) active.push(`Launch option: ${filters.optionSearch}`);

  return active.length > 0
    ? active.map(f => `<span class="filter-tag ${TableState.isMobile ? 'mobile-filter-tag' : ''}">${f}</span>`).join('')
    : '<span class="no-filters">No specific filters</span>';
}

// renderEmptyState calls this on every render, but the listeners are delegated
// off document and so survive re-renders. Binding them again stacked a fresh
// copy each time, and every stacked copy re-ran the click handler.
let emptyStateListenersBound = false;

export function setupEmptyStateEventListeners() {
  if (emptyStateListenersBound) return;
  emptyStateListenersBound = true;

  document.addEventListener('click', (e) => {
    const action = e.target.dataset.action;
    if (!action) return;
    e.preventDefault();
    if (TableState.touchDevice && 'vibrate' in navigator) navigator.vibrate(50);
    switch (action) {
      case 'clear-search': triggerClearSearch(); break;
      case 'clear-filters': triggerClearFilters(); break;
      case 'learn-more': showLaunchOptionsInfo(); break;
      case 'reload': window.location.reload(); break;
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('suggestion-chip')) {
      const searchTerm = e.target.dataset.search;
      if (searchTerm) triggerSearch(searchTerm);
    }
  });
}

export function triggerClearSearch() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    if (!TableState.isMobile) searchInput.focus();
  }
}

/**
 * Clear everything and go back to the full list.
 *
 * The search component owns query, filters and sort, so it does the clearing —
 * one notification, one request. Poking each control by hand fired one filter
 * change per control, and only the first survived the in-flight request guard,
 * so the request that actually carried the cleared filters never went out.
 *
 * main.js calls preventDefault() to claim the event; the DOM fallback below
 * runs only if nothing is listening (search component failed to initialize).
 */
export function triggerClearFilters() {
  const claimed = !document.dispatchEvent(
    new CustomEvent('clearAllFilters', { cancelable: true })
  );
  if (claimed) return;

  triggerClearSearch();
  document.querySelectorAll('.filter-select').forEach(select => {
    select.selectedIndex = 0;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

export function triggerSearch(searchTerm) {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.value = searchTerm;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    if (TableState.isMobile) {
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 300);
    }
  }
}

function showLaunchOptionsInfo() {
  const modal = document.createElement('div');
  modal.className = `info-modal-overlay ${TableState.isMobile ? 'mobile-modal' : ''}`;
  modal.innerHTML = `
    <div class="info-modal ${TableState.isMobile ? 'mobile-info-modal' : ''}">
      <div class="info-modal-header">
        <h3>What are Steam Launch Options?</h3>
        <button class="info-modal-close ${TableState.isMobile ? 'mobile-modal-close' : ''}">&times;</button>
      </div>
      <div class="info-modal-body">
        <p>Steam launch options are special commands that modify how games start and run.</p>
        <h4>Common uses:</h4>
        <ul>
          <li><strong>Performance:</strong> Improve FPS and reduce stuttering</li>
          <li><strong>Graphics:</strong> Force specific resolutions or disable effects</li>
          <li><strong>Audio:</strong> Fix sound issues or force audio drivers</li>
          <li><strong>Compatibility:</strong> Resolve crashes and stability issues</li>
        </ul>
        <h4>How to use them:</h4>
        <ol>
          <li>Right-click the game in your Steam library</li>
          <li>Select "Properties"</li>
          <li>Find "Launch Options" field</li>
          <li>Copy and paste the launch options</li>
        </ol>
        ${TableState.isMobile ? '<p><strong>Mobile tip:</strong> Tap any launch option to copy it to your clipboard!</p>' : ''}
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  if (TableState.isMobile) document.body.style.overflow = 'hidden';

  const closeModal = () => {
    document.body.removeChild(modal);
    if (TableState.isMobile) document.body.style.overflow = '';
  };

  const closeButton = modal.querySelector('.info-modal-close');
  if (closeButton) {
    closeButton.addEventListener('click', closeModal);
    if (TableState.isMobile) ensureTouchTarget(closeButton);
  }

  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}
