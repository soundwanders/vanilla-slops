export function createSearchComponent() {
  const wrapper = document.createElement('section');
  wrapper.id = 'search-component';

  wrapper.innerHTML = `
    <input id="search-input" placeholder="Search by name..." />

    <select id="genre-filter">
      <option value="">All Genres</option>
      <option value="action">Action</option>
      <option value="rpg">RPG</option>
    </select>

    <select id="engine-filter">
      <option value="">All Engines</option>
      <option value="unity">Unity</option>
      <option value="unreal">Unreal</option>
    </select>

    <select id="platform-filter">
      <option value="">All Platforms</option>
      <option value="windows">Windows</option>
      <option value="linux">Linux</option>
      <option value="mac">Mac</option>
    </select>

    <select id="sort-order">
      <option value="asc">A → Z</option>
      <option value="desc">Z → A</option>
    </select>
  `;

  return wrapper;
}
