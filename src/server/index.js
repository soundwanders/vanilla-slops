import config from './config/env.js';
import app from './app.js';
import { log } from './utils/logger.js';

app.listen(config.port, () => {
  log(`Server running at http://localhost:${config.port}`);
});
