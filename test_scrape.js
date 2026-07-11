const dotenv = require('dotenv');
const path = require('path');
const { runScrapeCycle } = require('./scraper');
const TelegramBot = require('./telegram');

// Load environment variables
dotenv.config();

// Default master profile for testing
const testProfile = `Name: Rahul Goswami
Role: Senior Software Engineer & Tech Lead
Tech Stack: React, Node.js, Next.js, TypeScript, NestJS, PostgreSQL.
Key Expertise: Scalable system architecture, high-frequency backend pipelines, GenAI integrations (voice agents, RAG, custom automation tools).
Notable Projects: 
- Oraplus: An end-to-end home services marketplace platform.
- Tuition Management System: Built on React and Supabase handling data pipelines and states.`;

const settings = {
  useTelegram: !!(process.env.BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
  geminiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: 'gemini-3.1-flash-lite',
  telegramToken: process.env.BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  masterProfile: testProfile,
  subreddits: 'RemoteJobs', // Just check one subreddit for dry-run to keep it quick
  dmPrompt: 'Speak engineer-to-engineer. Open by addressing their exact technical pain point.',
  commentPrompt: 'Interested, sending a DM!'
};

// Mock store to prevent marking posts as processed during testing
const mockStore = {
  get(key, defaultValue) {
    return []; // Return empty array so no posts are skipped as "already processed"
  },
  set(key, value) {
    // Do not write anything to disk
  },
  delete(key) {
    // Do not delete
  },
  get store() {
    return {};
  }
};

console.log('====================================================');
console.log('Reddit Lead Assistant - Dry-Run Scrape Test');
console.log('Using Subreddits:', settings.subreddits);
console.log('Telegram Alerts:', settings.useTelegram ? 'ENABLED' : 'DISABLED');
console.log('Gemini Model:', settings.geminiModel);
console.log('====================================================');

if (!settings.geminiKey) {
  console.error('ERROR: GEMINI_API_KEY is not defined in your environment variables.');
  process.exit(1);
}

async function runDryRun() {
  console.log('Starting dry-run cycle...');
  try {
    const bot = new TelegramBot(settings.telegramToken, settings.telegramChatId);

    await runScrapeCycle(
      settings,
      mockStore,
      async (post, decisionObj) => {
        console.log('\n🔥 [MATCH CONFIRMED]');
        console.log(`Title: ${post.title}`);
        console.log(`Subreddit: r/${post.subreddit}`);
        console.log(`Author: u/${post.author}`);
        console.log(`URL: https://reddit.com${post.permalink}`);
        
        const pitch = typeof decisionObj === 'object' ? decisionObj.dmMessage : decisionObj;
        const reply = typeof decisionObj === 'object' ? decisionObj.replyMessage : settings.commentPrompt;

        console.log('\n--- Suggested DM Pitch ---');
        console.log(pitch);
        console.log('--------------------------');
        console.log('\n--- Suggested Comment Reply ---');
        console.log(reply);
        console.log('-------------------------------\n');

        if (settings.useTelegram) {
          console.log('[TELEGRAM] Sending test notification...');
          const msg = `🧪 *TEST Match Found (Dry Run)*\n\n*r/${post.subreddit}* | u/${post.author}\n${post.title}\n[Link](https://reddit.com${post.permalink})\n\n*Suggested Pitch:*\n\`\`\`\n${pitch}\n\`\`\`\n\n*Suggested Reply:*\n\`\`\`\n${reply}\n\`\`\``;
          await bot.sendMessage(msg);
          console.log('[TELEGRAM] Test notification sent successfully.');
        }
      },
      async (post) => {
        console.log(`❌ [REJECTED] Fit rejected by Gemini: "${post.title.substring(0, 50)}..."`);
      },
      async (post, reason) => {
        console.log(`⏭️ [SKIPPED] post "${post.title.substring(0, 40)}...": ${reason}`);
      },
      (msg, type = 'info') => {
        console.log(`[${type.toUpperCase()}] ${msg}`);
      }
    );

    console.log('\nDry-run completed successfully.');
  } catch (error) {
    console.error('Dry-run failed with error:', error);
  }
}

runDryRun();
