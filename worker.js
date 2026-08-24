const dotenv = require('dotenv');
const cron = require('node-cron');
const store = require('./store-instance');
const config = require('./config');
const HistoryManager = require('./history-manager');
const WorkerService = require('./worker-service');
const Logger = require('./logger');
const express = require('express');
const cors = require('cors');

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
const app = express();
app.use(cors(['http://localhost:5173', 'https://leadplay.addsubtitles.info']));
app.use(express.json());

app.get("/health", async (req, res) => {
  res.send({
    success: true,
    status: "OK"
  });
});

app.get('/api/posts', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const start = (page - 1) * limit;
  const end = start + limit;

  const allPosts = await store.get('allPosts', []);
  const matchedPosts = await store.get('matchedPosts', []);
  const rejectedPosts = await store.get('rejectedPosts', []);

  res.json({
    all: { data: allPosts.slice(start, end), total: allPosts.length },
    matched: { data: matchedPosts.slice(start, end), total: matchedPosts.length },
    rejected: { data: rejectedPosts.slice(start, end), total: rejectedPosts.length }
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
