import logger from '../utils/logger.js';

// Express identifies error-handling middleware by its 4-argument arity, so
// `next` must stay in the signature even though it is unused — removing it
// silently demotes this to ordinary middleware and error handling breaks.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'Internal Server Error';

  logger.error({ requestId: req.id, status, code, err }, message);

  const body = { error: { code, message } };
  if (req.id) body.requestId = req.id;

  res.status(status).json(body);
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

export { errorHandler, notFoundHandler };
