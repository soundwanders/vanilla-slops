/**
 * @fileoverview Table.js
 * Handles pagination rendering for games table
 * Provides a responsive and accessible pagination UI
 * @module Pagination
 * @param {number} currentPage - The current page number
 * @param {number} totalPages - The total number of pages
 * @param {Function} onPageChange - Callback function to handle page changes
 * @requires utils.js

 */
export function renderPagination(currentPage, totalPages, onPageChange, shouldScroll = false) {
  // Remove existing pagination
  const existingPagination = document.querySelector('.pagination-container');
  if (existingPagination) {
    existingPagination.remove();
  }

  if (totalPages <= 1) {
    return; // Don't show pagination for single page
  }

  const app = document.getElementById('app');
  
  // Create pagination container
  const paginationContainer = document.createElement('div');
  paginationContainer.className = 'pagination-container';
  
  // Create pagination info
  const paginationInfo = document.createElement('div');
  paginationInfo.className = 'pagination-info';
  paginationInfo.innerHTML = `
    <span class="pagination-text">
      Page <strong>${currentPage}</strong> of <strong>${totalPages}</strong>
    </span>
  `;
  
  // Create pagination controls
  const paginationControls = document.createElement('div');
  paginationControls.className = 'pagination-controls';
  
  // Previous button
  if (currentPage > 1) {
    const prevBtn = createPaginationButton('‹ Previous', () => onPageChange(currentPage - 1, true, 'pagination'));
    prevBtn.classList.add('pagination-btn-prev');
    paginationControls.appendChild(prevBtn);
  }

  // Page number buttons
  const pageNumbers = generatePageNumbers(currentPage, totalPages);
  pageNumbers.forEach(pageInfo => {
    if (pageInfo.type === 'ellipsis') {
      const ellipsis = document.createElement('span');
      ellipsis.className = 'pagination-ellipsis';
      ellipsis.textContent = '...';
      ellipsis.setAttribute('aria-hidden', 'true');
      paginationControls.appendChild(ellipsis);
    } else {
      const pageBtn = createPaginationButton(pageInfo.page, () => onPageChange(pageInfo.page, true, 'pagination'));
      pageBtn.classList.add('pagination-btn-page');
      if (pageInfo.page === currentPage) {
        pageBtn.classList.add('pagination-btn-active');
        pageBtn.setAttribute('aria-current', 'page');
      }
      paginationControls.appendChild(pageBtn);
    }
  });
  
  // Next button
  if (currentPage < totalPages) {
    const nextBtn = createPaginationButton('Next ›', () => onPageChange(currentPage + 1, true, 'pagination'));
    nextBtn.classList.add('pagination-btn-next');
    paginationControls.appendChild(nextBtn);
  }
  
  // Quick jump functionality for large page counts
  if (totalPages > 10) {
    const quickJump = createQuickJumpSection(currentPage, totalPages, onPageChange);
    paginationContainer.appendChild(paginationInfo);
    paginationContainer.appendChild(paginationControls);
    paginationContainer.appendChild(quickJump);
  } else {
    paginationContainer.appendChild(paginationInfo);
    paginationContainer.appendChild(paginationControls);
  }
  
  app.appendChild(paginationContainer);
  
  // Add smooth scroll to top after page change
  if (shouldScroll) {
    setTimeout(() => {
      const tableContainer = document.getElementById('table-container');
      if (tableContainer) {
        tableContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }
}

/**
 * Create a styled pagination button
 */
function createPaginationButton(label, onClick) {
  const btn = document.createElement('button');
  btn.className = 'pagination-btn';
  btn.textContent = label;
  btn.type = 'button';
  btn.addEventListener('click', onClick);
  
  // Add accessibility attributes
  btn.setAttribute('aria-label', `Go to page ${label}`);
  
  return btn;
}

/**
 * Generate page numbers with ellipsis for large page counts
 */
function generatePageNumbers(currentPage, totalPages) {
  const pages = [];
  const maxVisiblePages = 7;
  
  if (totalPages <= maxVisiblePages) {
    // Show all pages if total is small
    for (let i = 1; i <= totalPages; i++) {
      pages.push({ type: 'page', page: i });
    }
  } else {
    // Always show first page
    pages.push({ type: 'page', page: 1 });
    
    // Determine range around current page
    let start = Math.max(2, currentPage - 2);
    let end = Math.min(totalPages - 1, currentPage + 2);
    
    // Add ellipsis if there's a gap after first page
    if (start > 2) {
      pages.push({ type: 'ellipsis' });
    }
    
    // Add pages around current page
    for (let i = start; i <= end; i++) {
      pages.push({ type: 'page', page: i });
    }
    
    // Add ellipsis if there's a gap before last page
    if (end < totalPages - 1) {
      pages.push({ type: 'ellipsis' });
    }
    
    // Always show last page
    if (totalPages > 1) {
      pages.push({ type: 'page', page: totalPages });
    }
  }
  
  return pages;
}

/**
 * Create quick jump section for large page counts
 */
function createQuickJumpSection(currentPage, totalPages, onPageChange) {
  const quickJump = document.createElement('div');
  quickJump.className = 'pagination-quick-jump';
  
  const label = document.createElement('label');
  label.className = 'pagination-jump-label';
  label.textContent = 'Jump to page:';
  
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'pagination-jump-input';
  input.min = '1';
  input.max = totalPages.toString();
  input.placeholder = currentPage.toString();
  input.setAttribute('aria-label', 'Jump to page number');
  
  const goBtn = document.createElement('button');
  goBtn.textContent = 'Go';
  goBtn.className = 'pagination-btn pagination-btn-go';
  goBtn.type = 'button';
  
  const handleJump = () => {
    const pageNum = parseInt(input.value, 10);
    if (pageNum >= 1 && pageNum <= totalPages && pageNum !== currentPage) {
      onPageChange(pageNum);
      input.value = '';
    }
  };
  
  goBtn.addEventListener('click', handleJump);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleJump();
    }
  });
  
  label.appendChild(input);
  quickJump.appendChild(label);
  quickJump.appendChild(goBtn);
  
  return quickJump;
}