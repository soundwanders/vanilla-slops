// Set up SEARCH FILTERS
export function setupFilters(onChange) {
  const form = document.getElementById('search-form-component');
  if (!form) return;

  // Update URL params without reloading
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


export function getFilters() {
  return {
    search: document.getElementById('search-input').value.trim(),
    genre: document.getElementById('genre-filter').value,
    engine: document.getElementById('engine-filter').value,
    platform: document.getElementById('platform-filter').value,
    sort: document.getElementById('sort-order').value, // 'asc' or 'desc'
  };
}
