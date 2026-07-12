const TelegramBot = require('./telegram');
const { runScrapeCycle } = require('./scraper');

class WorkerService {
  constructor(store, historyManager, logger) {
    this.store = store;
    this.historyManager = historyManager;
    this.logger = logger;
    this.isCycleActive = false;
  }

  getCurrentIstHour() {
    const now = new Date();
    const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    return istTime.getUTCHours();
  }

  isWithinActiveWindow(settings) {
    const currentHour = this.getCurrentIstHour();
    const startH = Number(settings.runStartHour);
    const endH = Number(settings.runEndHour);

    if (startH === endH) return true;
    if (startH < endH) return currentHour >= startH && currentHour < endH;
    return currentHour >= startH || currentHour < endH;
  }

  async runSafe() {
    if (this.isCycleActive) {
      this.logger.info(`[${new Date().toLocaleTimeString()}] Skipping scrape cycle: previous cycle is still running.`);
      return;
    }

    const settings = await this.store.getAllSettings();
    
    if (!this.isWithinActiveWindow(settings)) {
      this.logger.info(`[IDLE MODE] Current hour (${this.getCurrentIstHour()}:00 IST) is OUTSIDE the configured run window (${settings.runStartHour}:00 - ${settings.runEndHour}:00 IST). Skipping scrape.`);
      return;
    }

    this.isCycleActive = true;
    this.logger.info(`[${new Date().toLocaleTimeString()}] Starting scrape cycle...`);

    try {
      const bot = new TelegramBot(settings.telegramToken, settings.telegramChatId);

      this.logger.info('----------------------------------------------------');
      this.logger.info('Reddit Lead Assistant 24/7 Backend Worker Cycle');
      this.logger.info('Monitoring Subreddits: ' + settings.subreddits);
      this.logger.info('Telegram Notifications: ' + (settings.useTelegram ? 'ENABLED' : 'DISABLED'));
      this.logger.info('Gemini Model: ' + settings.geminiModel);
      this.logger.info('----------------------------------------------------');

      await runScrapeCycle(
        settings,
        this.store,
        (post, decisionObj) => this.handleMatch(post, decisionObj, settings, bot),
        (post) => this.handleRejection(post),
        (post, reason) => { /* Post skipped */ },
        (msg, type) => this.logger.log(type, msg)
      );
    } catch (error) {
      this.logger.error('Error during scrape cycle:', error);
    } finally {
      this.isCycleActive = false;
      this.logger.info(`[${new Date().toLocaleTimeString()}] Scrape cycle finished.`);
    }
  }

  async handleMatch(post, decisionObj, settings, bot) {
    this.logger.info(`[MATCH] Found lead: r/${post.subreddit} - "${post.title}" by u/${post.author}`);
    
    const pitch = typeof decisionObj === 'object' ? decisionObj.dmMessage : decisionObj;
    const replyMessage = typeof decisionObj === 'object' ? decisionObj.replyMessage : settings.commentPrompt;

    await this.historyManager.save('allPosts', post);
    await this.historyManager.save('matchedPosts', post, pitch, replyMessage);

    if (settings.useTelegram) {
      const msg = `🚨 *New Match Found!*\n\n*r/${post.subreddit}* | u/${post.author}\n${post.title}\n[Link](https://reddit.com${post.permalink})\n\n*Suggested Pitch:*\n\`\`\`\n${pitch}\n\`\`\`\n\n*Suggested Reply:*\n\`\`\`\n${replyMessage}\n\`\`\``;
      await bot.sendMessage(msg);
      this.logger.info(`[TELEGRAM] Notification sent for post ID: ${post.id}`);
    }
  }

  async handleRejection(post) {
    this.logger.info(`[REJECTED] Fit rejected by Gemini: r/${post.subreddit} - "${post.title}"`);
    await this.historyManager.save('allPosts', post);
    await this.historyManager.save('rejectedPosts', post);
  }
}

module.exports = WorkerService;
