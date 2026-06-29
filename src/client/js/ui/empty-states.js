import { CONFIG, TableState, getTableContainer, escapeHtml } from './table-shared.js';
import { enhanceMobileEmptyState, ensureTouchTarget } from './mobile-gestures.js';

export function renderEmptyState(filters = {}, stats = {}) {
  const container = getTableContainer();
  if (!container) return;

  TableState.currentStats = stats;
  TableState.currentFilters = filters;

  const type = determineEmptyStateType(filters, stats);
  container.innerHTML = createEmptyStateHTML(type, filters, stats);
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

function determineEmptyStateType(filters, stats) {
  const hasSearch = filters.search && filters.search.trim();
  const hasFilters = Object.entries(filters).some(([key, val]) =>
    key !== 'showAll' && key !== 'hasOptions' && val && val.toString().trim()
  );

  if (stats.total === 0) return 'database-empty';
  if (hasSearch && stats.total === 0) return 'search-no-results';
  if (!filters.showAll && stats.withOptions === 0) {
    return hasSearch || hasFilters ? 'search-no-results' : 'no-options-found';
  }
  if (hasFilters) return 'all-games-filtered';
  return 'default';
}

function createEmptyStateHTML(type, filters, stats) {
  const emptyStates = {
    'no-options-found': () => createNoOptionsFoundHTML(stats),
    'search-no-results': () => createSearchNoResultsHTML(filters, stats),
    'all-games-filtered': () => createAllFilteredHTML(filters, stats),
    'database-empty': () => createDatabaseEmptyHTML(),
    'default': () => createDefaultEmptyHTML(stats)
  };

  const createHTML = emptyStates[type] || emptyStates.default;
  const mobileClass = TableState.isMobile ? 'mobile-empty-state' : '';
  return `<div class="${CONFIG.CLASSES.emptyTableState} ${type} ${mobileClass}">${createHTML()}</div>`;
}

function createNoOptionsFoundHTML(stats) {
  const suggestions = ['Counter-Strike', 'Half-Life', 'Portal', 'Cyberpunk', 'Witcher', 'GTA'];
  const btn = TableState.isMobile ? 'btn mobile-btn' : 'btn';

  return `
    <div class="empty-icon">🎮</div>
    <h3 class="empty-title">Looking for games with launch options?</h3>
    <p class="empty-description">We're showing games that have community-verified launch options for the best experience.</p>
    <div class="empty-stats ${TableState.isMobile ? 'mobile-stats' : ''}">
      <div class="stat-card">
        <span class="stat-number">${stats.withOptions || 0}</span>
        <span class="stat-label">Games with options</span>
      </div>
      <div class="stat-card muted">
        <span class="stat-number">${stats.withoutOptions || 0}</span>
        <span class="stat-label">Games without options</span>
      </div>
    </div>
    <div class="empty-suggestions">
      <h4>Try searching for popular games:</h4>
      <div class="suggestion-chips ${TableState.isMobile ? 'mobile-chips' : ''}">
        ${suggestions.map(s => `<button class="suggestion-chip ${TableState.isMobile ? 'mobile-chip' : ''}" data-search="${s}">${s}</button>`).join('')}
      </div>
    </div>
    <div class="empty-actions ${TableState.isMobile ? 'mobile-actions' : ''}">
      <button class="${btn} btn-primary" data-action="show-all">Show all ${stats.total || 0} games</button>
      <button class="${btn} btn-secondary" data-action="learn-more">Learn about launch options</button>
    </div>
  `;
}

function createSearchNoResultsHTML(filters, stats) {
  const searchTerm = filters.search || '';
  const btn = TableState.isMobile ? 'btn mobile-btn' : 'btn';

  return `
    <div class="empty-icon">🔍</div>
    <h3 class="empty-title">No results found${searchTerm ? ` for "${searchTerm}"` : ''}</h3>
    <p class="empty-description">
      ${filters.showAll ? 'No games match your search criteria.' : 'No games with launch options match your search criteria.'}
    </p>
    ${!filters.showAll && stats.withoutOptions > 0 ? `
      <div class="empty-suggestion ${TableState.isMobile ? 'mobile-suggestion' : ''}">
        <p>💡 Try <button class="inline-btn" data-action="show-all">showing all games</button>
        to see ${stats.withoutOptions} more results without launch options.</p>
      </div>
    ` : ''}
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

function createAllFilteredHTML(filters, stats) {
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
      ${!filters.showAll ? `<button class="${btn} btn-secondary" data-action="show-all">Show all games</button>` : ''}
    </div>
  `;
}

function createDatabaseEmptyHTML() {
  const btn = TableState.isMobile ? 'btn mobile-btn' : 'btn';
  return `
    <div class="empty-icon">🗄️</div>
    <h3 class="empty-title">No games in database</h3>
    <p class="empty-description">The game database appears to be empty. This might be a temporary issue.</p>
    <div class="empty-actions ${TableState.isMobile ? 'mobile-actions' : ''}">
      <button class="${btn} btn-primary" onclick="location.reload()">Refresh page</button>
    </div>
  `;
}

function createDefaultEmptyHTML(stats) {
  return `
    <div class="empty-icon">🎮</div>
    <h3 class="empty-title">Ready to find games?</h3>
    <p class="empty-description">Search through ${stats.total || 0} games to find the perfect launch options.</p>
    <div class="empty-stats ${TableState.isMobile ? 'mobile-stats' : ''}">
      <div class="stat-card">
        <span class="stat-number">${stats.withOptions || 0}</span>
        <span class="stat-label">Games with launch options</span>
      </div>
      <div class="stat-card">
        <span class="stat-number">${stats.percentageWithOptions || 0}%</span>
        <span class="stat-label">Have launch options</span>
      </div>
    </div>
  `;
}

function getActiveFiltersDescription(filters) {
  const active = [];
  if (filters.search) active.push(`Search: "${filters.search}"`);
  if (filters.developer) active.push(`Developer: ${filters.developer}`);
  if (filters.category) active.push(`Category: ${filters.category}`);
  if (filters.year) active.push(`Year: ${filters.year}`);
  if (filters.options) active.push(`Options: ${filters.options}`);
  if (!filters.showAll) active.push('Only games with launch options');

  return active.length > 0
    ? active.map(f => `<span class="filter-tag ${TableState.isMobile ? 'mobile-filter-tag' : ''}">${f}</span>`).join('')
    : '<span class="no-filters">No specific filters</span>';
}

export function setupEmptyStateEventListeners() {
  document.addEventListener('click', (e) => {
    const action = e.target.dataset.action;
    if (!action) return;
    e.preventDefault();
    if (TableState.touchDevice && 'vibrate' in navigator) navigator.vibrate(50);
    switch (action) {
      case 'show-all': triggerShowAllGames(); break;
      case 'clear-search': triggerClearSearch(); break;
      case 'clear-filters': triggerClearFilters(); break;
      case 'learn-more': showLaunchOptionsInfo(); break;
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('suggestion-chip')) {
      const searchTerm = e.target.dataset.search;
      if (searchTerm) triggerSearch(searchTerm);
    }
  });
}

export function triggerShowAllGames() {
  const checkbox = document.getElementById('showAllGamesFilter');
  if (checkbox) {
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    document.dispatchEvent(new CustomEvent('showAllGames'));
  }
}

export function triggerClearSearch() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    if (!TableState.isMobile) searchInput.focus();
  }
}

export function triggerClearFilters() {
  triggerClearSearch();
  document.querySelectorAll('.filter-select').forEach(select => {
    select.selectedIndex = 0;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const showAllCheckbox = document.getElementById('showAllGamesFilter');
  if (showAllCheckbox) {
    showAllCheckbox.checked = false;
    showAllCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
  }
  document.dispatchEvent(new CustomEvent('clearAllFilters'));
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
