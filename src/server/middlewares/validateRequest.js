export function validateRequest(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          fields: parsed.error.format()
        }
      });
    }
    req.query = parsed.data;
    next();
  };
}
