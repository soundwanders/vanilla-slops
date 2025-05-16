import { z } from 'zod';

export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({ error: result.error.format() });
    }
    req.query = result.data; // Save validated query
    next();
  };
}
