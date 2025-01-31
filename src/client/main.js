let currentPage = 1; // Default to the first page
const rowsPerPage = 20; // Number of rows per page

/**
 * Fetches the paginated game data from the backend
 * @param {number} page - The page number to fetch
 */
async function fetchGames(page = 1) {
  try {
    // Fetch paginated data from the API
    const response = await fetch(`http://localhost:3000/api/steam/games?page=${page}&limit=${rowsPerPage}`);
    if (!response.ok) throw new Error('Failed to fetch data');

    const { games, page: fetchedPage, limit } = await response.json();

    renderTable(games); // Populate the table with game data
    renderPagination(fetchedPage, limit); // Generate pagination controls
  } catch (error) {
    console.error('Error fetching games:', error.message);
    alert('Failed to load data. Please try again.');
  }
}

/**
 * Populates the table with game data
 * @param {Array} games - The array of game objects to display
 */
function renderTable(games) {
  const tableBody = document.querySelector('#resultsTable tbody');
  tableBody.innerHTML = ''; // Clear the existing table rows

  games.forEach(game => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${game.game_id}</td>
      <td>${game.name}</td>
    `;
    tableBody.appendChild(row);
  });
}

/**
 * Generates and displays pagination controls
 * @param {number} currentPage - The current page number
 * @param {number} rowsPerPage - The number of rows displayed per page
 */
function renderPagination(currentPage, rowsPerPage) {
  const paginationContainer = document.getElementById('pagination');
  paginationContainer.innerHTML = ''; // Clear existing pagination controls

  // "Previous" button
  const prevButton = document.createElement('button');
  prevButton.textContent = 'Previous';
  prevButton.disabled = currentPage === 1;
  prevButton.addEventListener('click', () => changePage(currentPage - 1));
  paginationContainer.appendChild(prevButton);

  // Current page indicator
  const pageIndicator = document.createElement('span');
  pageIndicator.textContent = ` Page ${currentPage} `;
  paginationContainer.appendChild(pageIndicator);

  // "Next" button
  const nextButton = document.createElement('button');
  nextButton.textContent = 'Next';
  const totalPages = Math.ceil(1000 / rowsPerPage); // Adjust the total number of rows if necessary
  nextButton.disabled = currentPage === totalPages;
  nextButton.addEventListener('click', () => changePage(currentPage + 1));
  paginationContainer.appendChild(nextButton);
}

/**
 * Handles changing the page and fetching data for the new page
 * @param {number} page - The page number to navigate to
 */
function changePage(page) {
  if (page < 1) return; // Prevent navigating to an invalid page
  currentPage = page;
  fetchGames(currentPage);
}

// Initial data fetch on page load
document.addEventListener('DOMContentLoaded', () => fetchGames(currentPage));
