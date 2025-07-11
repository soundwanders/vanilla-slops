/**
 * @fileoverview Filter management system for Vanilla Slops
 * Handles search filters, URL state management, and dynamic filter population
 * Integrates with Steam Launch Options API for real-time filter data
 */

/**
 * Set up search filters and handle changes to inputs
 * Initializes event listeners, populates dynamic options, and manages filter state
 *
 * @param {Function} onChange - Callback function to execute when filters change
 * @param {Object} onChange.filters - The updated filter object
 * @param {string} [onChange.filters.searchQuery] - Search query string
 * @param {string} [onChange.filters.category] - Selected category filter
 * @param {string} [onChange.filters.developer] - Selected developer filter
 * @param {string} [onChange.filters.engine] - Selected engine filter
 * @param {string} [onChange.filters.options] - Launch options filter type
 * @param {string} [onChange.filters.sort] - Sort field and order
 * @returns {void}
 */
export function setupFilters(onChange) {
  // Support both old form-based approach and new direct element approach
  const form = document.getElementById('search-form-component');
  const searchInput = document.getElementById('searchInput');
  
  if (!form && !searchInput) {
    console.warn('No filter form or search input found');
    return;
  }

  /**
   * Update URL parameters without reloading page
   * Maintains browser history and enables deep linking
   *
   * @param {Object} filters - Current filter values
   * @param {string} [filters.searchQuery] - Search query
   * @param {string} [filters.category] - Selected category
   * @param {string} [filters.developer] - Selected developer
   * @param {string} [filters.engine] - Selected engine
   * @param {string} [filters.options] - Launch options filter
   * @param {string} [filters.sort] - Selected sort order
   * @returns {void}
   */
  const updateURL = (filters) => {
    const params = new URLSearchParams();

    // Only add non-empty parameters to keep URLs clean
    if (filters.searchQuery?.trim()) params.set('search', filters.searchQuery.trim());
    if (filters.category) params.set('category', filters.category);
    if (filters.developer) params.set('developer', filters.developer);
    if (filters.engine) params.set('engine', filters.engine);
    if (filters.options) params.set('options', filters.options);
    if (filters.sort && filters.sort !== 'title-asc') params.set('sort', filters.sort);

    const newURL = params.toString() ? `?${params.toString()}` : window.location.pathname;
    history.replaceState(null, '', newURL);
  };

  /**
   * Extract current filter values from form or individual elements
   * Supports both legacy form-based and modern element-based approaches
   *
   * @returns {Object} Current filter values
   */
  const getCurrentFilters = () => {
    if (form) {
      // Legacy form-based approach
      return {
        searchQuery: form.search?.value?.trim() || '',
        category: form.category?.value || '',
        developer: form.developer?.value || '',
        engine: form.engine?.value || '',
        options: form.options?.value || '',
        sort: form.sort?.value || 'title-asc'
      };
    } else {
      // Modern element-based approach
      return {
        searchQuery: document.getElementById('searchInput')?.value?.trim() || '',
        category: document.getElementById('categoryFilter')?.value || '',
        developer: document.getElementById('developerFilter')?.value || '',
        engine: document.getElementById('engineFilter')?.value || '',
        options: document.getElementById('optionsFilter')?.value || '',
        sort: document.getElementById('sortSelect')?.value || 'title-asc'
      };
    }
  };

  /**
   * Handle filter changes and notify parent component
   * Debounces rapid changes and updates URL state
   *
   * @returns {void}
   */
  const handleChange = () => {
    const newFilters = getCurrentFilters();
    updateURL(newFilters);
    onChange(newFilters);
  };

  // Set up event listeners based on available elements
  if (form) {
    // Legacy form-based setup
    ['category', 'developer', 'engine', 'options', 'sort'].forEach((name) => {
      const element = form[name];
      if (element) {
        element.addEventListener('change', handleChange);
      }
    });

    // Debounced search input
    let debounceTimeout;
    if (form.search) {
      form.search.addEventListener('input', () => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(handleChange, 300);
      });
    }
  } else {
    // Modern element-based setup
    const filterElements = [
      'categoryFilter',
      'developerFilter', 
      'engineFilter',
      'optionsFilter',
      'sortSelect'
    ];

    filterElements.forEach(elementId => {
      const element = document.getElementById(elementId);
      if (element) {
        element.addEventListener('change', handleChange);
      }
    });

    // Debounced search input
    let debounceTimeout;
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(handleChange, 300);
      });
    }
  }

  // Initialize filters with current URL parameters
  initializeFromURL();
  
  // Set up dynamic filter population
  initializeDynamicFilters();
  
  // Hide problematic filters and improve existing ones
  improveFilterUI();
}

/**
 * Initialize filter values from URL parameters
 * Enables deep linking and browser back/forward support
 *
 * @returns {void}
 */
function initializeFromURL() {
  const params = new URLSearchParams(window.location.search);
  
  // Set search input
  const searchQuery = params.get('search');
  if (searchQuery) {
    const searchInput = document.getElementById('searchInput') || 
                      document.querySelector('form#search-form-component input[name="search"]');
    if (searchInput) {
      searchInput.value = searchQuery;
    }
  }

  // Set filter dropdowns
  const filterMappings = {
    category: ['categoryFilter', 'category'],
    developer: ['developerFilter', 'developer'], 
    engine: ['engineFilter', 'engine'],
    options: ['optionsFilter', 'options'],
    sort: ['sortSelect', 'sort']
  };

  Object.entries(filterMappings).forEach(([paramName, [elementId, formName]]) => {
    const value = params.get(paramName);
    if (value) {
      const element = document.getElementById(elementId) || 
                     document.querySelector(`form#search-form-component [name="${formName}"]`);
      if (element) {
        element.value = value;
      }
    }
  });
}

/**
 * Set up dynamic filter population from API
 * Populates dropdown options with real data from the backend
 *
 * @returns {void}
 */
function initializeDynamicFilters() {
  // Hide the problematic year filter
  hideYearFilter();
  
  // Create engine filter if it doesn't exist
  ensureEngineFilter();
  
  // Improve the options filter
  improveOptionsFilter();
  
  // Populate filters from API
  populateFiltersFromAPI();
}

/**
 * Hide the year filter that has no options
 * Removes visual clutter from the interface
 *
 * @returns {void}
 */
function hideYearFilter() {
  const yearFilter = document.getElementById('yearFilter');
  const yearFilterGroup = yearFilter?.closest('.filter-group');
  if (yearFilterGroup) {
    yearFilterGroup.style.display = 'none';
    console.log('Year filter hidden due to lack of options');
  }
}

/**
 * Ensure engine filter exists and is properly configured
 * Creates the filter if missing and populates with common engines
 *
 * @returns {void}
 */
function ensureEngineFilter() {
  let engineFilter = document.getElementById('engineFilter');
  
  if (!engineFilter) {
    engineFilter = createEngineFilter();
  }
  
  if (engineFilter && engineFilter.children.length <= 1) {
    populateEngineFilterWithDefaults(engineFilter);
  }
}

/**
 * Create a new engine filter element
 * Generates the HTML structure and inserts it in the correct position
 *
 * @returns {HTMLSelectElement|null} The created engine filter element
 */
function createEngineFilter() {
  const filtersContainer = document.querySelector('.filters-container');
  if (!filtersContainer) {
    console.warn('Filters container not found');
    return null;
  }

  // Create engine filter group
  const engineFilterGroup = document.createElement('div');
  engineFilterGroup.className = 'filter-group';
  
  const engineLabel = document.createElement('label');
  engineLabel.className = 'filter-label';
  engineLabel.textContent = 'Engine';
  engineLabel.setAttribute('for', 'engineFilter');
  
  const engineSelect = document.createElement('select');
  engineSelect.className = 'filter-select';
  engineSelect.id = 'engineFilter';
  
  // Add default option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'All Engines';
  engineSelect.appendChild(defaultOption);
  
  engineFilterGroup.appendChild(engineLabel);
  engineFilterGroup.appendChild(engineSelect);
  
  // Insert after the developer filter, or at the end if not found
  const developerFilterGroup = document.querySelector('#developerFilter')?.closest('.filter-group');
  if (developerFilterGroup) {
    developerFilterGroup.insertAdjacentElement('afterend', engineFilterGroup);
  } else {
    filtersContainer.appendChild(engineFilterGroup);
  }
  
  console.log('Engine filter created');
  return engineSelect;
}

/**
 * Populate engine filter with common game engines
 * Provides useful default options before API data is loaded
 *
 * @param {HTMLSelectElement} engineFilter - The engine filter select element
 * @returns {void}
 */
function populateEngineFilterWithDefaults(engineFilter) {
  const commonEngines = [
    'Unity',
    'Unreal Engine',
    'Source Engine',
    'Creation Engine',
    'CryEngine',
    'Frostbite',
    'id Tech',
    'GameMaker',
    'Godot',
    'REDengine',
    'Custom Engine'
  ];
  
  commonEngines.forEach(engine => {
    const option = document.createElement('option');
    option.value = engine.toLowerCase().replace(/\s+/g, '-');
    option.textContent = engine;
    engineFilter.appendChild(option);
  });
  
  console.log('Engine filter populated with default options');
}

/**
 * Populate options filter with predefined options
 *
 * @returns {void}
 */
function improveOptionsFilter() {
  const optionsFilter = document.getElementById('optionsFilter');
  if (!optionsFilter) return;
  
  // Store current value to preserve selection
  const currentValue = optionsFilter.value;
  
  // Clear existing options
  optionsFilter.innerHTML = '';
  
  // Add improved options with custom labels
  const options = [
    { value: '', label: 'All Games' },
    { value: 'has-options', label: 'Has Launch Options' },
    { value: 'no-options', label: 'No Launch Options' },
    { value: 'many-options', label: '5+ Launch Options' },
    { value: 'few-options', label: '1-4 Launch Options' },
    { value: 'performance', label: 'Performance Options' },
    { value: 'graphics', label: 'Graphics Options' }
  ];
  
  options.forEach(({ value, label }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    optionsFilter.appendChild(option);
  });
  
  // Restore previous selection if it still exists
  if (currentValue && [...optionsFilter.options].some(opt => opt.value === currentValue)) {
    optionsFilter.value = currentValue;
  }
}

/**
 * Populate filters with data from the API
 * Fetches real data to populate dropdown options dynamically
 *
 * @async
 * @returns {Promise<void>}
 */
async function populateFiltersFromAPI() {
  try {
    // Use the same API endpoint as the main app
    const response = await fetch('/api/games/facets');
    if (!response.ok) {
      console.warn('Failed to fetch filter facets:', response.status);
      return;
    }
    
    const facets = await response.json();
    console.log('Filter facets loaded:', facets);
    
    // Populate developer filter
    populateSelectFilter('developerFilter', facets.developers, 'All Developers');
    
    // Populate engine filter with API data (if available)
    if (facets.engines && facets.engines.length > 0) {
      populateSelectFilter('engineFilter', facets.engines, 'All Engines');
    }
    
    // Populate category filter (if the API provides categories)
    if (facets.categories) {
      populateSelectFilter('categoryFilter', facets.categories, 'All Categories');
    }
    
  } catch (error) {
    console.warn('Could not populate filters from API:', error);
  }
}

/**
 * Populate a select filter with options from API data
 * Handles both string arrays and object arrays with counts
 *
 * @param {string} filterId - ID of the select element to populate
 * @param {Array} options - Array of options from API
 * @param {string} defaultText - Text for the default "all" option
 * @returns {void}
 */
function populateSelectFilter(filterId, options, defaultText) {
  const selectElement = document.getElementById(filterId);
  if (!selectElement || !Array.isArray(options) || options.length === 0) {
    return;
  }
  
  // Store current value to preserve selection
  const currentValue = selectElement.value;
  
  // Get existing options to avoid duplicates
  const existingValues = Array.from(selectElement.options).map(opt => opt.value);
  
  // Remove all options except the first one (default option)
  while (selectElement.children.length > 1) {
    selectElement.removeChild(selectElement.lastChild);
  }
  
  // Update default option text if needed
  if (selectElement.firstElementChild) {
    selectElement.firstElementChild.textContent = defaultText;
  }
  
  // Add new options
  options.forEach(option => {
    const value = typeof option === 'string' ? option : option.value;
    const count = typeof option === 'object' ? option.count : null;
    
    if (value && !existingValues.includes(value)) {
      const optionElement = document.createElement('option');
      optionElement.value = value;
      optionElement.textContent = count !== null ? `${value} (${count})` : value;
      selectElement.appendChild(optionElement);
    }
  });
  
  // Restore previous selection if it still exists
  if (currentValue && [...selectElement.options].some(opt => opt.value === currentValue)) {
    selectElement.value = currentValue;
  }
  
  console.log(`${filterId} populated with ${options.length} options`);
}

/**
 * Improved filter UI with styling and functionality
 * Adds custom styling and UX features
 *
 * @returns {void}
 */
function improveFilterUI() {
  // Add custom styling to select appearance
  addCustomSelectStyling();
  
  // Add loading states for filters
  addFilterLoadingStates();
  
  // Add filter clear functionality
  addFilterClearButton();
}

/**
 * Add custom styling for select elements
 * Improves the visual appearance of dropdown filters
 *
 * @returns {void}
 */
function addCustomSelectStyling() {
  const style = document.createElement('style');
  style.textContent = `
    /* Custom select arrow styling */
    .filter-select {
      appearance: none;
      background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
      background-position: right 0.5rem center;
      background-repeat: no-repeat;
      background-size: 1.5em 1.5em;
      padding-right: 2.5rem;
    }
    
    /* Dark theme support for custom select arrow */
    [data-theme="dark"] .filter-select {
      background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%9ca3af' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
    }
    
    /* Loading state for filters */
    .filter-select.loading {
      opacity: 0.6;
      pointer-events: none;
    }
    
    /* Smooth transitions */
    .filter-select {
      transition: border-color 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Add loading states for filters while data is being fetched
 * Provides visual feedback during API calls
 *
 * @returns {void}
 */
function addFilterLoadingStates() {
  const filterSelects = document.querySelectorAll('.filter-select');
  filterSelects.forEach(select => {
    select.classList.add('loading');
  });
  
  // Remove loading state after API call completes
  setTimeout(() => {
    filterSelects.forEach(select => {
      select.classList.remove('loading');
    });
  }, 2000);
}

/**
 * Add a clear all filters button
 * Allows users to easily reset all filter selections
 *
 * @returns {void}
 */
function addFilterClearButton() {
  const filtersContainer = document.querySelector('.filters-container');
  if (!filtersContainer) return;
  
  // Check if clear button already exists
  if (document.getElementById('clearFiltersBtn')) return;
  
  const clearButton = document.createElement('button');
  clearButton.id = 'clearFiltersBtn';
  clearButton.type = 'button';
  clearButton.className = 'btn btn-ghost btn-sm';
  clearButton.textContent = 'Clear All';
  clearButton.style.marginTop = 'auto'; // Align to bottom of filter group
  
  clearButton.addEventListener('click', () => {
    clearAllFilters();
  });
  
  // Add to filters container
  const clearGroup = document.createElement('div');
  clearGroup.className = 'filter-group';
  clearGroup.appendChild(clearButton);
  filtersContainer.appendChild(clearGroup);
}

/**
 * Clear all filter selections
 * Resets all filters to their default state
 *
 * @returns {void}
 */
function clearAllFilters() {
  // Clear search input
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.value = '';
  }
  
  // Clear all filter selects
  const filterSelects = document.querySelectorAll('.filter-select');
  filterSelects.forEach(select => {
    select.selectedIndex = 0;
  });
  
  // Clear sort select
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    sortSelect.value = 'title-asc';
  }
  
  // Clear URL parameters
  history.replaceState(null, '', window.location.pathname);
  
  // Trigger change event to update results
  const changeEvent = new Event('change', { bubbles: true });
  if (searchInput) {
    searchInput.dispatchEvent(changeEvent);
  }
  
  console.log('All filters cleared');
}

/**
 * Get current filter values from the DOM
 * Supports both legacy form-based and modern element-based approaches
 *
 * @returns {Object} The current filter values
 * @returns {string} [search] - The search query string
 * @returns {string} [category] - The selected category filter
 * @returns {string} [developer] - The selected developer filter
 * @returns {string} [engine] - The selected engine filter
 * @returns {string} [options] - The launch options filter type
 * @returns {string} [sort] - The selected sort order (e.g., 'title-asc', 'year-desc')
 */
export function getFilters() {
  // Try modern element-based approach first
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    return {
      search: searchInput.value?.trim() || '',
      category: document.getElementById('categoryFilter')?.value || '',
      developer: document.getElementById('developerFilter')?.value || '',
      engine: document.getElementById('engineFilter')?.value || '',
      options: document.getElementById('optionsFilter')?.value || '',
      sort: document.getElementById('sortSelect')?.value || 'title-asc'
    };
  }
  
  // Fallback to legacy form-based approach
  return {
    search: document.getElementById('search-input')?.value?.trim() || '',
    category: document.getElementById('category-filter')?.value || '',
    developer: document.getElementById('developer-filter')?.value || '',
    engine: document.getElementById('engine-filter')?.value || '',
    options: document.getElementById('options-filter')?.value || '',
    sort: document.getElementById('sort-order')?.value || 'title-asc'
  };
}

/**
 * Set filter values programmatically
 * Useful for restoring state or programmatic filter updates
 *
 * @param {Object} filters - Filter values to set
 * @param {string} [filters.search] - Search query to set
 * @param {string} [filters.category] - Category filter to set
 * @param {string} [filters.developer] - Developer filter to set
 * @param {string} [filters.engine] - Engine filter to set
 * @param {string} [filters.options] - Options filter to set
 * @param {string} [filters.sort] - Sort order to set
 * @returns {void}
 */
export function setFilters(filters) {
  if (filters.search !== undefined) {
    const searchInput = document.getElementById('searchInput') || document.getElementById('search-input');
    if (searchInput) searchInput.value = filters.search;
  }
  
  if (filters.category !== undefined) {
    const categoryFilter = document.getElementById('categoryFilter') || document.getElementById('category-filter');
    if (categoryFilter) categoryFilter.value = filters.category;
  }
  
  if (filters.developer !== undefined) {
    const developerFilter = document.getElementById('developerFilter') || document.getElementById('developer-filter');
    if (developerFilter) developerFilter.value = filters.developer;
  }
  
  if (filters.engine !== undefined) {
    const engineFilter = document.getElementById('engineFilter') || document.getElementById('engine-filter');
    if (engineFilter) engineFilter.value = filters.engine;
  }
  
  if (filters.options !== undefined) {
    const optionsFilter = document.getElementById('optionsFilter') || document.getElementById('options-filter');
    if (optionsFilter) optionsFilter.value = filters.options;
  }
  
  if (filters.sort !== undefined) {
    const sortSelect = document.getElementById('sortSelect') || document.getElementById('sort-order');
    if (sortSelect) sortSelect.value = filters.sort;
  }
}