/**
 * Render pagination controls to the UI.
 * 
 * @param {number} currentPage - The current page number.
 * @param {number} totalPages - The total number of pages.
 * @param {Function} onPageChange - Callback function to handle page changes.
 * 
 * @returns {void}
 */
export function renderPagination(currentPage, totalPages, onPageChange) {
  const app = document.getElementById('app');

  const pagination = document.createElement('div');
  pagination.className = 'pagination';

  if (currentPage > 1) {
    const prev = createButton('« Prev', () => onPageChange(currentPage - 1));
    pagination.appendChild(prev);
  }

  // Page numbers (show ±2 pages from current)
  for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) {
    const btn = createButton(i, () => onPageChange(i));
    if (i === currentPage) btn.classList.add('active');
    pagination.appendChild(btn);
  }

  if (currentPage < totalPages) {
    const next = createButton('Next »', () => onPageChange(currentPage + 1));
    pagination.appendChild(next);
  }

  app.appendChild(pagination);
}

function createButton(label, onClick) {
  const btn = document.createElement('button');
  btn.className = 'button pagination-button';
  btn.textContent = label;
  btn.onclick = onClick;
  return btn;
}
