import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

const logger = pino(
  isDev
    ? { level: 'debug', transport: { target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } } }
    : { level: 'info' }
);

export default logger;

// Named export kept for any callers using `import { log }`
export function log(...args) {
  logger.info(args.join(' '));
}
