/**
 * Debounced searches, filter, sort, suggestion dropdown, and renders results
*/
export class SlopSearch {
  constructor({
    inputId = 'searchInput',
    suggestionsId = 'suggestionsDropdown',
    resultsId = 'resultsList',
    resultsCountId = 'resultsCount',
    activeFiltersId = 'activeFilters',
    filters = {},
    sortId = 'sortSelect',
  } = {}) {
    this.searchInput = document.getElementById(inputId);
    this.suggestionsDropdown = document.getElementById(suggestionsId);
    this.resultsList = document.getElementById(resultsId);
    this.resultsCount = document.getElementById(resultsCountId);
    this.activeFilters = document.getElementById(activeFiltersId);

    this.filters = Object.entries(filters).reduce((acc, [key, id]) => {
      acc[key] = document.getElementById(id);
      return acc;
    }, {});

    this.sortSelect = document.getElementById(sortId);

    this.currentQuery = '';
    this.currentFilters = {};
    this.currentSort = 'relevance';
    this.suggestions = [];
    this.selectedSuggestionIndex = -1;
    this.searchTimeout = null;
    this.isLoading = false;

    this.initializeEventListeners();
    this.loadInitialData();
  }

  initializeEventListeners() {
    this.searchInput.addEventListener('input', (e) => this.handleSearchInput(e.target.value));
    this.searchInput.addEventListener('keydown', (e) => this.handleKeyNavigation(e));
    this.searchInput.addEventListener('focus', () => this.showSuggestions());
    this.searchInput.addEventListener('blur', () => setTimeout(() => this.hideSuggestions(), 150));

    Object.keys(this.filters).forEach((key) => {
      this.filters[key].addEventListener('change', (e) => this.handleFilterChange(key, e.target.value));
    });

    this.sortSelect.addEventListener('change', (e) => this.handleSortChange(e.target.value));
  }

  handleSearchInput(query) {
    this.currentQuery = query.trim();
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.performSearch(), 300);
    if (query.length >= 2) {
      this.fetchSuggestions(query);
    } else {
      this.hideSuggestions();
    }
  }

  async fetchSuggestions(query) {
    try {
      const res = await fetch(`/api/games/suggestions?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
      this.suggestions = await res.json();
      this.selectedSuggestionIndex = -1;
      this.renderSuggestions();
    } catch (err) {
      console.error('Suggestion error:', err);
      this.hideSuggestions();
    }
  }

  renderSuggestions() {
    if (!this.suggestions.length) {
      this.suggestionsDropdown.innerHTML = '<div class="suggestion-item">No suggestions found</div>';
      return;
    }
    this.suggestionsDropdown.innerHTML = this.suggestions.map((s, i) => `
      <div class="suggestion-item ${i === this.selectedSuggestionIndex ? 'highlighted' : ''}" data-index="${i}">
        <span class="suggestion-category">${s.category}</span> ${s.value}
      </div>
    `).join('');
    this.suggestionsDropdown.querySelectorAll('.suggestion-item').forEach((el, i) => {
      el.addEventListener('click', () => this.selectSuggestion(i));
    });
    this.showSuggestions();
  }

  handleKeyNavigation(e) {
    const max = this.suggestions.length - 1;
    if (!max || this.suggestionsDropdown.style.display === 'none') return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectedSuggestionIndex = Math.min(this.selectedSuggestionIndex + 1, max);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.selectedSuggestionIndex = Math.max(this.selectedSuggestionIndex - 1, 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (this.selectedSuggestionIndex >= 0) {
          this.selectSuggestion(this.selectedSuggestionIndex);
        } else {
          this.performSearch();
        }
        break;
      case 'Escape':
        this.hideSuggestions();
        break;
    }
    this.renderSuggestions();
  }

  selectSuggestion(index) {
    const suggestion = this.suggestions[index];
    if (!suggestion) return;
    this.searchInput.value = suggestion.value;
    this.currentQuery = suggestion.value;
    this.hideSuggestions();
    this.performSearch();
  }

  handleFilterChange(key, value) {
    if (value) this.currentFilters[key] = value;
    else delete this.currentFilters[key];
    this.renderActiveFilters();
    this.performSearch();
  }

  handleSortChange(value) {
    this.currentSort = value;
    this.performSearch();
  }

  renderActiveFilters() {
    if (!this.activeFilters) return;
    this.activeFilters.innerHTML = Object.entries(this.currentFilters).map(([k, v]) => `
      <span class="filter-tag">${k}: ${v} <button data-key="${k}">×</button></span>
    `).join('');
    this.activeFilters.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        delete this.currentFilters[btn.dataset.key];
        if (this.filters[btn.dataset.key]) this.filters[btn.dataset.key].value = '';
        this.renderActiveFilters();
        this.performSearch();
      });
    });
  }

  async performSearch() {
    this.setLoading(true);
    try {
      const params = new URLSearchParams({ search: this.currentQuery, sort: this.currentSort, page: 1, limit: 20 });
      for (const [k, v] of Object.entries(this.currentFilters)) params.set(k, v);
      const res = await fetch(`/api/games?${params.toString()}`);
      if (!res.ok) throw new Error(`Search error: ${res.status}`);
      const data = await res.json();
      this.renderResults(data.games);
      if (this.resultsCount) this.resultsCount.textContent = `${data.total} results`;
    } catch (err) {
      console.error(err);
      this.renderError('Failed to fetch results.');
    } finally {
      this.setLoading(false);
    }
  }

  renderResults(results) {
    if (!this.resultsList) return;
    if (!results.length) {
      this.resultsList.innerHTML = '<div class="no-results">No results found.</div>';
      return;
    }
    this.resultsList.innerHTML = results.map(r => `
      <div class="result-item">
        <strong>${r.title}</strong> - ${r.developer || 'Unknown'} (${r.release_year || 'N/A'})
      </div>
    `).join('');
  }

  renderError(msg) {
    if (this.resultsList) {
      this.resultsList.innerHTML = `<div class="error">${msg}</div>`;
    }
  }

  setLoading(state) {
    this.isLoading = state;
    if (this.resultsList && state) {
      this.resultsList.innerHTML = '<div class="loading">Loading...</div>';
    }
  }

  async loadInitialData() {
    try {
      const res = await fetch('/api/games/facets');
      if (!res.ok) return;
      const data = await res.json();
      if (data.genres && this.filters.category) {
        this.filters.category.innerHTML = '<option value="">All</option>' +
          data.genres.map(g => `<option value="${g}">${g}</option>`).join('');
      }
    } catch (err) {
      console.warn('Facets fetch failed', err);
    }
    this.performSearch();
  }

  showSuggestions() {
    this.suggestionsDropdown.style.display = 'block';
  }

  hideSuggestions() {
    this.suggestionsDropdown.style.display = 'none';
  }
}
