/**
 * @fileoverview Table rendering and launch options management
 * Handles games table display and interactive launch options
 * 
 * CLEANED & ORGANIZED VERSION
 * - Fixed duplicate functions
 * - Fixed memory leaks
 * - Proper function organization
 * - Consistent export strategy
 */

import { fetchLaunchOptions } from '../api.js';

// ============================================================================
// CONSTANTS & STATE
// ============================================================================

const openLaunchOptionsRows = new Set();

// Constants for magic numbers
const CLOSE_ALL_BUTTON_THRESHOLD = 2;
const LAUNCH_OPTIONS_ROW_SELECTOR = '.launch-options-row[style*="table-row"]';
const ANIMATION_DELAY = 300;
const FEEDBACK_DURATION = 2000;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

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
 * Get count of currently open launch options
 * @returns {number} Number of open launch options
 */
function getOpenLaunchOptionsCount() {
  return document.querySelectorAll(LAUNCH_OPTIONS_ROW_SELECTOR).length;
}

/**
 * Format release date consistently
 * @param {string} dateString - Raw date string
 * @returns {string} Formatted date
 */
function formatReleaseDate(dateString) {
  if (!dateString) return 'Unknown';
  
  try {
    return new Date(dateString).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  } catch (error) {
    console.warn('Invalid date format:', dateString);
    return 'Unknown';
  }
}

// ============================================================================
// CORE RENDERING FUNCTIONS
// ============================================================================

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

  // Set up event listeners (only needs to be done once)
  setupLaunchOptionListeners();
}

/**
 * Create a single game row HTML
 * @param {Object} game - Game data object
 * @returns {string} HTML string for the game row
 */
function createGameRow(game) {
  const gameId = game.app_id;
  const optionsCount = game.total_options_count || 0;
  const releaseDate = formatReleaseDate(game.release_date);

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
 * Create HTML for a single launch option card
 * @param {Object} option - Launch option data
 * @returns {string} HTML string for the option card
 */
function createLaunchOptionCard(option) {
  const verifiedBadge = option.verified ? 
    '<span class="option-verified">Verified</span>' : '';
    
  const votesBadge = option.upvotes > 0 ? 
    `<span class="option-votes">${option.upvotes}</span>` : '';

  // Use either 'command' or 'option' field (api.js returns 'option' for compatibility)
  const command = option.command || option.option || '';

  return `
    <li class="launch-option">
      <div class="option-command" data-command="${escapeHtml(command)}">
        <code>${escapeHtml(command)}</code>
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

// ============================================================================
// LAUNCH OPTIONS MANAGEMENT
// ============================================================================

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
    launchOptionsRow.innerHTML = createNoOptionsContent(colspan, gameId);
  } else {
    const optionsHtml = launchOptions.map(option => createLaunchOptionCard(option)).join('');
    launchOptionsRow.innerHTML = createOptionsContent(colspan, optionsHtml, gameId);
  }

  // Insert the row after the game row
  gameRow.parentNode.insertBefore(launchOptionsRow, gameRow.nextSibling);

  // Set up functionality
  addCopyFunctionality(launchOptionsRow);
  setupCloseButton(launchOptionsRow);

  // Check if we should show the Close All button
  if (getOpenLaunchOptionsCount() >= CLOSE_ALL_BUTTON_THRESHOLD) {
    showCloseAllButton();
  }

  // Show the row with animation
  requestAnimationFrame(() => {
    launchOptionsRow.style.display = 'table-row';
  });

  console.log(`✨ Launch options displayed for game ${gameId}`);
}

/**
 * Create content for when no options are available
 * @param {number} colspan - Number of columns to span
 * @param {string} gameId - Game ID
 * @returns {string} HTML content
 */
function createNoOptionsContent(colspan, gameId) {
  return `
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
}

/**
 * Create content for when options are available
 * @param {number} colspan - Number of columns to span
 * @param {string} optionsHtml - HTML for options list
 * @param {string} gameId - Game ID
 * @returns {string} HTML content
 */
function createOptionsContent(colspan, optionsHtml, gameId) {
  return `
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

/**
 * Close launch options for a specific game
 * @param {string} gameId - Game ID
 */
function closeLaunchOptions(gameId) {
  const launchOptionsRow = document.querySelector(`.launch-options-row[data-game-id="${gameId}"]`);
  const button = document.querySelector(`.launch-options-btn[data-game-id="${gameId}"]`);
  
  if (launchOptionsRow) {
    launchOptionsRow.style.display = 'none';
    setTimeout(() => launchOptionsRow.remove(), ANIMATION_DELAY);
  }
  
  if (button) {
    updateButtonToShowState(button);
  }

  // Check if we should hide the Close All button
  if (getOpenLaunchOptionsCount() < CLOSE_ALL_BUTTON_THRESHOLD) {
    hideCloseAllButton();
  }

  openLaunchOptionsRows.delete(gameId);
  console.log(`❌ Closed launch options for game ${gameId}`);
}

/**
 * Close all open launch options with proper cleanup
 * @returns {number} Number of options closed
 */
function closeAllLaunchOptions() {
  const openRows = document.querySelectorAll('.launch-options-row');
  let closedCount = 0;
  
  openRows.forEach(row => {
    const gameId = row.dataset.gameId;
    if (gameId && row.style.display !== 'none') {
      closeLaunchOptions(gameId);
      closedCount++;
    }
  });
  
  openLaunchOptionsRows.clear();
  hideCloseAllButton();
  
  console.log(`🧹 Closed ${closedCount} launch options`);
  return closedCount;
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

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handle launch options button clicks with proper state management
 * @param {Event} e - Click event
 */
async function handleLaunchOptionsClick(e) {
  const button = e.target.closest('.launch-options-btn');
  if (!button) return;

  e.preventDefault();
  e.stopPropagation();

  const gameId = button.dataset.gameId;
  if (!gameId) {
    console.error('No game ID found on button');
    return;
  }

  console.log(`🚀 Launch options clicked for game ID: ${gameId}`);

  const originalButtonContent = button.innerHTML;
  
  try {
    const existingRow = document.querySelector(`.launch-options-row[data-game-id="${gameId}"]`);
    
    if (existingRow && existingRow.style.display !== 'none') {
      closeLaunchOptions(gameId);
      return;
    }

    closeAllLaunchOptions();
    showLoadingState(button);

    console.log(`📡 Fetching launch options for game ${gameId} using api.js`);
    const launchOptions = await fetchLaunchOptions(gameId, true);
    console.log(`✅ Received ${launchOptions.length} launch options for game ${gameId}`);

    displayLaunchOptions(gameId, launchOptions);
    updateButtonToHideState(button, originalButtonContent);
    openLaunchOptionsRows.add(gameId);

  } catch (error) {
    console.error('Error handling launch options click:', error);
    showLaunchOptionsError(gameId, error.message);
    restoreButtonState(button, originalButtonContent);
  }
}

/**
 * Handle command click for copying
 * @param {Event} e - Click event
 */
async function handleCommandClick(e) {
  e.preventDefault();
  e.stopPropagation();
  
  const element = e.currentTarget;
  const command = element.dataset.command;
  
  if (!command) {
    console.error('No command found to copy');
    return;
  }

  try {
    await navigator.clipboard.writeText(command);
    showCopySuccess(element);
    console.log(`📋 Copied command: ${command}`);
  } catch (error) {
    console.error('Failed to copy command:', error);
    showCopyError(element);
    attemptTextSelection(element);
  }
}

/**
 * Handle close all button click with proper event handling
 * @param {Event} e - Click event
 */
function handleCloseAllClick(e) {
  e.preventDefault();
  e.stopPropagation();
  
  console.log('🎯 Close All button clicked');
  
  const button = e.currentTarget;
  button.classList.add('clicked');
  
  const closedCount = closeAllLaunchOptions();
  
  if (closedCount > 0) {
    showCloseAllFeedback(closedCount);
  }
  
  setTimeout(() => button.classList.remove('clicked'), 200);
}

// ============================================================================
// BUTTON STATE MANAGEMENT
// ============================================================================

/**
 * Show loading state on button
 * @param {HTMLElement} button - Launch options button
 */
function showLoadingState(button) {
  button.disabled = true;
  button.innerHTML = `
    <span class="loading-spinner" style="width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.3); border-top: 2px solid white; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 8px; display: inline-block;"></span>
    Loading...
  `;
}

/**
 * Update button to "Hide Options" state
 * @param {HTMLElement} button - Launch options button
 * @param {string} originalContent - Original button content
 */
function updateButtonToHideState(button, originalContent) {
  const hideContent = originalContent.replace(/Show Options/g, 'Hide Options');
  button.innerHTML = hideContent;
  button.disabled = false;
  button.setAttribute('aria-expanded', 'true');
}

/**
 * Update button to "Show Options" state
 * @param {HTMLElement} button - Launch options button
 */
function updateButtonToShowState(button) {
  const currentContent = button.innerHTML;
  const showContent = currentContent.replace(/Hide Options/g, 'Show Options');
  button.innerHTML = showContent;
  button.disabled = false;
  button.setAttribute('aria-expanded', 'false');
}

/**
 * Restore button to original state
 * @param {HTMLElement} button - Launch options button
 * @param {string} originalContent - Original button content
 */
function restoreButtonState(button, originalContent) {
  button.innerHTML = originalContent;
  button.disabled = false;
}

// ============================================================================
// UI MANAGEMENT (CLOSE ALL BUTTON & FEEDBACK)
// ============================================================================

/**
 * Create and show the "Close All Launch Options" button
 */
function showCloseAllButton() {
  let closeAllBtn = document.getElementById('close-all-launch-options-btn');
  
  if (!closeAllBtn) {
    closeAllBtn = createCloseAllButton();
    document.body.appendChild(closeAllBtn);
    console.log('✅ Close All button created');
  }
  
  closeAllBtn.style.display = 'flex';
  setTimeout(() => closeAllBtn.classList.add('visible'), 10);
}

/**
 * Create the close all button element
 * @returns {HTMLElement} The close all button
 */
function createCloseAllButton() {
  const closeAllBtn = document.createElement('button');
  closeAllBtn.id = 'close-all-launch-options-btn';
  closeAllBtn.className = 'close-all-btn';
  closeAllBtn.innerHTML = `
    <span class="close-all-icon" aria-hidden="true">✕</span>
    <span class="close-all-text">Close All Options</span>
  `;
  closeAllBtn.setAttribute('aria-label', 'Close all open launch options');
  closeAllBtn.setAttribute('title', 'Close all open launch options (Esc key)');
  closeAllBtn.addEventListener('click', handleCloseAllClick);
  
  return closeAllBtn;
}

/**
 * Hide the "Close All Launch Options" button
 */
function hideCloseAllButton() {
  const closeAllBtn = document.getElementById('close-all-launch-options-btn');
  if (closeAllBtn) {
    closeAllBtn.classList.remove('visible');
    setTimeout(() => closeAllBtn.style.display = 'none', ANIMATION_DELAY);
  }
}

/**
 * Show feedback when options are closed
 * @param {number} count - Number of options closed
 */
function showCloseAllFeedback(count) {
  const feedback = document.createElement('div');
  feedback.className = 'close-all-feedback';
  feedback.textContent = `${escapeHtml(count.toString())} option${count !== 1 ? 's' : ''} closed`;
  
  const closeBtn = document.getElementById('close-all-launch-options-btn');
  if (closeBtn) {
    positionFeedbackNearButton(feedback, closeBtn);
  }
  
  document.body.appendChild(feedback);
  
  setTimeout(() => feedback.classList.add('visible'), 10);
  setTimeout(() => {
    feedback.classList.remove('visible');
    setTimeout(() => feedback.remove(), ANIMATION_DELAY);
  }, FEEDBACK_DURATION);
}

/**
 * Position feedback element near the close button
 * @param {HTMLElement} feedback - Feedback element
 * @param {HTMLElement} closeBtn - Close button element
 */
function positionFeedbackNearButton(feedback, closeBtn) {
  const rect = closeBtn.getBoundingClientRect();
  feedback.style.position = 'fixed';
  feedback.style.right = `${window.innerWidth - rect.left + 10}px`;
  feedback.style.top = `${rect.top + rect.height / 2}px`;
  feedback.style.transform = 'translateY(-50%)';
}

// ============================================================================
// COPY FUNCTIONALITY
// ============================================================================

/**
 * Add copy functionality to launch option commands
 * @param {HTMLElement} container - Container element
 */
function addCopyFunctionality(container) {
  const commandElements = container.querySelectorAll('.option-command');
  
  commandElements.forEach(element => {
    element.removeEventListener('click', handleCommandClick);
    element.addEventListener('click', handleCommandClick);
    element.tabIndex = 0;
    
    element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleCommandClick(e);
      }
    });
  });
}

/**
 * Show copy success feedback
 * @param {HTMLElement} element - Command element
 */
function showCopySuccess(element) {
  element.classList.remove('copy-failed');
  element.classList.add('copied');
  setTimeout(() => element.classList.remove('copied'), 1000);
}

/**
 * Show copy error feedback
 * @param {HTMLElement} element - Command element
 */
function showCopyError(element) {
  element.classList.remove('copied');
  element.classList.add('copy-failed');
  setTimeout(() => element.classList.remove('copy-failed'), 1000);
}

/**
 * Attempt text selection as fallback for copy
 * @param {HTMLElement} element - Command element
 */
function attemptTextSelection(element) {
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

// ============================================================================
// SETUP & INITIALIZATION
// ============================================================================

/**
 * Set up event listeners for launch options buttons
 */
function setupLaunchOptionListeners() {
  console.log('🎯 Setting up launch option listeners');
  
  // Remove any existing listeners first to prevent duplicates
  document.removeEventListener('click', handleLaunchOptionsClick);
  document.addEventListener('click', handleLaunchOptionsClick);
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
 * Set up keyboard shortcuts (called once during initialization)
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const openCount = getOpenLaunchOptionsCount();
      if (openCount > 0) {
        e.preventDefault();
        console.log('⌨️ Escape key pressed - closing all launch options');
        closeAllLaunchOptions();
      }
    }
  });
  
  console.log('⌨️ Keyboard shortcuts initialized');
}

/**
 * Initialize table features (called once when app starts)
 */
function initializeTableFeatures() {
  setupKeyboardShortcuts();
  
  // Add CSS for loading spinner if not already present
  if (!document.querySelector('style[data-table-spinner]')) {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    style.setAttribute('data-table-spinner', 'true');
    document.head.appendChild(style);
  }
  
  console.log('✅ Table features initialized');
}

// ============================================================================
// EXPORTS
// ============================================================================

// Initialize features when module loads
initializeTableFeatures();

// Export public functions
export { closeAllLaunchOptions, escapeHtml, initializeTableFeatures };