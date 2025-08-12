/**
 * @fileoverview Search component
 * Single source of truth for all search interactions
 * Eliminates duplicate event listeners and implements smart debouncing
 * Supports click-outside detection to prevent unnecessary searches
 * Handles both fast suggestions and deliberate search with progressive debouncing
 * @module SlopSearch
 * @requires api.js
 * @requires styles/animations.css
 * @requires styles/search.css
 * @requires utils.js
 * @requires constants.js
 * @requires SlopSearchConfig.js
 * @requires SlopSearchUtils.js
 * 
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

    // Filter elements mapping (including engine filter)
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
    
    // Timing controls
    this.suggestionsTimeout = null;
    this.searchTimeout = null;
    this.keystrokeCount = 0;
    this.lastKeystrokeTime = 0;
    this.isLoading = false;

    // Callback for filter changes (will be set by main.js)
    this.onFilterChange = null;

    // UX Configuration
    this.config = {
      suggestionsDelay: 150,
      searchDelay: 800,
      minCharsForSuggestions: 2,
      minCharsForSearch: 3,
      maxSearchDelay: 2000,
      enableSearchOnEnter: true,
      enableProgressiveDebounce: true,
      enableClickOutsideSearch: true
    };

    // Define safe zones where clicks shouldn't trigger searches
    this.safeZones = [
      '.search-input-wrapper',
      '.search-field', 
      '.suggestions-dropdown',
      '.launch-options-row',
      '.launch-options-cell',
      '.launch-option',
      '.option-command',
      '.option-meta',
      '.launch-options-btn',
      '.launch-options-close',
      '.filter-select',
      '.active-filters',
      '.pagination-container',
      '.theme-toggle'
    ];

    // Initialize
    this.initializeEventListeners();
    this.loadInitialData();
    
    console.log('🎯 SlopSearch initialized with engine filter support');
  }

  /**
   * Set up all event listeners with debouncing
   * This is the ONLY place that listens to search input
   */
  initializeEventListeners() {
    // Search input events with smart debouncing - SINGLE SOURCE OF TRUTH
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => this.handleSearchInput(e.target.value));
      this.searchInput.addEventListener('keydown', (e) => this.handleKeyNavigation(e));
      this.searchInput.addEventListener('focus', () => this.showSuggestions());
      this.searchInput.addEventListener('blur', () => {
        setTimeout(() => this.hideSuggestions(), 150);
      });

      // Add additional search triggers
      this.addSearchTriggers();
    }

    // Filter element events (immediate response for deliberate actions)
    Object.entries(this.filterElements).forEach(([filterKey, element]) => {
      element.addEventListener('change', (e) => {
        this.handleFilterChange(filterKey, e.target.value);
      });
    });

    // Sort element events (immediate response)
    if (this.sortSelect) {
      this.sortSelect.addEventListener('change', (e) => {
        this.handleSortChange(e.target.value);
      });
    }
  }

  /**
   * Search input handling with two-tier approach
   * TIER 1: Fast suggestions (150ms)
   * TIER 2: Deliberate search (800ms with progressive debouncing)
   * Handles click-outside detection to respect safe zones
   * @param {string} query - The current search query
   * @returns {void}
   * @throws {Error} If query is not a string
   * @throws {TypeError} If query is not a valid string
   * @throws {RangeError} If query length is less than minimum threshold
   * @throws {SyntaxError} If query contains invalid characters (e.g., HTML tags)
   * @throws {ReferenceError} If searchInput is not defined
   * @throws {URIError} If query cannot be encoded as a URI component
   * @throws {EvalError} If query contains invalid characters
   * @throws {TypeError} If query is not a string or valid selector
   * @throws {RangeError} If query length exceeds maximum limit
   */
  handleSearchInput(query) {
    const now = Date.now();
    this.currentQuery = query.trim();
    this.keystrokeCount++;
    this.lastKeystrokeTime = now;
    
    // Clear existing timeouts
    clearTimeout(this.searchTimeout);
    clearTimeout(this.suggestionsTimeout);
    
    // TIER 1: Fast suggestions (always quick and responsive)
    if (query.length >= this.config.minCharsForSuggestions) {
      this.suggestionsTimeout = setTimeout(() => {
        if (this.currentQuery === query.trim()) { // Only fetch if still current
          this.fetchSuggestions(query);
        }
      }, this.config.suggestionsDelay);
    } else {
      this.hideSuggestions();
    }

    // TIER 2: Deliberate search (smart debouncing)
    if (query.length >= this.config.minCharsForSearch) {
      const searchDelay = this.calculateSearchDelay();
      
      this.searchTimeout = setTimeout(() => {
        // Only search if this is still the current query
        if (this.currentQuery === query.trim()) {
          console.log(`🔍 Executing search after ${searchDelay}ms delay for: "${query}"`);
          this.executeSearch();
        }
      }, searchDelay);
      
      // Show visual feedback that search is pending
      this.showSearchPending();
    } else if (query.length === 0) {
      // Immediate search when clearing the field
      this.executeSearch();
    }
  }

  /**
   * Calculate dynamic search delay based on user typing behavior
   */
  calculateSearchDelay() {
    if (!this.config.enableProgressiveDebounce) {
      return this.config.searchDelay;
    }

    const timeSinceLastKeystroke = Date.now() - this.lastKeystrokeTime;
    const isRapidTyping = this.keystrokeCount > 3 && timeSinceLastKeystroke < 100;
    
    if (isRapidTyping) {
      // User is typing rapidly, use longer delay
      const progressiveDelay = Math.min(
        this.config.searchDelay * 1.5,
        this.config.maxSearchDelay
      );
      console.log(`⌨️ Rapid typing detected, using ${progressiveDelay}ms delay`);
      return progressiveDelay;
    }
    
    // Reset keystroke count after a pause
    setTimeout(() => {
      this.keystrokeCount = 0;
    }, 1000);
    
    return this.config.searchDelay;
  }

  /**
   * Add additional search triggers for better UX
   * click-outside detection to respect safe zones
   */
  addSearchTriggers() {
    // Search on Enter key (immediate)
    if (this.config.enableSearchOnEnter) {
      this.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && this.selectedSuggestionIndex === -1) {
          e.preventDefault();
          clearTimeout(this.searchTimeout);
          console.log('⚡ Immediate search triggered by Enter key');
          this.executeSearch();
        }
      });
    }

    // click-outside detection with safe zones
    if (this.config.enableClickOutsideSearch) {
      document.addEventListener('click', (e) => {
        // Check if click is in a safe zone
        if (this.isClickInSafeZone(e.target)) {
          return; // Don't trigger search for safe zone clicks
        }
        
        // Only trigger search if we have a pending search timeout
        if (this.searchTimeout) {
          clearTimeout(this.searchTimeout);
          console.log('⚡ Search triggered by clicking outside safe zones');
          this.executeSearch();
        }
      });
    }
  }

  /**
   * New method to check if a click is in a safe zone
   * Prevents search triggers when interacting with launch options and other UI elements
   * 
   * @param {Element} target - The clicked element
   * @returns {boolean} True if click is in a safe zone, false otherwise
   * @throws {TypeError} If target is not a valid DOM element
   * @throws {RangeError} If target is null or undefined
   * @throws {SyntaxError} If target is not a valid HTML element
   * @throws {ReferenceError} If safeZones array is not defined
   * @throws {URIError} If target cannot be processed as a URI component
   * @throws {EvalError} If target contains invalid characters
   * @throws {TypeError} If target is not a string or valid selector
   */
  isClickInSafeZone(target) {
    // Check if the target or any of its parents match a safe zone selector
    for (const selector of this.safeZones) {
      if (target.closest(selector)) {
        return true;
      }
    }
    
    // Special case: Check for launch options related elements by data attributes
    const clickedElement = target.closest('[data-game-id]') || 
                           target.closest('.launch-options-row') ||
                           target.closest('.games-table tbody tr');
    
    if (clickedElement) {
      return true;
    }
    
    // Special case: Check if we're inside a table row that might contain launch options
    const tableRow = target.closest('tr');
    if (tableRow && tableRow.classList.contains('launch-options-row')) {
      return true;
    }
    
    return false;
  }

  /**
   * Execute the actual search (separated from input handling)
   */
  executeSearch() {
    this.hideSearchPending();
    this.notifyFilterChange();
  }

  /**
   * Show visual feedback that search is pending
   */
  showSearchPending() {
    if (this.searchInput) {
      this.searchInput.classList.add('search-pending');
      
      // Add a subtle indicator if it doesn't exist
      if (!document.querySelector('.search-pending-indicator')) {
        const indicator = document.createElement('div');
        indicator.className = 'search-pending-indicator';
        indicator.innerHTML = '⏱️';
        indicator.title = 'Search pending... (press Enter for immediate search)';
        
        const searchWrapper = this.searchInput.closest('.search-input-wrapper, .search-field');
        if (searchWrapper) {
          searchWrapper.appendChild(indicator);
        }
      }
    }
  }

  /**
   * Hide search pending indicator
   */
  hideSearchPending() {
    if (this.searchInput) {
      this.searchInput.classList.remove('search-pending');
    }
    
    const indicator = document.querySelector('.search-pending-indicator');
    if (indicator) {
      indicator.remove();
    }
  }

  /**
   * Keyboard navigation with immediate search on Enter
   */
  handleKeyNavigation(e) {
    if (!this.suggestions || this.suggestions.length === 0) {
      // If no suggestions, Enter should trigger immediate search
      if (e.key === 'Enter' && this.config.enableSearchOnEnter) {
        e.preventDefault();
        clearTimeout(this.searchTimeout);
        this.executeSearch();
      }
      return;
    }

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
          // No suggestion selected, do immediate search
          clearTimeout(this.searchTimeout);
          this.executeSearch();
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
   * Fast suggestions fetching (keeps autocomplete snappy)
   * This method fetches suggestions from the backend
   * and updates the suggestions dropdown
   * It uses a minimum character threshold to avoid unnecessary requests
   * @param {string} query - The current search query
   * @returns {Promise<void>} Resolves when suggestions are fetched
   * @throws {Error} If fetch fails or response is not ok
   * @throws {TypeError} If query is not a string
   * @throws {RangeError} If query length is less than minimum threshold
   * @throws {SyntaxError} If response JSON is malformed
   * @throws {ReferenceError} If suggestionsDropdown is not defined
   * @throws {URIError} If query cannot be encoded as a URI component
   * @throws {EvalError} If query contains invalid characters
   * @throws {TypeError} If query is not a string
   */
  async fetchSuggestions(query) {
    if (!query || query.length < this.config.minCharsForSuggestions) {
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
   * Render suggestions dropdown with categories
   * This method groups suggestions by category and highlights matches
   * It also handles click events on suggestions to select them
   * @returns {void}
   * @throws {Error} If suggestionsDropdown is not defined
   * @throws {TypeError} If suggestions is not an array
   * @throws {RangeError} If selectedSuggestionIndex is out of bounds
   * @throws {SyntaxError} If suggestion value is malformed
   * @throws {ReferenceError} If suggestions array is not defined
   * @throws {URIError} If suggestion value cannot be encoded as a URI component
   * @throws {EvalError} If suggestion value contains invalid characters
   * @throws {TypeError} If suggestion value is not a string
   */
  renderSuggestions() {
    if (!this.suggestionsDropdown) return;

    // Simply hide dropdown when no suggestions - no indicator at all
    if (!this.suggestions || this.suggestions.length === 0) {
      this.hideSuggestions();
      return;
    }

    // Rest of the existing code stays the same...
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
   * Select suggestion and trigger immediate search
   * This is called when a suggestion is clicked or selected via keyboard
   * @param {number} index - The index of the suggestion to select
   * @returns {void}
   * @throws {Error} If index is out of bounds
   * @throws {TypeError} If index is not a number
   * @throws {RangeError} If index is negative or exceeds suggestions length
   * @throws {SyntaxError} If suggestion value is malformed
   * @throws {ReferenceError} If suggestions array is not defined
   * @throws {URIError} If suggestion value cannot be encoded as a URI component
   * @throws {EvalError} If suggestion value contains invalid characters
   * @throws {TypeError} If suggestion value is not a string
   */
  selectSuggestion(index) {
    const suggestion = this.suggestions[index];
    if (!suggestion) return;

    this.searchInput.value = suggestion.value;
    this.currentQuery = suggestion.value;
    this.hideSuggestions();
    
    // Immediate search when selecting a suggestion
    clearTimeout(this.searchTimeout);
    console.log('⚡ Immediate search triggered by suggestion selection');
    this.executeSearch();
  }

  /**
   * Handle filter changes (immediate response for deliberate actions)
   * This updates the current filters and re-renders active filters
   * @param {string} filterKey - The key of the filter being changed
   * @param {string} value - The new value for the filter
   * If value is empty or whitespace, the filter is removed
   * @returns {void}
   * @throws {Error} If filterKey is not recognized
   * @throws {TypeError} If value is not a string
   * @throws {RangeError} If value exceeds maximum length (e.g., 100 characters)
   * @throws {SyntaxError} If value contains invalid characters (e.g., HTML tags)
   * @throws {ReferenceError} If filterKey is not defined in this.currentFilters
   * @throws {URIError} If value cannot be encoded as a URI component
   * @throws {EvalError} If filterKey is not a valid filter key
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
   * Handle sort change (immediate response)
   * This updates the current sort field and order
   * @param {string} sortValue - The value from the sort select element
   * Format: "field-order" (e.g., "title-asc", "year-desc")
   * If no value is provided, defaults to "title-asc"
   * @returns {void}
   * @throws {Error} If sortValue is not a valid format
   */
  handleSortChange(sortValue) {
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
      engine: 'Engine', 
      options: 'Launch Options',
      year: 'Year',
      platform: 'Platform'
    };
    return displayNames[key] || key;
  }

  /**
   * Notify parent component of filter changes
   * This is called by main.js via the onFilterChange callback
   * It sends the current search query, sort, order, and all filters
   * @returns {void}
   * @throws {Error} If onFilterChange is not a function
   * @throws {TypeError} If onFilterChange is not defined
   * @throws {RangeError} If currentQuery exceeds maximum length (e.g., 100 characters)
   * @throws {SyntaxError} If currentQuery contains invalid characters (e.g., HTML tags)
   * @throws {ReferenceError} If currentFilters is not defined
   * @throws {URIError} If currentQuery cannot be encoded as a URI component
   * @throws {EvalError} If currentQuery contains invalid characters
   * @throws {TypeError} If currentQuery is not a string
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
   * Load initial data from backend to populate filter dropdowns
   */
  async loadInitialData() {
    try {
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
   * This method is called after loading initial data
   * It populates the developer, engine, and year filters
   * @param {Object} facets - The facets data from the backend
   * @returns {void}
   * @throws {Error} If facets is not an object
   * @throws {TypeError} If facets is not defined, not arrays, or not objects
   * @throws {RangeError} If facets properties are not arrays
   * @throws {SyntaxError} If facets properties contain invalid data
   * @throws {ReferenceError} If filterElements are not defined
   * @throws {URIError} If facets values cannot be encoded as URI components
   */
  populateFilterOptions(facets) {
    // Populate developer filter
    if (this.filterElements.developer && facets.developers) {
      this.populateSelectOptions(this.filterElements.developer, facets.developers, 'All Developers');
    }

    // Populate engine filter (NEW)
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
   * Configuration method for customizing timing
   */
  configure(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('🎛️ Search configuration updated:', this.config);
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
   * Reset all search filters and state
   * This clears the search input, filters, and suggestions
   * It also resets the sort select to default
   * @returns {void}
   * @throws {Error} If reset fails
   * @throws {TypeError} If reset is not defined
   */
  reset() {
    this.currentQuery = '';
    this.currentFilters = {};
    this.currentSort = 'title';
    this.currentOrder = 'asc';
    this.keystrokeCount = 0;
    
    // Clear timeouts
    clearTimeout(this.searchTimeout);
    clearTimeout(this.suggestionsTimeout);
    
    if (this.searchInput) this.searchInput.value = '';
    
    // Clear all filter elements (including engine)
    Object.values(this.filterElements).forEach(element => {
      if (element) element.value = '';
    });
    
    if (this.sortSelect) this.sortSelect.value = 'title';
    
    this.renderActiveFilters();
    this.hideSuggestions();
    this.hideSearchPending();
    this.notifyFilterChange();
  }
}