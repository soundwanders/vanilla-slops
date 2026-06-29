import config from './config/env.js';
import app from './app.js';
import logger from './utils/logger.js';

const server = app.listen(config.port, () => {
  logger.info(`Server running at http://localhost:${config.port}`);
});

process.on('SIGTERM', () => { server.close(() => logger.info('Server shut down')); });
process.on('SIGINT', () => { server.close(() => logger.info('Server shut down')); });
