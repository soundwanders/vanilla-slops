/**
 * Set up search filters and handle changes to inputs
 * 
 * @param {Function} onChange - Callback function to execute when filters change.
 * 
 * @returns {void}
 */
export function setupFilters(onChange) {
  const form = document.getElementById('search-form-component');
  if (!form) return;

  /**
   * Update URL parameters without reloading page
   * 
   * @param {Object} filters - current filter values
   * @param {string} [filters.searchQuery] - search query 
   * @param {string} [filters.genre] - selected genre 
   * @param {string} [filters.engine] - selected engine 
   * @param {string} [filters.platform] - selected platform 
   * @param {string} [filters.sort] - selected sort order ('asc' or 'desc')
   * 
   * @returns {void}
   */
  const updateURL = (filters) => {
    const params = new URLSearchParams();

    if (filters.searchQuery) params.set('search', filters.searchQuery);
    if (filters.genre) params.set('genre', filters.genre);
    if (filters.engine) params.set('engine', filters.engine);
    if (filters.platform) params.set('platform', filters.platform);
    if (filters.sort) params.set('sort', filters.sort);

    history.replaceState(null, '', `?${params.toString()}`);
  };

  const handleChange = () => {
    const newFilters = {
      searchQuery: form.search.value.trim(),
      genre: form.genre.value,
      engine: form.engine.value,
      platform: form.platform.value,
      sort: form.sort.value,
    };

    updateURL(newFilters);
    onChange(newFilters);
  };

  ['genre', 'engine', 'platform', 'sort'].forEach((name) => {
    form[name].addEventListener('change', handleChange);
  });

  // Debounced search input
  let debounceTimeout;
  form.search.addEventListener('input', () => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(handleChange, 300);
  });
}

/**
 * Get current filter values from the DOM
 * 
 * @returns {Object} - The current filter values
 * @returns {string} [search] - The search query string
 * @returns {string} [genre] - The selected genre filter
 * @returns {string} [engine] - The selected engine filter
 * @returns {string} [platform] - The selected platform filter
 * @returns {string} [sort] - The selected sort order ('asc' or 'desc')
 */
export function getFilters() {
  return {
    search: document.getElementById('search-input').value.trim(),
    genre: document.getElementById('genre-filter').value,
    engine: document.getElementById('engine-filter').value,
    platform: document.getElementById('platform-filter').value,
    sort: document.getElementById('sort-order').value, // 'asc' or 'desc'
  };
}
