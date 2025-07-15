/**
 * @fileoverview Table rendering and launch options management
 * Handles games table display and interactive launch options
 */

// Track currently open launch options rows
const openLaunchOptionsRows = new Set();

/**
 * Render the games table with data
 * @param {Array} games - Array of game objects
 * @param {boolean} showLoading - Whether to show loading state
 */
export function renderTable(games, showLoading = false) {
  const container = document.getElementById('table-container');
  if (!container) {
    console.error('Table container not found');
    return;
  }

  if (showLoading) {
    container.innerHTML = `
      <div class="table-loading">
        <div class="loading-spinner"></div>
        <span>Loading games...</span>
      </div>
    `;
    return;
  }

  if (!games || games.length === 0) {
    container.innerHTML = `
      <div class="no-results">
        <h3>🎮 No games found</h3>
        <p>Try adjusting your search criteria or filters.</p>
      </div>
    `;
    return;
  }

  // Create table structure
  const table = document.createElement('table');
  table.className = 'games-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Game Title</th>
        <th>Developer</th>
        <th>Publisher</th>
        <th>Release Date</th>
        <th>Engine</th>
        <th>Launch Options</th>
      </tr>
    </thead>
    <tbody>
      ${games.map(game => createGameRow(game)).join('')}
    </tbody>
  `;

  container.innerHTML = '';
  container.appendChild(table);

  // Set up launch options event listeners
  setupLaunchOptionListeners();
}

/**
 * Create a single game row HTML
 * @param {Object} game - Game data object
 * @returns {string} HTML string for the game row
 */
function createGameRow(game) {
  // Use the correct property names from your API
  const gameId = game.app_id;
  const optionsCount = game.total_options_count || 0;

  const releaseDate = game.release_date ? 
    new Date(game.release_date).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    }) : 'Unknown';

  return `
    <tr data-game-id="${gameId}">
      <td data-label="Title">
        <div class="game-title">${escapeHtml(game.title || 'Unknown')}</div>
      </td>
      <td data-label="Developer">${escapeHtml(game.developer || 'Unknown')}</td>
      <td data-label="Publisher">${escapeHtml(game.publisher || 'Unknown')}</td>
      <td data-label="Release Date">${releaseDate}</td>
      <td data-label="Engine">${escapeHtml(game.engine || 'Unknown')}</td>
      <td data-label="Launch Options">
        <button 
          class="launch-options-btn" 
          data-game-id="${gameId}"
          aria-expanded="false"
          type="button"
        >
          Show Options
          ${optionsCount > 0 ? `<span class="options-count">${optionsCount}</span>` : ''}
        </button>
      </td>
    </tr>
  `;
}

/**
 * Set up event listeners for launch options buttons
 */
function setupLaunchOptionListeners() {
  console.log('🎯 Setting up launch option listeners');
  
  // Remove any existing listeners first
  document.removeEventListener('click', handleLaunchOptionsClick);
  
  // Add single delegated event listener
  document.addEventListener('click', handleLaunchOptionsClick);
}

/**
 * Handle launch options button clicks with proper event management
 * @param {Event} e - Click event
 */
async function handleLaunchOptionsClick(e) {
  // Only handle launch options buttons
  const button = e.target.closest('.launch-options-btn');
  if (!button) return;

  // Prevent event bubbling and default behavior
  e.preventDefault();
  e.stopPropagation();

  const gameId = button.dataset.gameId;
  if (!gameId) {
    console.error('No game ID found on button');
    return;
  }

  console.log(`🚀 Launch options clicked for game ID: ${gameId}`);

  try {
    // Check if options are already open
    const existingRow = document.querySelector(`.launch-options-row[data-game-id="${gameId}"]`);
    
    if (existingRow && existingRow.style.display !== 'none') {
      // Close existing options
      closeLaunchOptions(gameId);
      return;
    }

    // Close any other open options first
    closeAllLaunchOptions();

    // Show loading state
    button.disabled = true;
    button.textContent = 'Loading...';

    // Fetch and display launch options
    await fetchAndDisplayLaunchOptions(gameId, button);

  } catch (error) {
    console.error('Error handling launch options click:', error);
    showLaunchOptionsError(gameId, error.message);
  } finally {
    // Re-enable button
    button.disabled = false;
    updateButtonText(button, true);
  }
}

/**
 * Fetch launch options and display them
 * @param {string} gameId - Game ID
 * @param {HTMLElement} button - The clicked button
 */
async function fetchAndDisplayLaunchOptions(gameId, button) {
  try {
    console.log(`📡 Fetching launch options for game ${gameId}`);
    
    const response = await fetch(`/api/games/${gameId}/launch-options`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ Received ${data.length} launch options for game ${gameId}`);

    // Display the launch options
    displayLaunchOptions(gameId, data);
    
    // Update button state
    updateButtonText(button, true);
    
    // Track that this row is open
    openLaunchOptionsRows.add(gameId);

  } catch (error) {
    console.error(`❌ Error fetching launch options for game ${gameId}:`, error);
    throw error;
  }
}

/**
 * Display launch options in the table
 * @param {string} gameId - Game ID
 * @param {Array} launchOptions - Array of launch option objects
 */
function displayLaunchOptions(gameId, launchOptions) {
  const gameRow = document.querySelector(`tr[data-game-id="${gameId}"]`);
  if (!gameRow) {
    console.error(`Game row not found for ID: ${gameId}`);
    return;
  }

  // Remove existing launch options row if it exists
  const existingRow = document.querySelector(`.launch-options-row[data-game-id="${gameId}"]`);
  if (existingRow) {
    existingRow.remove();
  }

  // Create the launch options row
  const launchOptionsRow = document.createElement('tr');
  launchOptionsRow.className = 'launch-options-row';
  launchOptionsRow.dataset.gameId = gameId;

  const colspan = gameRow.children.length;
  
  if (launchOptions.length === 0) {
    launchOptionsRow.innerHTML = `
      <td colspan="${colspan}" class="launch-options-cell">
        <div class="no-options">
          <h4>No Launch Options Available</h4>
          <p>This game doesn't have any community-verified launch options yet.</p>
          <p>Consider contributing if you know of effective launch options!</p>
        </div>
        <div class="launch-options-close-container">
          <button class="launch-options-close" data-game-id="${gameId}">
            Close Options
          </button>
        </div>
      </td>
    `;
  } else {
    const optionsHtml = launchOptions.map(option => createLaunchOptionCard(option)).join('');
    
    launchOptionsRow.innerHTML = `
      <td colspan="${colspan}" class="launch-options-cell">
        <ul class="launch-options-list">
          ${optionsHtml}
        </ul>
        <div class="launch-options-close-container">
          <button class="launch-options-close" data-game-id="${gameId}">
            Close Options
          </button>
        </div>
      </td>
    `;
  }

  // Insert the row after the game row
  gameRow.parentNode.insertBefore(launchOptionsRow, gameRow.nextSibling);

  // Set up copy functionality and close button
  addCopyFunctionality(launchOptionsRow);
  setupCloseButton(launchOptionsRow);

  // Show the row with animation and debug
  console.log('📋 About to show launch options row for game:', gameId);
  requestAnimationFrame(() => {
    launchOptionsRow.style.display = 'table-row';
    console.log('✅ Launch options row display set to table-row');
    
    // Debug: Check if the row is actually visible
    setTimeout(() => {
      const rect = launchOptionsRow.getBoundingClientRect();
      console.log('📏 Launch options row dimensions:', {
        width: rect.width,
        height: rect.height,
        visible: rect.height > 0
      });
    }, 100);
  });

  console.log(`✨ Launch options displayed for game ${gameId}`);
}

/**
 * Create HTML for a single launch option card
 * @param {Object} option - Launch option data
 * @returns {string} HTML string for the option card
 */
function createLaunchOptionCard(option) {
  const verifiedBadge = option.verified ? 
    '<span class="option-verified">Verified</span>' : '';
    
  const votesBadge = option.votes > 0 ? 
    `<span class="option-votes">${option.votes}</span>` : '';

  return `
    <li class="launch-option">
      <div class="option-command" data-command="${escapeHtml(option.command)}">
        <code>${escapeHtml(option.command)}</code>
      </div>
      
      ${option.description ? `<div class="option-description">${escapeHtml(option.description)}</div>` : ''}
      
      <div class="option-meta">
        <span class="option-source">${escapeHtml(option.source || 'Community')}</span>
        <div>
          ${verifiedBadge}
          ${votesBadge}
        </div>
      </div>
    </li>
  `;
}

/**
 * Add copy functionality to launch option commands
 * @param {HTMLElement} container - Container element
 */
function addCopyFunctionality(container) {
  const commandElements = container.querySelectorAll('.option-command');
  
  commandElements.forEach(element => {
    // Remove existing listeners
    element.removeEventListener('click', handleCommandClick);
    
    // Add click listener for copying
    element.addEventListener('click', handleCommandClick);
    
    // Make focusable for accessibility
    element.tabIndex = 0;
    
    // Add keyboard support
    element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleCommandClick(e);
      }
    });
  });
}

/**
 * Handle command click for copying
 * @param {Event} e - Click event
 */
async function handleCommandClick(e) {
  e.preventDefault();
  e.stopPropagation(); // Prevent triggering parent click handlers
  
  const element = e.currentTarget;
  const command = element.dataset.command;
  
  if (!command) {
    console.error('No command found to copy');
    return;
  }

  try {
    await navigator.clipboard.writeText(command);
    
    // Visual feedback
    element.classList.remove('copy-failed');
    element.classList.add('copied');
    
    // Reset after animation
    setTimeout(() => {
      element.classList.remove('copied');
    }, 1000);
    
    console.log(`📋 Copied command: ${command}`);
    
  } catch (error) {
    console.error('Failed to copy command:', error);
    
    // Error feedback
    element.classList.remove('copied');
    element.classList.add('copy-failed');
    
    // Reset after animation
    setTimeout(() => {
      element.classList.remove('copy-failed');
    }, 1000);
    
    // Fallback: try to select text
    try {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (fallbackError) {
      console.error('Fallback text selection also failed:', fallbackError);
    }
  }
}

/**
 * Set up close button functionality
 * @param {HTMLElement} container - Container element
 */
function setupCloseButton(container) {
  const closeButton = container.querySelector('.launch-options-close');
  if (!closeButton) return;

  closeButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const gameId = closeButton.dataset.gameId;
    if (gameId) {
      closeLaunchOptions(gameId);
    }
  });
}

/**
 * Close launch options for a specific game
 * @param {string} gameId - Game ID
 */
function closeLaunchOptions(gameId) {
  const launchOptionsRow = document.querySelector(`.launch-options-row[data-game-id="${gameId}"]`);
  const button = document.querySelector(`.launch-options-btn[data-game-id="${gameId}"]`);
  
  if (launchOptionsRow) {
    launchOptionsRow.style.display = 'none';
    setTimeout(() => launchOptionsRow.remove(), 300);
  }
  
  if (button) {
    updateButtonText(button, false);
  }
  
  openLaunchOptionsRows.delete(gameId);
  console.log(`❌ Closed launch options for game ${gameId}`);
}

/**
 * Close all open launch options
 */
function closeAllLaunchOptions() {
  const openRows = document.querySelectorAll('.launch-options-row[style*="table-row"]');
  openRows.forEach(row => {
    const gameId = row.dataset.gameId;
    if (gameId) {
      closeLaunchOptions(gameId);
    }
  });
  
  openLaunchOptionsRows.clear();
  console.log('🧹 Closed all launch options');
}

/**
 * Update button text based on state
 * @param {HTMLElement} button - Launch options button
 * @param {boolean} isOpen - Whether options are open
 */
function updateButtonText(button, isOpen) {
  if (!button) return;
  
  button.setAttribute('aria-expanded', isOpen.toString());
  
  if (isOpen) {
    button.innerHTML = button.innerHTML.replace('Show Options', 'Hide Options');
  } else {
    button.innerHTML = button.innerHTML.replace('Hide Options', 'Show Options');
  }
}

/**
 * Show error message for launch options
 * @param {string} gameId - Game ID
 * @param {string} errorMessage - Error message
 */
function showLaunchOptionsError(gameId, errorMessage) {
  const gameRow = document.querySelector(`tr[data-game-id="${gameId}"]`);
  if (!gameRow) return;

  const existingRow = document.querySelector(`.launch-options-row[data-game-id="${gameId}"]`);
  if (existingRow) {
    existingRow.remove();
  }

  const launchOptionsRow = document.createElement('tr');
  launchOptionsRow.className = 'launch-options-row';
  launchOptionsRow.dataset.gameId = gameId;

  const colspan = gameRow.children.length;
  
  launchOptionsRow.innerHTML = `
    <td colspan="${colspan}" class="launch-options-cell">
      <div class="error">
        <h3>❌ Error Loading Launch Options</h3>
        <p>Failed to load launch options: ${escapeHtml(errorMessage)}</p>
        <details>
          <summary>Technical Details</summary>
          <p>Error occurred while fetching data from the server. Please try again or contact support if the issue persists.</p>
        </details>
        <div class="launch-options-close-container">
          <button class="launch-options-close" data-game-id="${gameId}">
            Close
          </button>
        </div>
      </div>
    </td>
  `;

  gameRow.parentNode.insertBefore(launchOptionsRow, gameRow.nextSibling);
  setupCloseButton(launchOptionsRow);
  
  launchOptionsRow.style.display = 'table-row';
}

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Clean up when page unloads
 */
window.addEventListener('beforeunload', () => {
  closeAllLaunchOptions();
});

// Export for external use
export { closeAllLaunchOptions };