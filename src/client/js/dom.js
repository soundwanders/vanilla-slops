export const resultsTable = document.querySelector("#resultsTable tbody");
export const searchInput = document.getElementById("gameSearch");
export const pagination = document.getElementById("pagination");
export const searchButton = document.getElementById("searchButton");

export function setupEventListeners(updateTable) {
  searchInput.addEventListener("input", () => {
    updateTable();
  });

  searchButton.addEventListener("click", updateTable);
}
