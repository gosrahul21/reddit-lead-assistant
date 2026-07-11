/**
 * Application Configuration
 * 
 * Centralized settings for timeouts, intervals, and scheduling.
 */

module.exports = {
  // ==========================================
  // Application Scheduling
  // ==========================================
  
  // How often the worker triggers a full scrape cycle (Cron expression format)
  // Default: '*/45 * * * *' (Every 45 minutes)
  SCRAPE_CRON_SCHEDULE: '*/45 * * * *', 

  // Maximum random delay to add before starting a cron cycle (in milliseconds)
  // Default: 120000 (2 minutes) to make the cron execution look more organic and less bot-like
  MAX_CRON_DELAY_MS: 120000,

  // ==========================================
  // Scraper Rate Limits & Delays
  // ==========================================

  // Delay between scanning different subreddits in the same cycle (in milliseconds)
  // Default: 120000 (2 minutes)
  DELAY_BETWEEN_SUBREDDITS_MS: 120000, 

  // Delay between Gemini API calls to evaluate individual posts (in milliseconds)
  // This prevents hitting the free-tier rate limit of Gemini APIs.
  // Default: 60000 (60 seconds)
  DELAY_BETWEEN_POST_EVALUATIONS_MS: 60000, 

  // ==========================================
  // Browser & Network Timeouts
  // ==========================================

  // Maximum time to wait for a Reddit page to load (in milliseconds)
  PAGE_LOAD_TIMEOUT_MS: 60000, 

  // Time to wait on the page for Cloudflare/WAF cookies to stabilize before fetching JSON
  WAF_STABILIZATION_DELAY_MS: 3000, 
};
