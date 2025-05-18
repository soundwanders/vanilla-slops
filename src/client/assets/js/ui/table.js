export function renderTable(games) {
  const app = document.getElementById('app');

  const container = document.createElement('div');
  container.className = 'game-grid';

  games.forEach(game => {
    const card = document.createElement('div');
    card.className = 'card';

    card.innerHTML = `
      <h2>${game.name}</h2>
      <p><strong>AppID:</strong> ${game.appid}</p>
      <p><strong>Launch Options:</strong> ${game.launch_options?.join(', ') || 'None'}</p>
    `;

    container.appendChild(card);
  });

  app.appendChild(container);
}

export function renderPagination(currentPage, totalPages, onPageChange) {
  const app = document.getElementById('app');
  const pagination = document.createElement('div');
  pagination.className = 'pagination';

  for (let i = 1; i <= totalPages; i++) {
    const pageButton = document.createElement('button');
    pageButton.textContent = i;
    pageButton.disabled = i === currentPage;

    pageButton.addEventListener('click', () => {
      onPageChange(i);
    });

    pagination.appendChild(pageButton);
  }

  app.appendChild(pagination);
}
