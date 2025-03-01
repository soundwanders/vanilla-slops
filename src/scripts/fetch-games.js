require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { processGames } = require('../server/controller/fetch-controller');
const createRateLimiter = require('../server/rate-limiter');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const CONCURRENT_REQUEST_LIMIT = 10;
const limit = createRateLimiter(CONCURRENT_REQUEST_LIMIT);
const BATCH_SIZE = 20;

/**
 * Fetch game details from the Steam API.
 * @param {number} appid - Steam App ID.
 * @returns {Promise<Object|null>} - Returns processed game data or null if invalid.
 */
async function fetchGameDetails(appid) {
  try {
    console.log(`Fetching details for appid: ${appid}...`);
    
    const response = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appid}`);

    if (!response.data || !response.data[appid]?.success) {
      console.log(`Invalid response for appid ${appid}, skipping.`);
      return null;
    }

    const gameData = response.data[appid].data;

    // Extract and format price
    const price = gameData.price_overview ? gameData.price_overview.final_formatted : "Free";

    return {
      appid,
      name: gameData.name || "Unknown",
      release_date: gameData.release_date?.date || null,
      price,
      is_dlc: gameData.type === "dlc",
    };
  } catch (err) {
    console.error(`Error fetching details for appid ${appid}:`, err.message);
    return null;
  }
}

/**
 * Fetch game list from Steam API and process in batches.
 */
async function fetchAndSaveGames() {
  try {
    console.log("Fetching game list from Steam...");
    const response = await axios.get('https://api.steampowered.com/ISteamApps/GetAppList/v2/');
    
    if (!response.data || !response.data.applist) {
      throw new Error("Invalid Steam API response.");
    }

    let games = response.data.applist.apps;
    console.log(`Total games available: ${games.length}`);

    if (process.env.GAME_FETCH_LIMIT) {
      games = games.slice(0, process.env.GAME_FETCH_LIMIT);
    }

    console.log(`Processing up to ${games.length} games...`);
    const totalBatches = Math.ceil(games.length / BATCH_SIZE);

    for (let i = 0; i < totalBatches; i++) {
      const batch = games.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
      console.log(`Processing batch ${i + 1} of ${totalBatches}...`);

      const gameDetails = await Promise.all(batch.map(game => limit(() => fetchGameDetails(game.appid))));
      const validGames = gameDetails.filter(Boolean);

      if (validGames.length === 0) {
        console.log("No valid games found in this batch, skipping...");
        continue;
      }

      // Process games using fetch-controller
      const processedGames = processGames(validGames, {
        excludeDLC: true,
        fields: ["appid", "name", "release_date", "price"], 
        sortBy: "release_date",
      });

      if (processedGames.length === 0) {
        console.log("No valid games left after processing, skipping insertion.");
        continue;
      }

      console.log(`Saving ${processedGames.length} games to the database...`);

      const { data, error } = await supabase.from('games').upsert(processedGames, { onConflict: ['appid'] });

      if (error) {
        console.error('Error saving games:', error.message);
      } else {
        console.log(`Successfully inserted/updated ${data.length} games.`);
      }
    }

    console.log("All batches processed successfully!");
  } catch (err) {
    console.error('Error fetching or saving games:', err.message);
  }
}

// Run the script
fetchAndSaveGames();
