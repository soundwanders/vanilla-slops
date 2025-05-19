import { fetchGames } from './api.js';
import { renderTable } from './ui/table.js';
import { renderPagination } from './ui/pagination.js';
import { setupThemeToggle } from './ui/theme.js';
import { setupFilters } from './ui/filters.js';
import { createSearchComponent } from './ui/search.js';

const PAGE_SIZE = 20;

let currentPage = 1;
let isLoading = false;
let hasMorePages = true;
let filters = {};

async function loadPage(page = 1, append = false) {
  if (isLoading || !hasMorePages) return;
  isLoading = true;

  try {
    const { games, total } = await fetchGames({ page, filters });
    const totalPages = Math.ceil(total / PAGE_SIZE);
    currentPage = page;
    hasMorePages = page < totalPages;

    const app = document.getElementById('app');
    if (!append) {
      app.querySelectorAll('.card, .pagination').forEach(el => el.remove());
    }

    renderTable(games, append);
    if (!append) renderPagination(currentPage, totalPages, (p) => loadPage(p));

    setupScrollObserver();
    updateURL();
  } catch (err) {
    console.error('Error loading page:', err);
  } finally {
    isLoading = false;
  }
}

function updateURL() {
  const params = new URLSearchParams();

  if (filters.search) params.set('search', filters.search);
  if (filters.types) params.set('types', filters.types.join(','));
  if (currentPage > 1) params.set('page', currentPage);

  const newURL = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, '', newURL);
}

export function parseURLParams() {
  const params = new URLSearchParams(window.location.search);

  currentPage = parseInt(params.get('page')) || 1;

  const search = params.get('search') || '';
  const genre = params.get('genre') || '';
  const engine = params.get('engine') || '';
  const platform = params.get('platform') || '';
  const sort = params.get('sort') || 'asc';

  // Populate form fields
  const form = document.getElementById('search-form-component');
  if (form) {
    form.search.value = search;
    form.genre.value = genre;
    form.engine.value = engine;
    form.platform.value = platform;
    form.sort.value = sort;
  }

  // Update global filters
  filters = {
    ...filters,
    searchQuery: search,
    genre,
    engine,
    platform,
    sort,
  };
}

function setupScrollObserver() {
  const sentinel = document.getElementById('scroll-sentinel');
  if (!sentinel) return;

  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      observer.disconnect();
      loadPage(currentPage + 1, true);
    }
  }, { rootMargin: '100px' });

  observer.observe(sentinel);
}

document.addEventListener('DOMContentLoaded', () => {
  const target = document.getElementById('search-container');
  const searchComponent = createSearchComponent();
  target.appendChild(searchComponent);

  // Parse filters from URL and populate form
  parseURLParams();

  setupFilters((newFilters) => {
    filters = { ...filters, ...newFilters };
    loadPage(1);
  });

  loadPage(currentPage);
  setupThemeToggle();
});
