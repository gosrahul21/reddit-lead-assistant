const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const store = require('./store-instance');
const HistoryManager = require('./history-manager');
const { forceGeneratePitch } = require('./scraper');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const historyManager = new HistoryManager(store);

app.get("/health", async (req, res) => {
  res.send({
    success: true,
    status: "OK"
  });
});

app.get('/api/posts', async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;
  const posts = await historyManager.getPosts(limit);
  res.json(posts);
});

app.post('/api/posts/cleanup', async (req, res) => {
  const retentionHours = req.body.retentionHours ? parseInt(req.body.retentionHours, 10) : undefined;
  const result = await historyManager.prune72HourOldData(retentionHours);
  res.json({ success: true, ...result });
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

  const post = await historyManager.getPostById(postId);

  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
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
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  app.listen(PORT, () => {
    console.log(`API Server listening on port ${PORT}`);
  });
}

module.exports = app;
