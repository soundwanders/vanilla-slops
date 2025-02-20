router.get('/games', async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  try {
    const start = (page - 1) * limit;
    const end = start + parseInt(limit, 10) - 1;

    // Fetch total amount of games
    const { count } = await supabase.from('games').select('*', { count: 'exact', head: true });

    // Fetch paginated games
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .range(start, end);

    if (error) throw error;

    res.json({ games: data, total: count, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
