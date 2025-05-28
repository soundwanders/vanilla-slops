import { fetchLaunchOptions } from '../api.js';

/**
 * Render a table of games and attach listeners for launch options buttons
 *
 * @param {Array} games - Array of game objects to display
 * @param {boolean} append - Whether to append to existing table or reset table
 */
export function renderTable(games, append = false) {
  const tableContainer = document.getElementById('table-container') || createTableContainer();

  if (!append) {
    tableContainer.innerHTML = `
      <table class="games-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Developer</th>
            <th>Publisher</th>
            <th>Release Date</th>
            <th>Engine</th>
            <th>Launch Options</th>
          </tr>
        </thead>
        <tbody id="games-table-body"></tbody>
      </table>
      <div id="scroll-sentinel"></div>
    `;
  }

  const tableBody = document.getElementById('games-table-body');

  games.forEach(game => {
    const row = document.createElement('tr');
    row.className = 'game-row';
    row.dataset.gameId = game.app_id;

    row.innerHTML = `
      <td><span class="game-title">${game.title || 'Unknown'}</span></td>
      <td>${game.developer || 'Unknown'}</td>
      <td>${game.publisher || 'Unknown'}</td>
      <td>${game.release_date || 'Unknown'}</td>
      <td>${game.engine || 'Unknown'}</td>
      <td>
        <button class="launch-options-btn" data-game-id="${game.app_id}">
          Show Options (${game.total_options_count ?? 0})
        </button>
      </td>
    `;

    // Add the main game row
    tableBody.appendChild(row);

    // Add a hidden row for launch options
    const optionsRow = document.createElement('tr');
    optionsRow.className = 'launch-options-row';
    optionsRow.id = `launch-options-${game.app_id}`;
    optionsRow.style.display = 'none';
    optionsRow.innerHTML = `
      <td colspan="6" class="launch-options-cell">
        <div class="loading">Loading...</div>
      </td>
    `;

    tableBody.appendChild(optionsRow);
  });

  setupLaunchOptionListeners();
}

/**
 * Create a table container if it doesn’t exist
 */
function createTableContainer() {
  const container = document.createElement('div');
  container.id = 'table-container';
  document.getElementById('app').appendChild(container);
  return container;
}

/**
 * Setup event listeners on launch options buttons
 */
function setupLaunchOptionListeners() {
  const buttons = document.querySelectorAll('.launch-options-btn');

  buttons.forEach(button => {
    button.addEventListener('click', async (e) => {
      const gameId = e.currentTarget.dataset.gameId;
      const optionsRow = document.getElementById(`launch-options-${gameId}`);

      // Toggle visibility if already shown
      if (optionsRow.style.display === 'table-row') {
        optionsRow.style.display = 'none';
        return;
      }

      // Show the row
      optionsRow.style.display = 'table-row';
      const cell = optionsRow.querySelector('.launch-options-cell');
      cell.innerHTML = `<div class="loading">Loading...</div>`;

      try {
        const options = await fetchLaunchOptions(gameId);

        if (options.length === 0) {
          cell.innerHTML = '<em>No launch options found.</em>';
          return;
        }

        const list = document.createElement('ul');
        list.className = 'launch-options-list';

        options.forEach(opt => {
          const item = document.createElement('li');
          item.innerHTML = `<code>${opt.option}</code> — ${opt.source || 'unknown source'}`;
          list.appendChild(item);
        });

        cell.innerHTML = '';
        cell.appendChild(list);
      } catch (err) {
        console.error('Failed to load launch options:', err);
        cell.innerHTML = '<span class="error">Failed to load launch options.</span>';
      }
    });
  });
}
