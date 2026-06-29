import logger from '../utils/logger.js';

export default function logRequests(req, res, next) {
  req.id = crypto.randomUUID();
  const start = Date.now();

  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]({ requestId: req.id, method: req.method, url: req.originalUrl, status: res.statusCode, ms });
  });

  next();
}
