import gameService from '../services/gameService.js';

export const getAllGames = async (req, res, next) => {
  try {
    const games = await gameService.fetchAllGames();
    res.json(games);
  } catch (err) {
    next(err);
  }
};

export async function getGames(req, res, next) {
  try {
    const { sort, order, page, limit } = req.query;

    const pageNum = parseInt(page);
    const pageSize = parseInt(limit);
    const offset = (pageNum - 1) * pageSize;

    const { data, error, count } = await supabase
      .from('games')
      .select('*', { count: 'exact' })
      .order(sort, { ascending: order === 'asc' })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    res.json({
      total: count,
      page: pageNum,
      perPage: pageSize,
      results: data
    });
  } catch (err) {
    next(err);
  }
}
