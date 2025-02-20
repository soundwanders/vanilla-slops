const DEFAULT_FIELDS = ["name", "release_date", "price_overview"]; // Default fields to extract

/**
 * Filters game data based on requested fields
 * @param {Object} gameData - Raw game data from the Steam API
 * @param {Array<string>} fields - Fields to extract
 * @returns {Object} - Filtered and structured game data
 */
function filterGameData(gameData, fields = DEFAULT_FIELDS) {
  return fields.reduce((filtered, field) => {
    if (field === "release_date" && gameData.release_date) {
      filtered.release_date = gameData.release_date.date || null;
    } else if (field === "price_overview" && gameData.price_overview) {
      filtered.price = gameData.price_overview.final || null;
    } else if (field in gameData) {
      filtered[field] = gameData[field];
    }
    return filtered;
  }, {});
}

/**
 * Processes the Steam game data with filtering and sorting
 * @param {Object} steamGames - Raw game data from the Steam API
 * @param {Object} options - Filtering and sorting options
 * @returns {Array<Object>} - Processed game data
 */
function processGames(steamGames, options = {}) {
  const { excludeDLC = true, fields = DEFAULT_FIELDS, sortBy = "name" } = options;

  let games = Object.values(steamGames)
    .filter(game => game.success && game.data) // Ensure valid games
    .map(game => game.data) // Extract only the 'data' part
    .filter(game => !excludeDLC || game.type !== "dlc") // Exclude DLC if enabled
    .map(game => filterGameData(game, fields)); // Extract only selected fields

  // Sorting (default: by name)
  if (sortBy && games.length > 0) {
    games.sort((a, b) => {
      if (sortBy === "release_date") {
        return new Date(b.release_date || "1970-01-01") - new Date(a.release_date || "1970-01-01");
      }
      return (a[sortBy] || "").localeCompare(b[sortBy] || "");
    });
  }

  return games;
}

module.exports = { processGames };
