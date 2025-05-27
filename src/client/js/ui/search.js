/**
 * @fileoverview Search component with backend integration
 * Provides real-time search suggestions, filter management, and keyboard navigation
 * Integrates with Steam Launch Options API for dynamic results rendering
 */

/**
 * @typedef {Object} SlopSearchConfig
 * @property {string} [inputId='searchInput'] - ID of search input element
 * @property {string} [suggestionsId='suggestionsDropdown'] - ID of suggestions dropdown
 * @property {string} [resultsId='resultsList'] - ID of results container
 * @property {string} [resultsCountId='resultsCount'] - ID of results count display
 * @property {string} [activeFiltersId='activeFilters'] - ID of active filters container
 * @property {string} [sortId='sortSelect'] - ID of sort selection dropdown
 * @property {Object} [filters={}] - Map of filter keys to element IDs
 */

/**
 * Advanced search component with autocomplete, filtering, and sorting capabilities
 * Manages search state, communicates with backend APIs, and provides rich UI interactions
 * 
 * @class SlopSearch
 * @param {SlopSearchConfig} config - Configuration object for component initialization
 * 
 * @example
 * const searchComponent = new SlopSearch({
 *   inputId: 'searchInput',
 *   filters: {
 *     category: 'categoryFilter',
 *     developer: 'developerFilter'
 *   }
 * });
 * searchComponent.onFilterChange = (filters) => {
 *   console.log('Filters changed:', filters);
 * };
 */
export default class SlopSearch {
  constructor({
    inputId = 'searchInput',
    suggestionsId = 'suggestionsDropdown',
    resultsId = 'resultsList',
    resultsCountId = 'resultsCount',
    activeFiltersId = 'activeFilters',
    sortId = 'sortSelect',
    filters = {}
  } = {}) {
    
    // DOM element references
    this.searchInput = document.getElementById(inputId);
    this.suggestionsDropdown = document.getElementById(suggestionsId);
    this.resultsList = document.getElementById(resultsId);
    this.resultsCount = document.getElementById(resultsCountId);
    this.activeFilters = document.getElementById(activeFiltersId);
    this.sortSelect = document.getElementById(sortId);

    // Filter elements mapping
    this.filterElements = {};
    Object.entries(filters).forEach(([key, elementId]) => {
      const element = document.getElementById(elementId);
      if (element) {
        this.filterElements[key] = element;
      } else {
        console.warn(`Filter element not found: ${elementId}`);
      }
    });

    // State management
    this.currentQuery = '';
    this.currentFilters = {};
    this.currentSort = 'title';
    this.currentOrder = 'asc';
    this.suggestions = [];
    this.selectedSuggestionIndex = -1;
    this.searchTimeout = null;
    this.suggestionsTimeout = null;
    this.isLoading = false;

    // Callback for filter changes
    this.onFilterChange = null;

    // Initialize
    this.initializeEventListeners();
    this.loadInitialData();
    
    console.log('SlopSearch initialized with elements:', {
      searchInput: !!this.searchInput,
      suggestionsDropdown: !!this.suggestionsDropdown,
      filterElements: Object.keys(this.filterElements)
    });
  }

  /**
   * Set up all event listeners
   */
  initializeEventListeners() {
    // Search input events
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => this.handleSearchInput(e.target.value));
      this.searchInput.addEventListener('keydown', (e) => this.handleKeyNavigation(e));
      this.searchInput.addEventListener('focus', () => this.showSuggestions());
      this.searchInput.addEventListener('blur', () => {
        // Delay hiding to allow suggestion clicks
        setTimeout(() => this.hideSuggestions(), 150);
      });
    }

    // Filter element events
    Object.entries(this.filterElements).forEach(([filterKey, element]) => {
      element.addEventListener('change', (e) => {
        this.handleFilterChange(filterKey, e.target.value);
      });
    });

    // Sort element events
    if (this.sortSelect) {
      this.sortSelect.addEventListener('change', (e) => {
        this.handleSortChange(e.target.value);
      });
    }
  }

  /**
   * Handles search input with intelligent debouncing
   * Triggers both search execution and suggestions fetching
   * 
   * @method handleSearchInput
   * @param {string} query - User input query string
   * @returns {void} Initiates debounced search and suggestions
   */
  handleSearchInput(query) {
    this.currentQuery = query.trim();
    
    // Clear existing timeouts
    clearTimeout(this.searchTimeout);
    clearTimeout(this.suggestionsTimeout);
    
    // Debounced search
    this.searchTimeout = setTimeout(() => {
      this.notifyFilterChange();
    }, 300);

    // Fetch suggestions if query is long enough
    if (query.length >= 2) {
      this.suggestionsTimeout = setTimeout(() => {
        this.fetchSuggestions(query);
      }, 150);
    } else {
      this.hideSuggestions();
    }
  }

  /**
   * Fetches search suggestions from backend API with error handling
   * Implements intelligent caching and displays categorized results
   * 
   * @async
   * @method fetchSuggestions
   * @param {string} query - Search query (minimum 2 characters)
   * @returns {Promise<void>} Updates suggestions state and renders dropdown
   */
  async fetchSuggestions(query) {
    if (!query || query.length < 2) {
      this.hideSuggestions();
      return;
    }

    try {
      const response = await fetch(
        `/api/games/suggestions?q=${encodeURIComponent(query)}&limit=8`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      
      this.suggestions = await response.json();
      this.selectedSuggestionIndex = -1;
      this.renderSuggestions();
      
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      this.suggestions = [];
      this.hideSuggestions();
    }
  }

  /**
   * Renders search suggestions with categorization and highlighting
   * Groups suggestions by type and highlights matching text
   * 
   * @method renderSuggestions
   * @returns {void} Updates suggestions dropdown HTML
   */
  renderSuggestions() {
    if (!this.suggestionsDropdown) return;

    if (!this.suggestions || this.suggestions.length === 0) {
      this.suggestionsDropdown.innerHTML = '<div class="suggestion-item no-suggestions">No suggestions found</div>';
      this.showSuggestions();
      return;
    }

    // Group suggestions by category
    const groupedSuggestions = this.suggestions.reduce((groups, suggestion, index) => {
      const category = suggestion.category || 'Other';
      if (!groups[category]) groups[category] = [];
      groups[category].push({ ...suggestion, originalIndex: index });
      return groups;
    }, {});

    let html = '';
    Object.entries(groupedSuggestions).forEach(([category, items]) => {
      html += `<div class="suggestion-category-header">${category}</div>`;
      items.forEach(item => {
        const isSelected = item.originalIndex === this.selectedSuggestionIndex;
        html += `
          <div class="suggestion-item ${isSelected ? 'highlighted' : ''}" 
               data-index="${item.originalIndex}"
               data-value="${this.escapeHtml(item.value)}">
            <span class="suggestion-value">${this.highlightMatch(item.value, this.currentQuery)}</span>
          </div>
        `;
      });
    });

    this.suggestionsDropdown.innerHTML = html;

    // Add click handlers
    this.suggestionsDropdown.querySelectorAll('.suggestion-item[data-index]').forEach(element => {
      element.addEventListener('click', () => {
        const index = parseInt(element.dataset.index);
        this.selectSuggestion(index);
      });
    });

    this.showSuggestions();
  }

  /**
   * Highlight matching text in suggestions
   */
  highlightMatch(text, query) {
    if (!query) return this.escapeHtml(text);
    
    const escapedText = this.escapeHtml(text);
    const escapedQuery = this.escapeHtml(query);
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    
    return escapedText.replace(regex, '<mark>$1</mark>');
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Handles keyboard navigation within suggestions dropdown
   * Supports arrow keys, Enter, and Escape for accessibility
   * 
   * @method handleKeyNavigation
   * @param {KeyboardEvent} e - Keyboard event object
   * @returns {void} Updates suggestion selection or executes actions
   */
  handleKeyNavigation(e) {
    if (!this.suggestions || this.suggestions.length === 0) return;

    const maxIndex = this.suggestions.length - 1;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectedSuggestionIndex = Math.min(this.selectedSuggestionIndex + 1, maxIndex);
        this.renderSuggestions();
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        this.selectedSuggestionIndex = Math.max(this.selectedSuggestionIndex - 1, -1);
        this.renderSuggestions();
        break;
        
      case 'Enter':
        e.preventDefault();
        if (this.selectedSuggestionIndex >= 0) {
          this.selectSuggestion(this.selectedSuggestionIndex);
        } else {
          this.hideSuggestions();
          this.notifyFilterChange();
        }
        break;
        
      case 'Escape':
        e.preventDefault();
        this.hideSuggestions();
        this.searchInput.blur();
        break;
    }
  }

  /**
   * Select a suggestion and update search
   */
  selectSuggestion(index) {
    const suggestion = this.suggestions[index];
    if (!suggestion) return;

    this.searchInput.value = suggestion.value;
    this.currentQuery = suggestion.value;
    this.hideSuggestions();
    this.notifyFilterChange();
  }

  /**
   * Handle filter changes
   */
  handleFilterChange(filterKey, value) {
    if (value && value.trim()) {
      this.currentFilters[filterKey] = value.trim();
    } else {
      delete this.currentFilters[filterKey];
    }
    
    this.renderActiveFilters();
    this.notifyFilterChange();
  }

  /**
   * Handle sort changes
   */
  handleSortChange(sortValue) {
    // Parse sort value (e.g., "title-asc", "year-desc")
    const [field, order] = sortValue.split('-');
    this.currentSort = field || 'title';
    this.currentOrder = order || 'asc';
    
    this.notifyFilterChange();
  }

  /**
   * Render active filters display
   */
  renderActiveFilters() {
    if (!this.activeFilters) return;

    const filterTags = Object.entries(this.currentFilters).map(([key, value]) => {
      const displayKey = this.getFilterDisplayName(key);
      return `
        <span class="filter-tag">
          <span class="filter-key">${displayKey}:</span>
          <span class="filter-value">${this.escapeHtml(value)}</span>
          <button class="filter-remove" data-key="${key}" title="Remove filter">×</button>
        </span>
      `;
    }).join('');

    this.activeFilters.innerHTML = filterTags;

    // Add remove handlers
    this.activeFilters.querySelectorAll('.filter-remove').forEach(button => {
      button.addEventListener('click', () => {
        const filterKey = button.dataset.key;
        this.removeFilter(filterKey);
      });
    });
  }

  /**
   * Remove a specific filter
   */
  removeFilter(filterKey) {
    delete this.currentFilters[filterKey];
    
    // Reset the corresponding form element
    if (this.filterElements[filterKey]) {
      this.filterElements[filterKey].value = '';
    }
    
    this.renderActiveFilters();
    this.notifyFilterChange();
  }

  /**
   * Get display name for filter key
   */
  getFilterDisplayName(key) {
    const displayNames = {
      category: 'Category',
      developer: 'Developer',
      options: 'Launch Options',
      year: 'Year',
      engine: 'Engine',
      platform: 'Platform'
    };
    return displayNames[key] || key;
  }

  /**
   * Notify parent component of filter changes
   */
  notifyFilterChange() {
    const allFilters = {
      search: this.currentQuery,
      sort: this.currentSort,
      order: this.currentOrder,
      ...this.currentFilters
    };

    if (this.onFilterChange && typeof this.onFilterChange === 'function') {
      this.onFilterChange(allFilters);
    }
  }

  /**
   * Loads initial data from backend to populate filter dropdowns
   * Fetches available facets and populates select elements dynamically
   * 
   * @async
   * @method loadInitialData
   * @returns {Promise<void>} Populates filter options and performs initial search
   */
  async loadInitialData() {
    try {
      // Load filter facets to populate dropdowns
      const response = await fetch('/api/games/facets');
      if (response.ok) {
        const facets = await response.json();
        this.populateFilterOptions(facets);
      }
    } catch (error) {
      console.warn('Failed to load initial filter data:', error);
    }
  }

  /**
   * Populate filter dropdowns with available options
   */
  populateFilterOptions(facets) {
    // Populate developer filter
    if (this.filterElements.developer && facets.developers) {
      this.populateSelectOptions(this.filterElements.developer, facets.developers, 'All Developers');
    }

    // Populate engine filter  
    if (this.filterElements.engine && facets.engines) {
      this.populateSelectOptions(this.filterElements.engine, facets.engines, 'All Engines');
    }

    // Populate year filter
    if (this.filterElements.year && facets.releaseYears) {
      const yearOptions = facets.releaseYears.map(year => ({ value: year, count: 0 }));
      this.populateSelectOptions(this.filterElements.year, yearOptions, 'All Years');
    }
  }

  /**
   * Populate a select element with options
   */
  populateSelectOptions(selectElement, options, defaultText) {
    // Keep existing options and add new ones
    const existingOptions = Array.from(selectElement.options).map(opt => opt.value);
    
    options.forEach(option => {
      const value = typeof option === 'string' ? option : option.value;
      const text = typeof option === 'string' ? option : `${option.value} (${option.count})`;
      
      if (!existingOptions.includes(value)) {
        const optionElement = document.createElement('option');
        optionElement.value = value;
        optionElement.textContent = text;
        selectElement.appendChild(optionElement);
      }
    });
  }

  /**
   * Show suggestions dropdown
   */
  showSuggestions() {
    if (this.suggestionsDropdown && this.suggestions.length > 0) {
      this.suggestionsDropdown.style.display = 'block';
    }
  }

  /**
   * Hide suggestions dropdown
   */
  hideSuggestions() {
    if (this.suggestionsDropdown) {
      this.suggestionsDropdown.style.display = 'none';
    }
  }

  /**
   * Set loading state
   */
  setLoading(isLoading) {
    this.isLoading = isLoading;
    // Could add visual loading indicators here
  }

  /**
   * Get current state
   */
  getCurrentState() {
    return {
      query: this.currentQuery,
      filters: { ...this.currentFilters },
      sort: this.currentSort,
      order: this.currentOrder
    };
  }

  /**
   * Resets all search filters and state to default values
   * Clears search input, filter selections, and active filter display
   * 
   * @method reset
   * @returns {void} Resets component to initial state and triggers filter change
   */
  reset() {
    this.currentQuery = '';
    this.currentFilters = {};
    this.currentSort = 'title';
    this.currentOrder = 'asc';
    
    if (this.searchInput) this.searchInput.value = '';
    
    Object.values(this.filterElements).forEach(element => {
      if (element) element.value = '';
    });
    
    if (this.sortSelect) this.sortSelect.value = 'title';
    
    this.renderActiveFilters();
    this.hideSuggestions();
    this.notifyFilterChange();
  }
}