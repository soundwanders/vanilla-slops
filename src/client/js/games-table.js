import { resultsTable } from "./dom.js";

export function renderGamesTable(data) {
  resultsTable.innerHTML = "";
  data.forEach(game => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${game.game_id}</td><td>${game.name}</td>`;
    resultsTable.appendChild(row);
  });
}
