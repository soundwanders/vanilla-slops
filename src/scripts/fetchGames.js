require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const createRateLimiter = require('../server/rateLimiter');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// ! TODO: EXCLUDE DLC FROM FETCHED GAMES LIST

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
      return gameData.data; // Return detailed metadata
    }
    return null; // Skip if the appid is invalid or data is unavailable
  } catch (err) {
    console.error(`Error fetching details for appid ${appid}:`, err.message);
    return null;
  }
}

/**
 * Filter games to exclude NSFW content
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

        // Check if any game tags matches NSFW list
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
  // Null values would be unlisted or nsfw games
  return results.filter(Boolean);
};

/**
 * Process games in batches with a limit on the number of batches
 * @param {Array<Object>} games - The list of games to process
 * @param {number} maxBatches - Maximum number of batches to process (defaults to Infinity)
 * @returns {Promise<void>}
 */
async function processGamesInBatches(games, maxBatches = Infinity) {
  // Calculate the total number of batches based on the size of each batch
  const totalBatches = Math.ceil(games.length / BATCH_SIZE);
  
  // Determine how many batches to process, respecting the maxBatches limit
  const batchesToProcess = Math.min(totalBatches, maxBatches);

  // Loop through each batch and process them one by one
  for (let i = 0; i < batchesToProcess; i++) {
    // Define the start and end indices for the current batch
    const start = i * BATCH_SIZE;
    const end = start + BATCH_SIZE;
    
    const batch = games.slice(start, end);

    // Log the progress of the current batch
    console.log(`Processing batch ${i + 1} of ${batchesToProcess}...`);
    
    const filteredGames = await filterNSFWGames(batch);

    // Log how many filtered games will be saved
    console.log(`Saving ${filteredGames.length} games to the database...`);
    
    // Insert or update the filtered games in the database
    const { data, error } = await supabase.from('games').upsert(filteredGames);

    // Error handling
    if (error) {
      console.error('Error saving games:', error.message);
    } else {
      console.log(`Successfully inserted ${data.length} games.`);
    }
  }

  // Log the total number of batches processed successfully.
  console.log(`Processed ${batchesToProcess} batch(es) successfully.`);
}

/**
 * Function splits the games into smaller batches, processes each batch, fetches game details, 
 * filters out NSFW games, and saves the filtered games to Supabase postgreSQL database
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
          game_id: game.game_id,
          name: game.name, 
          description: details?.short_description || null,
          genres: details?.genres?.map(g => g.description) || [],
          release_date: details?.release_date?.date || null,
          developer: details?.developers?.join(", ") || null,
          publisher: details?.publishers?.join(", ") || null,
          nsfw: details?.genres?.some(tag => NSFW_TAGS.includes(tag)) || false,
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

    // this controls the amount of batches that get processed
    // maxBatches acts as a valve to control the data fetched
    // be careful opening the handle all the way :D
    const maxBatches = 3;

    await processGamesInBatches(games, maxBatches);
  } catch (err) {
    console.error('Error fetching or saving games:', err.message);
  }
}

fetchAndSaveGames();
