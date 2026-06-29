import logger from '../utils/logger.js';

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
