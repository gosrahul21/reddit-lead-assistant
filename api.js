const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const store = require('./store-instance');
const { forceGeneratePitch } = require('./scraper');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", async (req, res) => {
  res.send({
    success: true,
    status: "OK"
  });
});

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
