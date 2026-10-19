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

  // A 4xx message was written for the client (CORS_FORBIDDEN, a malformed
  // URI). A 5xx message was written by whatever threw, and can name a table,
  // a column or a query — it belongs in the log and in Sentry, not the body.
  const body = status >= 500
    ? { error: { code: 'INTERNAL_ERROR', message: 'Internal Server Error' } }
    : { error: { code, message } };
  if (req.id) body.requestId = req.id;

  res.status(status).json(body);
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

export { errorHandler, notFoundHandler };
