const DEFAULT_FIELDS = ["name", "release_date", "price_overview", "is_free", "type", "developer", "publisher", "header_image", "background"];

/**
 * Filters game data based on requested fields
 * @param {Object} gameData - Raw game data from the Steam API
 * @param {Array<string>} fields - Fields to extract
 * @returns {Object} - Filtered and structured game data
 */
function filterGameData(gameData, fields = DEFAULT_FIELDS) {
  const filteredData = {};
  
  // Extract the fields and handle any missing data
  fields.forEach(field => {
    switch (field) {
      case 'name':
        filteredData.name = gameData.name || 'Unnamed Game';
        break;
      case 'short_description':
        filteredData.description = gameData.short_description || 'No description available.';
        break;
      case 'release_date':
        filteredData.release_date = gameData.release_date?.date || null;
        break;
      case 'genres':
        filteredData.genres = gameData.genres || [];
        break;
      case 'developers':
        filteredData.developer = gameData.developers?.map(dev => dev.name).join(', ') || 'Unknown Developer';
        break;
      case 'publishers':
        filteredData.publisher = gameData.publishers?.map(pub => pub.name).join(', ') || 'Unknown Publisher';
        break;
      case 'header_image':
        filteredData.header_image = gameData.header_image || '';
        break;
      case 'background':
        filteredData.background = gameData.background || '';
        break;
      case 'is_free':
        filteredData.is_free = gameData.is_free || false;  // Assuming 'false' if not present
        break;
      case 'type':
        filteredData.type = gameData.type || 'unknown';  // Default to 'unknown' if type is missing
        break;
      default:
        filteredData[field] = null;
    }
  });

  return filteredData;
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
    .filter(game => game.success && game.data)  // Ensure valid games
    .map(game => game.data)  // Extract only the 'data' part
    .filter(game => !excludeDLC || game.type !== "dlc")  // Exclude DLC if enabled
    .map(game => filterGameData(game, fields));  // Extract only selected fields

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
