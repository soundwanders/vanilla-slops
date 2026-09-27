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
    // Express 5 makes req.query a getter with no setter, so plain assignment
    // throws. An own property shadows the getter, and the controllers keep
    // reading req.query as the validated, transformed values.
    Object.defineProperty(req, 'query', {
      value: parsed.data,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    next();
  };
}
