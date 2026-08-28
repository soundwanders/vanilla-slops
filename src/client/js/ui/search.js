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
import { DEFAULT_SORT, DEFAULT_ORDER } from '../constants.js';

export default class SlopSearch {
  constructor({
    inputId = 'searchInput',
    suggestionsId = 'suggestionsDropdown',
    resultsId = 'resultsList',
    resultsCountId = 'resultsCount',
    activeFiltersId = 'activeFilters',
    sortId = 'sortSelect',
    filters = {},
    defaultSort = DEFAULT_SORT,
    defaultOrder = DEFAULT_ORDER
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

    // State management. Sort defaults must match the app's initial state — this
    // component sends sort/order on every notify, so a mismatch here silently
    // knocks the front page off "featured" the first time a filter changes.
    this.defaultSort = defaultSort;
    this.defaultOrder = defaultOrder;
    this.currentQuery = '';
    this.currentFilters = {};
    this.currentSort = defaultSort;
    this.currentOrder = defaultOrder;
    this.suggestions = [];
    this.popularOptions = []; // set from facets by main.js; shown on empty focus
    this.selectedSuggestionIndex = -1;
    this.activeFiltersBound = false; // active-filter clicks use one delegated listener
    
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
    
    console.log('🍓 SlopSearch initialized with engine filter support');
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
      this.searchInput.addEventListener('focus', () => this.handleFocus());
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
   * Debounces search input using a two-tier strategy: fast suggestions at 150ms,
   * deliberate API search at 800ms with progressive delay on rapid typing.
   * @param {string} query - The current search query
   */
  handleSearchInput(query) {
    const now = Date.now();
    this.currentQuery = query.trim();
    this.keystrokeCount++;
    this.lastKeystrokeTime = now;

    // Typing a text query supersedes an active "search by launch option" filter.
    if (this.currentQuery && this.currentFilters.optionSearch) {
      delete this.currentFilters.optionSearch;
      this.renderActiveFilters();
    }

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

    // TIER 2: The table no longer refetches on every keystroke — that caused
    // the results to churn and flash skeletons as you typed. Live suggestions
    // (TIER 1) give the as-you-type feedback; the table updates only on an
    // explicit action: Enter, picking a suggestion, clicking away, or clearing
    // the box (which restores the full list immediately, below).
    this.hideSearchPending();
    if (query.length === 0) {
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
   * Add search triggers to boost UX
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
      html += `<div class="suggestion-category-header">${this.escapeHtml(category)}</div>`;
      items.forEach(item => {
        const isSelected = item.originalIndex === this.selectedSuggestionIndex;
        const isOption = item.type === 'option';
        // A fuzzy row is a correction, not a match: by definition the query does
        // not occur in it, so highlighting would either find nothing or — worse —
        // find an incidental fragment and imply the user typed it.
        const isFuzzy = item.fuzzy === true;
        const label = isFuzzy
          ? this.escapeHtml(item.value)
          : this.highlightMatch(item.value, this.currentQuery);
        // Launch options render as a monospace command + a muted description so
        // people can recognize what a flag does without knowing it beforehand.
        const body = isOption
          ? `<code class="suggestion-cmd">${label}</code>` +
            (item.description ? `<span class="suggestion-desc">${this.escapeHtml(item.description)}</span>` : '')
          : `<span class="suggestion-value">${label}</span>`;
        html += `
          <div class="suggestion-item ${isSelected ? 'highlighted' : ''} ${isOption ? 'suggestion-option' : ''} ${isFuzzy ? 'suggestion-fuzzy' : ''}"
              data-index="${item.originalIndex}"
              data-type="${this.escapeHtml(item.type || '')}"
              data-value="${this.escapeAttr(item.value)}">
            ${body}
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
   * Highlight the typed text where it occurs in a suggestion.
   *
   * The query is escaped TWICE and the two escapes are not interchangeable.
   * `escapeHtml` makes it safe to put in the document; `escapeRegExp` makes it
   * safe to compile. Skipping the second one was a real defect, not a
   * theoretical one: a query of `c++` compiled to /(c++)/ and threw "Nothing to
   * repeat", and because `renderSuggestions` is called inside
   * `fetchSuggestions`' try block, the throw was caught and turned into
   * `hideSuggestions()`. Typing a `+` or a `[` did not mis-highlight — it
   * silently removed the dropdown entirely, with the reason visible only in the
   * console.
   *
   * The quieter half of the same bug: `.` and `*` compiled fine and matched the
   * wrong things, so searching `s.t.a.l.k.e.r.` highlighted characters the user
   * had not typed.
   *
   * Escaping HTML before building the pattern is deliberate and has to stay in
   * this order — the pattern is run against already-escaped text, so an `&` in
   * the query has to have become `&amp;` on both sides for the two to meet.
   */
  highlightMatch(text, query) {
    if (!query) return this.escapeHtml(text);

    const escapedText = this.escapeHtml(text);
    const pattern = this.escapeRegExp(this.escapeHtml(query));
    if (!pattern) return escapedText;

    return escapedText.replace(new RegExp(`(${pattern})`, 'gi'), '<mark>$1</mark>');
  }

  /**
   * Neutralise every character that carries meaning in a regular expression, so
   * a user's search text is matched as the literal string they typed.
   */
  escapeRegExp(text) {
    return String(text ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
   * Escape a value destined for a quoted HTML attribute.
   *
   * escapeHtml() serialises a text node, which leaves quotes alone — fine for
   * element content, but a value like `Bloody "Nine" Games` would close the
   * attribute early. Attribute positions need this instead.
   */
  escapeAttr(text) {
    return this.escapeHtml(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

    clearTimeout(this.searchTimeout);

    // Picking a launch option searches by that command (not the title). Clear
    // the text query and record it as an active filter so the user can remove it.
    if (suggestion.type === 'option') {
      this.currentFilters.optionSearch = suggestion.value;
      this.currentQuery = '';
      if (this.searchInput) this.searchInput.value = '';
      this.hideSuggestions();
      this.renderActiveFilters();
      this.notifyFilterChange();
      return;
    }

    this.searchInput.value = suggestion.value;
    this.currentQuery = suggestion.value;
    this.hideSuggestions();

    // Immediate search when selecting a suggestion
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
   *
   * The whole tag is the remove button, not just the `×`. A tag-sized target is
   * reachable on touch where a ~24px glyph is not, and the mobile styles already
   * gave the full tag a press-down state, so anything smaller was a lie. The `×`
   * is kept as a decorative affordance and hidden from assistive tech — the
   * label lives on the button that actually does the work.
   */
  /**
   * Fills and wires the "Browse by launch option" row beneath the filter grid.
   *
   * Command filtering already worked before this existed — `optionSearch` has
   * always been a filter, and the suggestion dropdown has always offered these
   * same commands. The problem was that the only way to reach it was to focus
   * the search box and type nothing, under a placeholder reading "Search
   * games…", which announces the opposite. A browse affordance you can only
   * find by not using the control it hides behind is not discoverable.
   *
   * Stays hidden until there is something to show, so a facets failure leaves
   * no empty furniture behind.
   */
  renderOptionBrowser() {
    const root = document.getElementById('optionBrowser');
    const chips = document.getElementById('obChips');
    const panel = document.getElementById('obPanel');
    const toggle = root?.querySelector('.ob-toggle');
    const count = document.getElementById('obCount');
    if (!root || !chips || !panel || !toggle) return;

    const options = Array.isArray(this.popularOptions) ? this.popularOptions : [];
    if (!options.length) {
      root.hidden = true;
      return;
    }

    chips.innerHTML = options.map((o, i) => `
      <li class="ob-chip-item">
        <button type="button"
                class="ob-chip"
                data-command="${this.escapeAttr(o.command)}"
                title="${this.escapeAttr(o.description || o.command)}"
                aria-pressed="false"
                aria-label="Filter by ${this.escapeAttr(o.command)}, used by ${o.count} games"
                style="--ob-i:${i}">
          <code class="ob-chip-cmd">${this.escapeHtml(o.command)}</code>
          <span class="ob-chip-count">${o.count}</span>
        </button>
      </li>
    `).join('');

    if (count) count.textContent = String(options.length);
    root.hidden = false;

    if (root.dataset.wired === 'true') return;
    root.dataset.wired = 'true';

    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      panel.hidden = !open;
      // The stagger is an entrance, so it is re-armed on each open rather than
      // left on the element, where it would replay on any unrelated repaint.
      if (open) {
        chips.classList.remove('is-entering');
        void chips.offsetWidth;
        chips.classList.add('is-entering');
      }
    });

    chips.addEventListener('click', (e) => {
      const chip = e.target.closest('.ob-chip');
      if (!chip) return;

      // Clicking the chip that is already applied clears it. Without this the
      // only way back out was to find the filter tag further down the page and
      // dismiss it there — so a mis-click cost a scroll and a second target,
      // and the chip row lied about its own state by staying lit with no way
      // to unlight it. A control that applies something should release it.
      const command = chip.dataset.command;
      const alreadyApplied = this.currentFilters.optionSearch === command;

      if (alreadyApplied) {
        delete this.currentFilters.optionSearch;
      } else {
        // Otherwise: exactly what picking a launch option from the suggestion
        // dropdown does — same filter key, same teardown — so the two paths
        // cannot drift.
        this.currentFilters.optionSearch = command;
      }

      this.currentQuery = '';
      if (this.searchInput) this.searchInput.value = '';
      this.hideSuggestions();
      this.syncBrowseChipState();
      this.renderActiveFilters();
      this.notifyFilterChange();
    });

    this.syncBrowseChipState();
  }

  /**
   * Mirror the applied launch-option filter onto the browse chips.
   *
   * The chip row and the filter tags are two views of one piece of state, so
   * whichever one the visitor uses to change it, both have to end up agreeing.
   * Called after a chip click, and after any path that clears filters — a tag
   * dismissal, "Clear all", or a fresh search — so a chip can never stay lit
   * for a filter that is no longer applied.
   *
   * @returns {void}
   */
  syncBrowseChipState() {
    const applied = this.currentFilters?.optionSearch || null;
    document.querySelectorAll('.ob-chip').forEach((chip) => {
      const isOn = chip.dataset.command === applied;
      chip.setAttribute('aria-pressed', String(isOn));
      chip.classList.toggle('is-applied', isOn);
    });
  }

  renderActiveFilters() {
    // Before the guard: the chips live outside `activeFilters`, so they still
    // need syncing on a page where the tag strip is absent.
    this.syncBrowseChipState();
    if (!this.activeFilters) return;

    const filterTags = Object.entries(this.currentFilters).map(([key, value]) => {
      const displayKey = this.getFilterDisplayName(key);
      const displayValue = this.getFilterDisplayValue(key, value);
      // Doubles as the hover tooltip, so a truncated value stays readable
      const label = `Remove ${displayKey} filter: ${displayValue}`;
      return `
        <button type="button" class="filter-tag" data-key="${this.escapeAttr(key)}"
                aria-label="${this.escapeAttr(label)}" title="${this.escapeAttr(label)}">
          <span class="filter-key">${this.escapeHtml(displayKey)}:</span>
          <span class="filter-value">${this.escapeHtml(displayValue)}</span>
          <span class="filter-remove" aria-hidden="true">×</span>
        </button>
      `;
    }).join('');

    // Offer a one-click "Clear all" once more than one filter is active
    const activeCount = Object.keys(this.currentFilters).length;
    const clearAll = activeCount > 1
      ? `<button class="filter-clear-all" type="button" aria-label="Clear all filters">Clear all</button>`
      : '';

    this.activeFilters.innerHTML = filterTags + clearAll;

    // One delegated listener survives every re-render, so it is bound once
    if (!this.activeFiltersBound) {
      this.activeFilters.addEventListener('click', (event) => {
        // Clear-all is a sibling of the tags — check it before the tag lookup
        if (event.target.closest('.filter-clear-all')) {
          this.reset();
          return;
        }
        const tag = event.target.closest('.filter-tag');
        if (tag && tag.dataset.key) this.removeFilter(tag.dataset.key);
      });
      this.activeFiltersBound = true;
    }
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
      risk: 'Risk',
      optionSearch: 'Launch option',
      developer: 'Developer',
      engine: 'Engine',
      options: 'Launch Options',
      year: 'Year',
      platform: 'Platform'
    };
    return displayNames[key] || key;
  }

  /**
   * Human-readable value for a filter chip (e.g. risk "safe" -> "Safe").
   * @param {string} key - Filter key
   * @param {string} value - Raw filter value
   * @returns {string} Display value
   */
  getFilterDisplayValue(key, value) {
    if (key === 'risk') {
      const riskLabels = { safe: 'Safe', caution: 'Caution', experimental: 'Experimental' };
      return riskLabels[value] || value;
    }
    if (key === 'options') {
      const optionLabels = {
        'has-options': 'Has options',
        'no-options': 'No options',
        'many-options': '5+ options',
        'few-options': '1–4 options'
      };
      return optionLabels[value] || value;
    }
    return value;
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
    };

    // Include every registered filter key explicitly — removed filters must
    // send '' so downstream MERGE_FILTERS overwrites the stale value in state.
    // Spreading currentFilters alone omits removed keys, leaving them stuck on.
    Object.keys(this.filterElements).forEach((key) => {
      allFilters[key] = this.currentFilters[key] || '';
    });

    // optionSearch has no DOM control (it's set by picking an option suggestion),
    // so include it explicitly — and always send it so clearing it propagates.
    allFilters.optionSearch = this.currentFilters.optionSearch || '';

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
      this.populateSelectOptions(this.filterElements.developer, facets.developers);
    }

    // Populate engine filter (NEW)
    if (this.filterElements.engine && facets.engines) {
      this.populateSelectOptions(this.filterElements.engine, facets.engines);
    }

    // Populate year filter
    if (this.filterElements.year && facets.releaseYears) {
      const yearOptions = facets.releaseYears.map(year => ({ value: year, count: 0 }));
      this.populateSelectOptions(this.filterElements.year, yearOptions);
    }
  }

  /**
   * Append facet options to a select that already has its placeholder.
   *
   * There is deliberately no defaultText parameter. Callers used to pass one
   * ('All Developers', 'All Engines', 'All Years') and this never read it,
   * because index.html already carries the matching `<option value="">` on each
   * select. Two copies of the same string, one of them inert — the markup owns
   * it, so the markup keeps it.
   */
  populateSelectOptions(selectElement, options) {
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
   * On focus: if the box is empty, surface popular launch options so people can
   * discover and pick one without knowing the exact flag. Otherwise, reveal any
   * existing suggestions.
   */
  handleFocus() {
    const q = (this.searchInput.value || '').trim();
    if (!q && Array.isArray(this.popularOptions) && this.popularOptions.length) {
      this.suggestions = this.popularOptions.map(o => ({
        type: 'option',
        value: o.command,
        description: o.description || '',
        category: 'Popular launch options'
      }));
      this.selectedSuggestionIndex = -1;
      this.renderSuggestions();
    } else {
      this.showSuggestions();
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
    this.currentSort = this.defaultSort;
    this.currentOrder = this.defaultOrder;
    this.keystrokeCount = 0;
    
    // Clear timeouts
    clearTimeout(this.searchTimeout);
    clearTimeout(this.suggestionsTimeout);
    
    if (this.searchInput) this.searchInput.value = '';
    
    // Clear all filter elements (including engine)
    Object.values(this.filterElements).forEach(element => {
      if (element) element.value = '';
    });
    
    if (this.sortSelect) this.sortSelect.value = `${this.defaultSort}-${this.defaultOrder}`;

    this.renderActiveFilters();
    this.hideSuggestions();
    this.hideSearchPending();
    this.notifyFilterChange();
  }
}