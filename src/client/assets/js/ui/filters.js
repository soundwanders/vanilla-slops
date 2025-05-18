export function setupFilters(onFilterChange) {
  const searchInput = document.getElementById('search-input');
  const filterDLC = document.getElementById('filter-dlc');

  let debounceTimer;

  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      onFilterChange({
        search: e.target.value,
        hideDlc: filterDLC.checked,
      });
    }, 300);
  });

  filterDLC.addEventListener('change', (e) => {
    onFilterChange({
      search: searchInput.value,
      hideDlc: e.target.checked,
    });
  });
}
