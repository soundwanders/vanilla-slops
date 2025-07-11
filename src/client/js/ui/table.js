/**
 * @fileoverview Table rendering and interaction module for Steam games display
 * Handles the rendering of game data in a tabular format with expandable launch options
 * Provides interactive elements for viewing and copying launch options
 * 
 * @author Vanilla Slops Team
 * @version 1.0.0
 */

import { fetchLaunchOptions } from '../api.js';

/**
 * @typedef {Object} GameData
 * @property {number} app_id - Steam application ID
 * @property {string} [title] - Game title
 * @property {string} [developer] - Game developer name
 * @property {string} [publisher] - Game publisher name
 * @property {string} [release_date] - Game release date
 * @property {string} [engine] - Game engine used
 * @property {number} [total_options_count] - Number of available launch options
 */

/**
 * @typedef {Object} LaunchOption
 * @property {string} id - Unique identifier for the launch option
 * @property {string} option - Launch command/option text
 * @property {string} [command] - Alternative command field
 * @property {string} [description] - Description of what the option does
 * @property {string} [source] - Source of the launch option (e.g., 'Community', 'Official')
 * @property {number} [upvotes] - Number of community upvotes
 * @property {number} [downvotes] - Number of community downvotes
 * @property {boolean} [verified] - Whether the option is community verified
 * @property {string} [created_at] - ISO timestamp of when option was created
 */

/**
 * Renders a responsive table of Steam games with interactive launch options functionality
 * Creates table structure, populates with game data, and sets up event listeners
 * 
 * @param {GameData[]} games - Array of game objects to display in the table
 * @param {boolean} [append=false] - Whether to append games to existing table or create new table
 * @returns {void}
 * 
 * @example
 * // Render initial games list
 * renderTable(gamesList, false);
 * 
 * @example
 * // Append more games to existing table (for pagination)
 * renderTable(moreGames, true);
 * 
 * @since 1.0.0
 */
export function renderTable(games, append = false) {
  const tableContainer = document.getElementById('table-container') || createTableContainer();

  // Create table structure only if not appending
  if (!append) {
    tableContainer.innerHTML = `
      <table class="games-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Developer</th>
            <th>Publisher</th>
            <th>Release Date</th>
            <th>Engine</th>
            <th>Launch Options</th>
          </tr>
        </thead>
        <tbody id="games-table-body"></tbody>
      </table>
      <div id="scroll-sentinel"></div>
    `;
  }

  const tableBody = document.getElementById('games-table-body');

  // Populate table with game data
  games.forEach(game => {
    const row = document.createElement('tr');
    row.className = 'game-row';
    row.dataset.gameId = game.app_id;

    // Create table row with game information
    row.innerHTML = `
      <td><span class="game-title">${game.title || 'Unknown'}</span></td>
      <td>${game.developer || 'Unknown'}</td>
      <td>${game.publisher || 'Unknown'}</td>
      <td>${game.release_date || 'Unknown'}</td>
      <td>${game.engine || 'Unknown'}</td>
      <td>
        <button class="launch-options-btn" data-game-id="${game.app_id}">
          Show Options (${game.total_options_count ?? 0})
        </button>
      </td>
    `;

    // Add the main game row to table
    tableBody.appendChild(row);

    // Create hidden expandable row for launch options display
    const optionsRow = document.createElement('tr');
    optionsRow.className = 'launch-options-row';
    optionsRow.id = `launch-options-${game.app_id}`;
    optionsRow.style.display = 'none';
    optionsRow.innerHTML = `
      <td colspan="6" class="launch-options-cell">
        <div class="loading">Loading...</div>
      </td>
    `;

    tableBody.appendChild(optionsRow);
  });

  // Initialize interactive functionality
  setupLaunchOptionListeners();
}

/**
 * Creates and returns a table container element if one doesn't exist
 * Ensures the main app container has a dedicated space for the games table
 * 
 * @returns {HTMLDivElement} The created or existing table container element
 * @throws {Error} Throws error if main app container (#app) doesn't exist
 * 
 * @example
 * const container = createTableContainer();
 * 
 * @since 1.0.0
 */
function createTableContainer() {
  const appContainer = document.getElementById('app');
  
  if (!appContainer) {
    throw new Error('Main app container (#app) not found in DOM');
  }

  const container = document.createElement('div');
  container.id = 'table-container';
  appContainer.appendChild(container);
  return container;
}

/**
 * Sets up click event listeners for all launch options buttons in the table
 * Handles expanding/collapsing launch options, loading states, error handling,
 * and interactive features like click-to-copy functionality
 * 
 * @returns {void}
 * 
 * @description
 * This function:
 * - Finds all launch option buttons in the current table
 * - Attaches click event listeners with async launch option loading
 * - Manages loading states and error handling
 * - Provides detailed user feedback and troubleshooting information
 * - Implements click-to-copy functionality for launch commands
 * - Handles graceful error recovery with user-friendly error messages
 * 
 * @example
 * setupLaunchOptionListeners(); // Called automatically by renderTable()
 * 
 * @since 1.0.0
 */
function setupLaunchOptionListeners() {
  const buttons = document.querySelectorAll('.launch-options-btn');
  console.log(`🎮 Setting up ${buttons.length} launch option button listeners`);

  buttons.forEach(button => {
    /**
     * Handle click events on launch options buttons
     * @param {Event} e - Click event object
     */
    button.addEventListener('click', async (e) => {
      const gameId = e.currentTarget.dataset.gameId;
      const optionsRow = document.getElementById(`launch-options-${gameId}`);
      
      console.log(`Launch options requested for game ID: ${gameId}`);

      // Toggle visibility if already shown (collapse functionality)
      if (optionsRow.style.display === 'table-row') {
        optionsRow.style.display = 'none';
        console.log(`👁️ Hiding options for game ${gameId}`);
        return;
      }

      // Show the row and display loading state
      optionsRow.style.display = 'table-row';
      const cell = optionsRow.querySelector('.launch-options-cell');
      cell.innerHTML = `
        <div class="loading">
          <div class="spinner"></div>
          Loading launch options for game ${gameId}...
        </div>
      `;

      try {
        console.log(`📡 Fetching options for game ${gameId}...`);
        const startTime = performance.now();
        
        // Fetch launch options from API
        const options = await fetchLaunchOptions(gameId);
        
        const endTime = performance.now();
        console.log(`📦 Received ${options.length} options in ${Math.round(endTime - startTime)}ms:`, options);

        // Handle empty results case
        if (options.length === 0) {
          cell.innerHTML = createNoOptionsMessage(gameId);
          return;
        }

        // Create the interactive options list
        const list = createLaunchOptionsList(options);
        const closeContainer = createCloseButton();

        // Replace loading state with content
        cell.innerHTML = '';
        cell.appendChild(list);
        cell.appendChild(closeContainer);
        
        console.log(`✅ Successfully rendered ${options.length} launch options for game ${gameId}`);
        
      } catch (err) {
        console.error(`💥 Failed to load launch options for game ${gameId}:`, err);
        cell.innerHTML = createErrorMessage(gameId, err);
      }
    });
  });
}

/**
 * Creates a user-friendly message for games with no launch options
 * 
 * @param {string|number} gameId - The game ID for context
 * @returns {string} HTML string for the no options message
 * 
 * @since 1.0.0
 */
function createNoOptionsMessage(gameId) {
  return `
    <div class="no-options">
      <h4>No Launch Options Found</h4>
      <p>No launch options are currently available for this game.</p>
      <details>
        <summary>Why might this happen?</summary>
        <ul>
          <li>• No community members have submitted options yet</li>
          <li>• This game doesn't benefit from launch options</li>
          <li>• Database hasn't been populated for this game</li>
          <li>• Game ID ${gameId} has no associated options in the database</li>
        </ul>
      </details>
      <button onclick="this.closest('.launch-options-row').style.display='none'" 
              class="btn btn-sm btn-ghost">Close</button>
    </div>
  `;
}

/**
 * Creates an interactive list of launch options with click-to-copy functionality
 * 
 * @param {LaunchOption[]} options - Array of launch option objects
 * @returns {HTMLUListElement} The populated launch options list element
 * 
 * @description
 * Creates a styled list where each option includes:
 * - Clickable command code (with copy functionality)
 * - Description of what the option does
 * - Metadata including source, upvotes, and verification status
 * 
 * @since 1.0.0
 */
function createLaunchOptionsList(options) {
  const list = document.createElement('ul');
  list.className = 'launch-options-list';

  options.forEach((opt, index) => {
    console.log(`📋 Rendering option ${index + 1}:`, opt);
    
    const item = document.createElement('li');
    item.className = 'launch-option';
    
    // Handle missing data gracefully with fallbacks
    const command = opt.option || opt.command || 'No command';
    const description = opt.description || 'No description available';
    const source = opt.source || 'Community';
    const upvotes = opt.upvotes || 0;
    
    // Build the option HTML structure
    item.innerHTML = `
      <div class="option-command" title="Click to copy">
        <code>${command}</code>
      </div>
      <div class="option-description">
        ${description}
      </div>
      <div class="option-meta">
        <span class="option-source" title="Source of this launch option">
          📝 ${source}
        </span>
        ${upvotes > 0 ? `<span class="option-votes" title="${upvotes} community upvotes">👍 ${upvotes}</span>` : ''}
        ${opt.verified ? '<span class="option-verified" title="Verified by community">✅ Verified</span>' : ''}
      </div>
    `;
    
    // Add click-to-copy functionality to command elements
    addCopyFunctionality(item, command);
    
    list.appendChild(item);
  });

  return list;
}

/**
 * Adds click-to-copy functionality to a launch option item
 * 
 * @param {HTMLLIElement} item - The launch option list item
 * @param {string} command - The command text to copy
 * @returns {void}
 * 
 * @description
 * Attaches a click event listener to the command code element that:
 * - Copies the command to clipboard using the Clipboard API
 * - Provides visual feedback by temporarily changing the text
 * - Handles copy failures gracefully with console warnings
 * 
 * @since 1.0.0
 */
function addCopyFunctionality(item, command) {
  const commandElement = item.querySelector('.option-command code');
  
  commandElement.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(command);
      
      // Provide visual feedback
      const originalText = commandElement.textContent;
      commandElement.textContent = 'Copied!';
      
      // Restore original text after delay
      setTimeout(() => {
        commandElement.textContent = originalText;
      }, 1000);
      
    } catch (err) {
      console.warn('Copy to clipboard failed:', err);
      
      // Fallback feedback for copy failures
      const originalText = commandElement.textContent;
      commandElement.textContent = 'Copy failed';
      setTimeout(() => {
        commandElement.textContent = originalText;
      }, 1000);
    }
  });
}

/**
 * Creates a close button container for the launch options display
 * 
 * @returns {HTMLDivElement} The close button container element
 * 
 * @since 1.0.0
 */
function createCloseButton() {
  const closeContainer = document.createElement('div');
  closeContainer.className = 'launch-options-close-container';
  closeContainer.innerHTML = `
    <button onclick="this.closest('.launch-options-row').style.display='none'" 
            class="launch-options-close">
      Close Launch Options
    </button>
  `;
  return closeContainer;
}

/**
 * Creates a comprehensive error message with troubleshooting information
 * 
 * @param {string|number} gameId - The game ID that failed to load
 * @param {Error} err - The error object containing failure details
 * @returns {string} HTML string for the error message display
 * 
 * @description
 * Analyzes the error type and provides:
 * - User-friendly error titles and messages
 * - Specific troubleshooting steps
 * - Technical details for developers
 * - Action buttons for recovery (close, reload)
 * - Direct API testing links
 * 
 * @since 1.0.0
 */
function createErrorMessage(gameId, err) {
  // Analyze error type for user feedback
  let errorTitle = '❌ Error Loading Launch Options';
  let errorMessage = err.message || 'Unknown error occurred';
  let technicalDetails = '';
  
  // Provide specific error handling based on error type
  if (err.message?.includes('Failed to fetch')) {
    errorTitle = '🌐 Connection Error';
    errorMessage = 'Unable to connect to the server. Please check that the backend is running on port 8000.';
    technicalDetails = `Attempted to fetch from: ${window.location.protocol}//${window.location.hostname}:8000/api/games/${gameId}/launch-options`;
  } else if (err.message?.includes('404')) {
    errorTitle = '🔍 Game Not Found';
    errorMessage = `Game with ID ${gameId} was not found in the database.`;
  } else if (err.message?.includes('500')) {
    errorTitle = '🏥 Server Error';
    errorMessage = 'The server encountered an error processing this request.';
  }
  
  return `
    <div class="error">
      <h3>${errorTitle}</h3>
      <p><strong>Game ID:</strong> ${gameId}</p>
      <p><strong>Error:</strong> ${errorMessage}</p>
      
      <details>
        <summary>🔧 Troubleshooting</summary>
        <div style="margin-top: 1rem;">
          <p><strong>Check:</strong></p>
          <ul>
            <li>✅ Backend server is running on port 8000</li>
            <li>✅ Database connection is working</li>
            <li>✅ Game exists in database</li>
            <li>✅ Launch options tables are populated</li>
          </ul>
          
          <p><strong>Test API directly:</strong></p>
          <code>http://localhost:8000/api/games/${gameId}/launch-options</code>
          
          ${technicalDetails ? `<p><strong>Technical Details:</strong><br/><code>${technicalDetails}</code></p>` : ''}
          
          <p><strong>Full Error:</strong></p>
          <pre style="padding: 1rem; border-radius: 4px; overflow-x: auto; font-size: 0.8rem;">
            ${err.stack || err.message || 'No additional details available'}
          </pre>
        </div>
      </details>
      
      <div style="margin-top: 1rem;">
        <button onclick="this.closest('.launch-options-row').style.display='none'" 
                class="btn btn-sm btn-ghost">Close</button>
        <button onclick="window.location.reload()" 
                class="btn btn-sm btn-primary">Reload Page</button>
      </div>
    </div>
  `;
}