require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const createRateLimiter = require('../server/rateLimiter');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Tags for NSFW filter
const NSFW_TAGS = ["Nudity", "Sexual Content", "Adult Only"];

// Control for max number of concurrent API requests
const CONCURRENT_REQUEST_LIMIT = 10;

// Batch size for processing games
const BATCH_SIZE = 20;

// Rate limiter
const limit = createRateLimiter(CONCURRENT_REQUEST_LIMIT);

/**
 * Fetch metadata for a single game
 * @param {number} appid
 * @returns {Promise<Object|null>}
 */
async function fetchGameDetails(appid) {
  try {
    const response = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appid}`);
    const gameData = response.data[appid];
    if (gameData.success && gameData.data) {
      // Exclude DLC games by checking if the game has a "is_dlc" field
      if (gameData.data.is_dlc) {
        return null; // Skip DLC games
      }
      return gameData.data; // Return detailed metadata if it's not a DLC
    }
    // Finally, log the entire fetched game list to the console
    console.log(gameData.data);
    
    return null; // Skip if the appid is invalid or data is unavailable
  } catch (err) {
    console.error(`Error fetching details for appid ${appid}:`, err.message);
    return null;
  }
}

/**
 * Filter games to exclude NSFW content and DLC
 * @param {Array<Object>} games - List of game objects to filter
 * @returns {Promise<Array<Object>>} - Filtered list of games
 */
async function filterNSFWGames(games) {
  // Fetch details for each game while respecting rate limits
  const results = await Promise.all(
    games.map(game => limit(async () => { // 'limit' ensures requests are throttled
      const details = await fetchGameDetails(game.appid);

      if (details) {
        // Extract genre descriptions or set to an empty array if undefined
        const tags = details.genres?.map(genre => genre.description) || [];

        // Check if any game tags match NSFW list
        if (!tags.some(tag => NSFW_TAGS.includes(tag))) {
          return {
            game_id: game.appid,
            name: game.name
          };
        }
      }

      // Exclude NSFW games or those without details
      return null;
    }))
  );

  // Remove any null values from the results
  return results.filter(Boolean);
}

/**
 * processGamesInBatches splits the games into smaller batches, processes each batch, 
 * fetches game details, filters out NSFW games, and saves filtered games to Supabase
 * @param {Array<Object>} games - Array of games as objects to be processed
 * @param {number} maxBatches - Defaults to Infinity
 * @returns {Promise<void>}
 */
async function processGamesInBatches(games, maxBatches = Infinity) {
  // Calculate total number of batches
  const totalBatches = Math.ceil(games.length / BATCH_SIZE);
  const batchesToProcess = Math.min(totalBatches, maxBatches);

  // Iterate through the batches
  for (let i = 0; i < batchesToProcess; i++) {
    const start = i * BATCH_SIZE;
    const end = start + BATCH_SIZE;

    // Extract current batch of games from the array
    const batch = games.slice(start, end);

    // Log which batch is being processed
    console.log(`Processing batch ${i + 1} of ${batchesToProcess}...`);

    // Filter out NSFW games based on metadata
    const filteredGames = await filterNSFWGames(batch);

    console.log(`Fetching additional details for ${filteredGames.length} games...`);

    // Fetch additional metadata for each game before inserting into the database
    const detailedGames = await Promise.all(
      filteredGames.map(async (game) => {
        const details = await fetchGameDetails(game.game_id);
        return {
          game_id: game.game_id, // Unique identifier
          name: game.name, // Game title
          description: details?.short_description || null, // Short description of the game
          genres: details?.genres?.map(g => g.description) || [], // Array of genres
          release_date: details?.release_date?.date || null, // Game release date
          developer: details?.developers?.join(", ") || null, // Developer(s)
          publisher: details?.publishers?.join(", ") || null, // Publisher(s)
          nsfw: details?.genres?.some(tag => NSFW_TAGS.includes(tag)) || false, // NSFW flag
        };
      })
    );

    console.log(`Saving ${detailedGames.length} games to the database...`);

    // Insert or update the filtered games in the database
    const { data, error } = await supabase.from('games').upsert(detailedGames);

    // Error handling
    if (error) {
      console.error('Error saving games:', error.message);
    } else {
      console.log(`Successfully inserted ${data.length} games.`);
    }
  }

  // Log the total number of batches that have been processed
  console.log(`Processed ${batchesToProcess} batch(es) successfully.`);
}


async function fetchAndSaveGames() {
  try {
    console.log("Fetching game list...");
    const response = await axios.get('https://api.steampowered.com/ISteamApps/GetAppList/v2/');
    const games = response.data.applist.apps;

    console.log(`Total games fetched: ${games.length}`);
    console.log("Processing games...");

    const maxBatches = 1;

    await processGamesInBatches(games, maxBatches);
    console.log(games);
  } catch (err) {
    console.error('Error fetching or saving games:', err.message);
  }
}

fetchAndSaveGames();
