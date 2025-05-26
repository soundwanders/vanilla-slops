import { fetchGames } from './api.js';
import { SlopSearch } from './ui/search.js';

// Global state
let currentPage = 1;
let filters = {};
let hasMorePages = true;

/**
 * Setup theme toggle functionality
 */
function setupThemeToggle() {
  const themeToggle = document.getElementById('theme-toggle');
  if (!themeToggle) return;

  // Check for saved theme preference or default to 'light'
  const currentTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);

  themeToggle.addEventListener('click', () => {
    const theme = document.documentElement.getAttribute('data-theme');
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  });
}

/**
 * Parse URL parameters and update filters
 */
function parseURLParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const newFilters = {};
  
  // Parse each possible filter parameter
  const filterParams = ['search', 'genre', 'engine', 'platform', 'sort'];
  
  filterParams.forEach(param => {
    const value = urlParams.get(param);
    if (value) {
      newFilters[param] = value;
    }
  });
  
  filters = { ...filters, ...newFilters };
  
  // Update the search form with URL parameters
  populateFormFromFilters(newFilters);
}

/**
 * Populate form fields with filter values
 */
function populateFormFromFilters(filterValues) {
  const form = document.getElementById('search-form-component');
  if (!form) return;
  
  Object.entries(filterValues).forEach(([key, value]) => {
    const input = form.querySelector(`[name="${key}"]`);
    if (input) {
      input.value = value;
    }
  });
}

/**
 * Update URL with current filter parameters
 */
function updateURL(newFilters) {
  const url = new URL(window.location);
  
  // Clear existing parameters
  url.search = '';
  
  // Add non-empty filter values
  Object.entries(newFilters).forEach(([key, value]) => {
    if (value && value.trim() !== '') {
      url.searchParams.set(key, value);
    }
  });
  
  // Update URL without page reload
  window.history.pushState({}, '', url);
}

/**
 * Setup filter change handlers
 */
function setupFilters(onFiltersChange) {
  const form = document.getElementById('search-form-component');
  if (!form) {
    console.error('Search form not found');
    return;
  }

  // Handle form submission
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const newFilters = {};
    
    // Extract all form values
    for (const [key, value] of formData.entries()) {
      if (value && value.trim() !== '') {
        newFilters[key] = value.trim();
      }
    }
    
    // Update URL
    updateURL(newFilters);
    
    // Trigger callback
    onFiltersChange(newFilters);
  });

  // Handle individual input changes for real-time updates
  const inputs = form.querySelectorAll('input, select');
  inputs.forEach(input => {
    input.addEventListener('change', () => {
      // Trigger form submission to handle the change
      form.dispatchEvent(new Event('submit'));
    });
  });
}

/**
 * Load and display games for a specific page
 */
async function loadPage(page) {
  console.log(`Loading page ${page} with filters:`, filters);
  
  try {
    const response = await fetchGames({ ...filters, page });
    console.log('API response:', response);
    
    if (!response.success) {
      console.error('API returned error:', response.error);
      displayError('Failed to load games: ' + response.error);
      return;
    }

    const games = response.data || [];
    const totalPages = response.pagination?.totalPages || 1;
    
    // Update pagination state
    hasMorePages = page < totalPages;
    
    if (page === 1) {
      // First page - replace content
      displayGames(games);
    } else {
      // Subsequent pages - append content
      appendGames(games);
    }
    
    // Update pagination controls
    updatePaginationControls(page, totalPages);
    
  } catch (error) {
    console.error('Error loading games:', error);
    displayError('Failed to load games. Please try again.');
  }
}

/**
 * Display games in the results container
 */
function displayGames(games) {
  const resultsContainer = document.getElementById('results');
  if (!resultsContainer) {
    console.error('Results container not found');
    return;
  }

  if (!games || games.length === 0) {
    resultsContainer.innerHTML = '<p class="no-results">No games found matching your criteria.</p>';
    return;
  }

  resultsContainer.innerHTML = games.map(game => createGameCard(game)).join('');
}

/**
 * Append games to the existing results
 */
function appendGames(games) {
  const resultsContainer = document.getElementById('results');
  if (!resultsContainer || !games || games.length === 0) return;

  const gameCards = games.map(game => createGameCard(game)).join('');
  resultsContainer.insertAdjacentHTML('beforeend', gameCards);
}

/**
 * Create HTML for a game card
 */
function createGameCard(game) {
  const launchOptions = game.launch_options || [];
  const launchOptionsHtml = launchOptions.length > 0 
    ? launchOptions.map(option => `
        <div class="launch-option">
          <strong>${option.name || 'Default'}</strong>
          ${option.arguments ? `<code>${option.arguments}</code>` : ''}
        </div>
      `).join('')
    : '<p class="no-launch-options">No launch options available</p>';

  return `
    <article class="game-card">
      <header class="game-header">
        <h2 class="game-title">${escapeHtml(game.name || 'Unknown Game')}</h2>
        <div class="game-meta">
          ${game.genre ? `<span class="genre">${escapeHtml(game.genre)}</span>` : ''}
          ${game.engine ? `<span class="engine">${escapeHtml(game.engine)}</span>` : ''}
          ${game.platform ? `<span class="platform">${escapeHtml(game.platform)}</span>` : ''}
        </div>
      </header>
      
      <div class="launch-options">
        <h3>Launch Options</h3>
        ${launchOptionsHtml}
      </div>
    </article>
  `;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Display error message
 */
function displayError(message) {
  const resultsContainer = document.getElementById('results');
  if (resultsContainer) {
    resultsContainer.innerHTML = `<p class="error">${escapeHtml(message)}</p>`;
  }
}

/**
 * Update pagination controls
 */
function updatePaginationControls(currentPage, totalPages) {
  const paginationContainer = document.getElementById('pagination');
  if (!paginationContainer) return;

  // Clear existing controls
  paginationContainer.innerHTML = '';

  if (totalPages <= 1) return;

  // Previous button
  if (currentPage > 1) {
    const prevButton = document.createElement('button');
    prevButton.textContent = 'Previous';
    prevButton.addEventListener('click', () => {
      loadPage(currentPage - 1);
    });
    paginationContainer.appendChild(prevButton);
  }

  // Page info
  const pageInfo = document.createElement('span');
  pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  pageInfo.className = 'page-info';
  paginationContainer.appendChild(pageInfo);

  // Next button
  if (currentPage < totalPages) {
    const nextButton = document.createElement('button');
    nextButton.textContent = 'Next';
    nextButton.addEventListener('click', () => {
      loadPage(currentPage + 1);
    });
    paginationContainer.appendChild(nextButton);
  }
}

/**
 * Initialize the application
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing app...');
  
  // Initialize the SlopSearch component
  const target = document.getElementById('search-container');
  if (target) {
    const slopSearch = new SlopSearch();
    slopSearch.mount(target);
    console.log('SlopSearch component created');
  } else {
    console.error('Search container not found');
  }

  // Parse filters from URL and populate form
  parseURLParams();

  // Setup filter change handlers
  setupFilters((newFilters) => {
    console.log('Filters changed:', newFilters);
    filters = { ...filters, ...newFilters };
    currentPage = 1; // Reset to first page when filters change
    hasMorePages = true; // Reset pagination state
    loadPage(1);
  });

  // Setup theme toggle
  setupThemeToggle();

  // Load initial page
  console.log('Starting initial page load...');
  loadPage(currentPage);
});