import { fetchGames } from './api.js';
import { renderTable } from './ui/table.js';
import { renderPagination } from './ui/pagination.js';
import { setupThemeToggle } from './theme.js';

let currentPage = 1;
let searchQuery = '';
let hideDLC = false;
const PAGE_SIZE = 20;

async function loadPage(page = 1) {
  try {
    const { games, total } = await fetchGames({ page, search: searchQuery, hideDLC });
    const totalPages = Math.ceil(total / PAGE_SIZE);
    currentPage = page;

    const app = document.getElementById('app');
    // Clear old cards and pagination before re-rendering
    app.querySelectorAll('.card, .pagination').forEach(el => el.remove());

    renderTable(games);
    renderPagination(currentPage, totalPages, loadPage);
  } catch (err) {
    console.error('Error loading page:', err);
  }
}

function setupEventListeners() {
  const searchInput = document.getElementById('search-input');
  const filterDLC = document.getElementById('filter-dlc');

  searchInput.addEventListener('input', debounce((e) => {
    searchQuery = e.target.value;
    loadPage(1);
  }, 300));

  filterDLC.addEventListener('change', (e) => {
    hideDLC = e.target.checked;
    loadPage(1);
  });
}

// Debounce to avoid excessive API calls
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadPage(1);
  setupThemeToggle();
  init();
});