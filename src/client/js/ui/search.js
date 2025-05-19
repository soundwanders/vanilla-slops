export function createSearchComponent() {
  const form = document.createElement('form');
  form.id = 'search-form-component';
  form.setAttribute('role', 'search');
  form.setAttribute('aria-label', 'Game search form');

  form.innerHTML = `
    <label for="search-input">Search by title</label>
    <input id="search-input" name="search" type="search" placeholder="Search by title..." autocomplete="off" />

    <label for="genre-filter">Genre</label>
    <select id="genre-filter" name="genre">
      <option value="">All Genres</option>
      <option value="action">Action</option>
      <option value="rpg">RPG</option>
    </select>

    <label for="engine-filter">Engine</label>
    <select id="engine-filter" name="engine">
      <option value="">All Engines</option>
      <option value="unity">Unity</option>
      <option value="unreal">Unreal</option>
    </select>

    <label for="platform-filter">Platform</label>
    <select id="platform-filter" name="platform">
      <option value="">All Platforms</option>
      <option value="windows">Windows</option>
      <option value="linux">Linux</option>
      <option value="mac">Mac</option>
    </select>

    <label for="sort-order">Sort order</label>
    <select id="sort-order" name="sort">
      <option value="asc">A → Z</option>
      <option value="desc">Z → A</option>
    </select>

    <button type="submit" aria-label="Search">Search</button>
  `;

  return form;
}
