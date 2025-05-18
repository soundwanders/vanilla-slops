export function setupFilters(onFilterChange) {
  const searchInput = document.getElementById('search-input');
  const typeInputs = document.querySelectorAll('[name="game-type"]');

  let debounceTimer;

  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const search = e.target.value;
      const types = getSelectedTypes();
      onFilterChange({ search, types });
    }, 300);
  });

  typeInputs.forEach(input => {
    input.addEventListener('change', () => {
      const types = getSelectedTypes();
      onFilterChange({ types });
    });
  });

  function getSelectedTypes() {
    return Array.from(typeInputs)
      .filter(el => el.checked)
      .map(el => el.value);
  }
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
