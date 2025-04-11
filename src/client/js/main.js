import { games } from "./mock-data.js";
import { searchInput, setupEventListeners } from "./dom.js";
import { renderPagination } from "./pagination.js";
import { renderGamesTable } from "./games-table.js";

const itemsPerPage = 5;
let currentPage = 1;

// Function to update table based on search & pagination
function updateTable(page = 1) {
  currentPage = page;
  let filteredGames = games.filter(game =>
    game.name.toLowerCase().includes(searchInput.value.toLowerCase())
  );

  const start = (currentPage - 1) * itemsPerPage;
  const paginatedGames = filteredGames.slice(start, start + itemsPerPage);

  renderGamesTable(paginatedGames);
  renderPagination(filteredGames.length, itemsPerPage, currentPage, updateTable);
}

// Setup event listeners
setupEventListeners(updateTable);

// Initial render
updateTable();
