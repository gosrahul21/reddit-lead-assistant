const { GoogleGenerativeAI } = require('@google/generative-ai');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const config = require('./config');

function appendToLogFile(msg) {
  try {
    // const logPath = path.join(__dirname, 'posts.log');
    // const timestamp = new Date().toISOString();
    // fs.appendFileSync(logPath, `[${timestamp}] ${msg}\n`);
  } catch (e) {
    console.error('Failed to write to log file:', e);
  }
}

// ── Persistent processed-ID cache ────────────────────────────────────────────
// IDs are keyed by today's date so they automatically reset each new day.
function getTodayKey() {
  return `processedIds_${new Date().toISOString().slice(0, 10)}`; // e.g. processedIds_2026-06-10
}

async function loadProcessedIds(store) {
  const key = getTodayKey();
  const ids = await store.get(key, []);
  return new Set(ids);
}

async function saveProcessedIds(store, idSet) {
  const key = getTodayKey();
  await store.set(key, [...idSet]);
  await store.pruneProcessedIds(key);
}



async function fetchSubredditNewPosts(subreddit) {
  let browser;
  try {
    const launchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    
    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Load the HTML subreddit landing page first to pass WAF/Cloudflare and establish session cookies
    await page.goto(`https://www.reddit.com/r/${subreddit}`, { waitUntil: 'domcontentloaded', timeout: config.PAGE_LOAD_TIMEOUT_MS });

    // Wait a short duration for WAF cookies to stabilize
    await new Promise(resolve => setTimeout(resolve, config.WAF_STABILIZATION_DELAY_MS));

    // Fetch the public JSON endpoint from the console context of this page to bypass security blocks
    const children = await page.evaluate(async (sub) => {
      const res = await fetch(`https://www.reddit.com/r/${sub}/new.json?limit=10`);
      if (!res.ok) {
        throw new Error(`Reddit API status ${res.status}`);
      }
      const json = await res.json();
      return json.data.children.map(post => post.data);
    }, subreddit);

    return { success: true, data: children };
  } catch (error) {
    return { success: false, error: error.message, data: [] };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function analyzePostContext(title, description, settings) {
  try {
    if (!settings.geminiKey) return 'SKIP';

    const genAI = new GoogleGenerativeAI(settings.geminiKey);
    const modelName = settings.geminiModel || 'gemini-3.1-flash-lite';
    const model = genAI.getGenerativeModel({ model: modelName });

    const profileName = settings.masterProfile
      ? settings.masterProfile.split('\n')[0].replace('Name: ', '')
      : 'Rahul Goswami';

    const getEvaluatePostPrompt = require('./prompts/evaluatePostPrompt');
    const prompt = getEvaluatePostPrompt({
      profileName,
      masterProfile: settings.masterProfile,
      title,
      description,
      customDmPrompt: settings.dmPrompt
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Parse JSON
    try {
      // Remove any markdown block syntax if the model accidentally included it
      const cleanText = text.replace(/^```json/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleanText);
      if (parsed.skip) return 'SKIP';
      if (parsed.dmMessage && parsed.replyMessage) {
        return parsed;
      }
      return 'SKIP';
    } catch (e) {
      console.error('Failed to parse Gemini JSON:', text);
      return 'SKIP';
    }
  } catch (error) {
    console.error('Gemini processing exception:', error);
    return 'SKIP';
  }
}

async function runScrapeCycle(settings, store, onMatchFound, onMatchRejected, onMatchSkipped, onLog) {
  // Load today's processed IDs from persistent storage
  const processedPostIds = await loadProcessedIds(store);

  onLog(`Checking communities: ${settings.subreddits}`);
  const subs = settings.subreddits.split(',').map(s => s.trim()).filter(Boolean);

  for (let i = 0; i < subs.length; i++) {
    const subreddit = subs[i];
    const { success, error, data } = await fetchSubredditNewPosts(subreddit);

    if (!success) {
      onLog(`Failed to pull r/${subreddit}: ${error}`, 'error');
      continue;
    }

    for (const post of data) {
      if (!post.selftext) {
        if (onMatchSkipped) onMatchSkipped(post, 'No body text');
        continue;
      }
      if (post.pinned) {
        if (onMatchSkipped) onMatchSkipped(post, 'Pinned post');
        continue;
      }
      if (processedPostIds.has(post.id)) {
        if (onMatchSkipped) onMatchSkipped(post, 'Already processed today');
        continue;
      }

      // Filter outdated
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      if (post.created_utc * 1000 < startOfToday.getTime()) {
        appendToLogFile(`Skipped (Outdated/Not Today): [${subreddit}] ${post.title}`);
        if (onMatchSkipped) onMatchSkipped(post, 'Older than today');
        continue;
      }

      appendToLogFile(`Evaluating New Post: [${subreddit}] ${post.title} (URL: https://reddit.com${post.permalink})`);

      processedPostIds.add(post.id);
      // Persist immediately so a crash/restart doesn't re-process this ID
      await saveProcessedIds(store, processedPostIds);

      const decision = await analyzePostContext(post.title, post.selftext, settings);

      if (decision !== 'SKIP') {
        appendToLogFile(`--> MATCH: Lead Confirmed!`);
        onLog(`🔥 Match confirmed for post ID: ${post.id}`, 'success');
        if (onMatchFound) await onMatchFound(post, decision);
      } else {
        appendToLogFile(`--> SKIP: Gemini rejected the post as not a fit.`);
        if (onMatchRejected) await onMatchRejected(post);
      }

      // Throttle: Max 1 request per minute to Gemini API
      if (settings.geminiKey) {
        onLog(`Throttling Gemini API: Waiting ${config.DELAY_BETWEEN_POST_EVALUATIONS_MS / 1000} seconds before processing next potential lead...`);
        await new Promise(resolve => setTimeout(resolve, config.DELAY_BETWEEN_POST_EVALUATIONS_MS));
      }
    }

    // Delay between subreddits (unless it's the last one)
    if (i < subs.length - 1) {
      onLog(`Waiting ${config.DELAY_BETWEEN_SUBREDDITS_MS / 1000} seconds before scraping the next subreddit...`, 'info');
      await new Promise(resolve => setTimeout(resolve, config.DELAY_BETWEEN_SUBREDDITS_MS)); 
    }
  }
}

async function forceGeneratePitch(title, description, settings) {
  try {
    if (!settings.geminiKey) throw new Error('Missing Gemini Key');

    const genAI = new GoogleGenerativeAI(settings.geminiKey);
    const modelName = settings.geminiModel || 'gemini-3.1-flash-lite';
    const model = genAI.getGenerativeModel({ model: modelName });

    const profileName = settings.masterProfile
      ? settings.masterProfile.split('\n')[0].replace('Name: ', '')
      : 'Rahul Goswami';

    const getGeneratePitchPrompt = require('./prompts/generatePitchPrompt');
    const prompt = getGeneratePitchPrompt({
      profileName,
      masterProfile: settings.masterProfile,
      title,
      description,
      customDmPrompt: settings.dmPrompt
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const cleanText = text.replace(/^```json/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleanText);
    return parsed;
  } catch (error) {
    console.error('Gemini processing exception:', error);
    throw error;
  }
}

module.exports = {
  runScrapeCycle,
  forceGeneratePitch
};
