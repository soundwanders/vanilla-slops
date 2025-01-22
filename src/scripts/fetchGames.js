const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function fetchAndSaveGames() {
  try {
    const response = await axios.get('https://api.steampowered.com/ISteamApps/GetAppList/v2/');
    const games = response.data.applist.apps;

    const { data, error } = await supabase
      .from('games')
      .upsert(games.map(game => ({ game_id: game.appid, name: game.name })));

    if (error) throw error;

    console.log(`Inserted ${data.length} games into the database.`);
  } catch (err) {
    console.error('Error fetching or saving games:', err.message);
  }
}

fetchAndSaveGames();
