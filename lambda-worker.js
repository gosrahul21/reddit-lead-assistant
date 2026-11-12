const dotenv = require('dotenv');
dotenv.config();

const serverlessExpress = require('@codegenie/serverless-express');
const app = require('./api');
const store = require('./store-instance');
const HistoryManager = require('./history-manager');
const WorkerService = require('./worker-service');
const Logger = require('./logger');

const logger = new Logger();
const historyManager = new HistoryManager(store);
const workerService = new WorkerService(store, historyManager, logger);

let serverlessExpressHandler;

/**
 * Universal AWS Lambda Handler:
 * 1. EventBridge Cron -> Runs periodic scrape cycle
 * 2. HTTP Requests -> Serves Express REST API for the frontend
 */
exports.handler = async (event, context) => {
  // Detect if event came from EventBridge Cron or an HTTP request
  const isHttpRequest = !!(event.rawPath || event.httpMethod || event.requestContext?.http);

  if (!isHttpRequest) {
    // ----------------------------------------------------
    // 1. Cron / Scheduled Event Trigger
    // ----------------------------------------------------
    logger.info('[LAMBDA] EventBridge scheduled trigger received.');
    try {
      await workerService.runSafe();
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: 'Scrape cycle completed successfully'
        })
      };
    } catch (error) {
      logger.error('[LAMBDA] Error during scheduled scrape cycle:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, error: error.message })
      };
    }
  }

  // ------------------------------------------------------
  // 2. HTTP API Request (Frontend calls e.g. /api/posts)
  // ------------------------------------------------------
  if (!serverlessExpressHandler) {
    serverlessExpressHandler = serverlessExpress({ app });
  }

  return serverlessExpressHandler(event, context);
};
