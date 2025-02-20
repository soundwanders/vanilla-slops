import { pagination } from "./dom.js";

export function renderPagination(totalItems, itemsPerPage, currentPage, updateTable) {
  pagination.innerHTML = "";
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.innerText = i;
    btn.classList.add("page-btn");

    btn.addEventListener("click", () => {
      updateTable(i);
    });

    if (i === currentPage) {
      btn.style.backgroundColor = "#0056b3";
    }

    pagination.appendChild(btn);
  }
}
