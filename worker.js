const dotenv = require('dotenv');
const path = require('path');
const cron = require('node-cron');
const express = require('express');
const cors = require('cors');
const Store = require('./store');
const { runScrapeCycle, forceGeneratePitch } = require('./scraper');
const TelegramBot = require('./telegram');
const config = require('./config');

// Load environment variables
dotenv.config();

// Initialize persistent store
const store = new Store({
  defaults: {
    useTelegram: !!(process.env.BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    geminiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: 'gemini-3.1-flash-lite',
    telegramToken: process.env.BOT_TOKEN || '',
    telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
    runStartHour: 9,
    runEndHour: 3,
    masterProfile: `Name: Rahul Goswami
Role: Senior Software Engineer & Tech Lead
Tech Stack: React, Node.js, Next.js, TypeScript, NestJS, PostgreSQL.
Key Expertise: Scalable system architecture, high-frequency backend pipelines, GenAI integrations (voice agents, RAG, custom automation tools).
Notable Projects: 
- Oraplus: An end-to-end home services marketplace platform.
- Tuition Management System: Built on React and Supabase handling data pipelines and states.`,
    subreddits: 'RemoteJobs, remotejs, devjobs',
    dmPrompt: 'Speak engineer-to-engineer. Open by addressing their exact technical pain point.',
    commentPrompt: 'Interested, sending a DM!'
  }
});

async function savePostToHistory(category, post, pitch = null) {
  const list = await store.get(category, []);
  const entry = { ...post, savedAt: new Date().toISOString() };
  if (pitch) entry.pitch = pitch;
  list.unshift(entry);
  if (list.length > 1000) list.length = 1000;
  await store.set(category, list);
}

let isCycleActive = false;

async function runScraperCycleSafe() {
  if (isCycleActive) {
    console.log(`[${new Date().toLocaleTimeString()}] Skipping scrape cycle: previous cycle is still running.`);
    return;
  }
  
  const settings = await store.getAllSettings();
  const currentHour = new Date().getHours();
  
  // Active Window logic: Check if current hour is within the allowed run window
  let isActive = false;
  const startH = Number(settings.runStartHour);
  const endH = Number(settings.runEndHour);
  
  if (startH === endH) {
    // If they are the same, assume it runs 24/7
    isActive = true;
  } else if (startH < endH) {
    // Normal window e.g., 9 to 17 (9 AM to 4:59 PM)
    if (currentHour >= startH && currentHour < endH) isActive = true;
  } else if (startH > endH) {
    // Wrap around midnight e.g., 9 to 3 (9 AM to 2:59 AM)
    if (currentHour >= startH || currentHour < endH) isActive = true;
  }
  
  if (!isActive) {
    console.log(`[IDLE MODE] Current hour (${currentHour}:00) is OUTSIDE the configured run window (${startH}:00 - ${endH}:00). Skipping scrape.`);
    return;
  }
  
  isCycleActive = true;

  console.log(`[${new Date().toLocaleTimeString()}] Starting scrape cycle...`);
  try {
    const settings = await store.getAllSettings();
    const bot = new TelegramBot(settings.telegramToken, settings.telegramChatId);

    console.log('----------------------------------------------------');
    console.log('Reddit Lead Assistant 24/7 Backend Worker Cycle');
    console.log('Monitoring Subreddits:', settings.subreddits);
    console.log('Telegram Notifications:', settings.useTelegram ? 'ENABLED' : 'DISABLED');
    console.log('Gemini Model:', settings.geminiModel);
    console.log('----------------------------------------------------');

    await runScrapeCycle(
      settings,
      store,
      async (post, decisionObj) => {
        console.log(`[MATCH] Found lead: r/${post.subreddit} - "${post.title}" by u/${post.author}`);
        
        const pitch = typeof decisionObj === 'object' ? decisionObj.dmMessage : decisionObj;
        const replyMessage = typeof decisionObj === 'object' ? decisionObj.replyMessage : settings.commentPrompt;

        await savePostToHistory('allPosts', post);
        await savePostToHistory('matchedPosts', post, pitch);

        // Send Telegram alert
        if (settings.useTelegram) {
          const msg = `🚨 *New Match Found!*\n\n*r/${post.subreddit}* | u/${post.author}\n${post.title}\n[Link](https://reddit.com${post.permalink})\n\n*Suggested Pitch:*\n\`\`\`\n${pitch}\n\`\`\`\n\n*Suggested Reply:*\n\`\`\`\n${replyMessage}\n\`\`\``;
          await bot.sendMessage(msg);
          console.log(`[TELEGRAM] Notification sent for post ID: ${post.id}`);
        }
      },
      async (post) => {
        console.log(`[REJECTED] Fit rejected by Gemini: r/${post.subreddit} - "${post.title}"`);
        await savePostToHistory('allPosts', post);
        await savePostToHistory('rejectedPosts', post);
      },
      async (post, reason) => {
        // Post skipped
      },
      (msg, type = 'info') => {
        console.log(`[${type.toUpperCase()}] ${msg}`);
      }
    );
  } catch (error) {
    console.error('Error during scrape cycle:', error);
  } finally {
    isCycleActive = false;
    console.log(`[${new Date().toLocaleTimeString()}] Scrape cycle finished.`);
  }
}

// Fire an initial execution immediately on launch
runScraperCycleSafe();

cron.schedule(config.SCRAPE_CRON_SCHEDULE, () => {
  const randomDelayMs = Math.floor(Math.random() * config.MAX_CRON_DELAY_MS);
  console.log(`[CRON] Scheduled cycle triggered. Delaying start by ${Math.round(randomDelayMs / 1000)} seconds to randomize timing...`);
  setTimeout(() => {
    runScraperCycleSafe();
  }, randomDelayMs);
});

// --------------------------------------------------------------------
// API Server for UI
// --------------------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/posts', async (req, res) => {
  res.json({
    all: await store.get('allPosts', []),
    matched: await store.get('matchedPosts', []),
    rejected: await store.get('rejectedPosts', [])
  });
});

app.get('/api/settings', async (req, res) => {
  const settings = await store.getAllSettings();
  res.json(settings);
});

app.post('/api/settings', async (req, res) => {
  const keys = [
    'masterProfile', 'subreddits', 'dmPrompt', 'commentPrompt', 
    'geminiKey', 'geminiModel', 'telegramToken', 'telegramChatId', 'useTelegram',
    'runStartHour', 'runEndHour'
  ];
  for (const k of keys) {
    if (req.body[k] !== undefined) {
      await store.set(k, req.body[k]);
    }
  }
  res.json({ success: true });
});

app.post('/api/generate-pitch', async (req, res) => {
  const { postId } = req.body;
  if (!postId) return res.status(400).json({ error: 'postId is required' });

  const rejected = await store.get('rejectedPosts', []);
  const post = rejected.find(p => p.id === postId);

  if (!post) {
    return res.status(404).json({ error: 'Post not found in rejected list' });
  }

  try {
    const settings = await store.getAllSettings();
    const pitch = await forceGeneratePitch(post.title, post.selftext, settings);
    res.json({ success: true, pitch });
  } catch (error) {
    console.error('API /generate-pitch error:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API Server listening on port ${PORT}`);
});
