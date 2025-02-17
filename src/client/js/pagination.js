// Mock data
const games = [
  { game_id: 1, name: "Half-Life 2" },
  { game_id: 2, name: "Portal 2" },
  { game_id: 3, name: "Counter-Strike: Global Offensive" },
  { game_id: 4, name: "Dota 2" },
  { game_id: 5, name: "Team Fortress 2" },
  { game_id: 6, name: "Left 4 Dead 2" },
  { game_id: 7, name: "Garry's Mod" },
  { game_id: 8, name: "Cyberpunk 2077" },
  { game_id: 9, name: "The Witcher 3: Wild Hunt" },
  { game_id: 10, name: "Hollow Knight" },
];

const resultsTable = document.querySelector("#resultsTable tbody");
const searchInput = document.getElementById("gameSearch");
const pagination = document.getElementById("pagination");
const itemsPerPage = 5;
let currentPage = 1;

// Function to render table
function renderTable(data) {
  resultsTable.innerHTML = "";
  data.forEach(game => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${game.game_id}</td><td>${game.name}</td>`;
    resultsTable.appendChild(row);
  });
}

// Function to render pagination
function renderPagination(totalItems) {
  pagination.innerHTML = "";
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.innerText = i;
    btn.classList.add("page-btn");
    btn.addEventListener("click", () => {
      currentPage = i;
      updateTable();
    });

    if (i === currentPage) {
      btn.style.backgroundColor = "#0056b3";
    }

    pagination.appendChild(btn);
  }
}

// Function to update table based on search and pagination
function updateTable() {
  let filteredGames = games.filter(game =>
    game.name.toLowerCase().includes(searchInput.value.toLowerCase())
  );

  const start = (currentPage - 1) * itemsPerPage;
  const paginatedGames = filteredGames.slice(start, start + itemsPerPage);

  renderTable(paginatedGames);
  renderPagination(filteredGames.length);
}

// Search functionality
searchInput.addEventListener("input", () => {
  currentPage = 1;
  updateTable();
});

document.getElementById("searchButton").addEventListener("click", updateTable);

// Initial render
updateTable();
