const dotenv = require('dotenv');
const cron = require('node-cron');
const store = require('./store-instance');
const config = require('./config');
const HistoryManager = require('./history-manager');
const WorkerService = require('./worker-service');
const Logger = require('./logger');

// Load environment variables
dotenv.config();

const logger = new Logger();
const historyManager = new HistoryManager(store);
const workerService = new WorkerService(store, historyManager, logger);

// Fire an initial execution immediately on launch
workerService.runSafe();

cron.schedule(config.SCRAPE_CRON_SCHEDULE, () => {
  const randomDelayMs = Math.floor(Math.random() * config.MAX_CRON_DELAY_MS);
  logger.info(`[CRON] Scheduled cycle triggered. Delaying start by ${Math.round(randomDelayMs / 1000)} seconds to randomize timing...`);
  
  setTimeout(() => {
    workerService.runSafe();
  }, randomDelayMs);
});

// --------------------------------------------------------------------
// Start API Server
// --------------------------------------------------------------------
require('./api');
