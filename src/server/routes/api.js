const express = require('express');
const router = express.Router();
const supabase = require('../database');

// Get all games (with pagination)
router.get('/games', async (req, res) => {
  const { page = 1, limit = 20, search = '' } = req.query;
  const offset = (page - 1) * limit;
  
  let query = supabase
    .from('games')
    .select('*', { count: 'exact' })
    .range(offset, offset + limit - 1);
    
  if (search) {
    query = query.ilike('title', `%${search}%`);
  }
  
  const { data, error, count } = await query;
  
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  
  return res.json({
    games: data,
    totalCount: count,
    page: parseInt(page),
    totalPages: Math.ceil(count / limit)
  });
});

// Get a specific game's launch options
router.get('/games/:appId/launch-options', async (req, res) => {
  const { appId } = req.params;
  
  const { data, error } = await supabase
    .from('launch_options')
    .select('*')
    .eq('app_id', appId);
    
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  
  return res.json(data);
});

module.exports = router;