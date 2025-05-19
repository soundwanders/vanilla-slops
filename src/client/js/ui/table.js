// Renders a list of game cards into #results-container
export function renderTable(games, append = false) {
  const container = document.getElementById('results-container');
  let grid = container.querySelector('.game-grid');

  if (!grid || !append) {
    if (grid) grid.remove();
    grid = document.createElement('div');
    grid.className = 'game-grid';
    container.appendChild(grid);
  }

  games.forEach(game => {
    const card = document.createElement('div');
    card.className = 'card';
    card.textContent = game.title;
    grid.appendChild(card);
  });
}

// Renders pagination controls into #pagination
export function renderPagination(currentPage, totalPages, onPageChange) {
  const container = document.getElementById('pagination');
  container.innerHTML = ''; // Clear existing buttons

  for (let i = 1; i <= totalPages; i++) {
    const pageButton = document.createElement('button');
    pageButton.textContent = i;
    pageButton.disabled = i === currentPage;

    pageButton.addEventListener('click', () => {
      onPageChange(i);
    });

    container.appendChild(pageButton);
  }
}

