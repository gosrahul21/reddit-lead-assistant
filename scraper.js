const { GoogleGenerativeAI } = require('@google/generative-ai');
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
async function loadProcessedIds(store) {
  const matched = await store.get('matchedPostIds', []);
  const rejected = await store.get('rejectedPostIds', []);
  return new Set([...matched, ...rejected]);
}

async function saveProcessedIds(store, idSet) {
  // Processing state is maintained via historyManager save operations
}



async function launchBrowser() {
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    try {
      const chromiumModule = await import('@sparticuz/chromium');
      const chromium = chromiumModule.default || chromiumModule;
      const puppeteerCoreModule = await import('puppeteer-core');
      const puppeteerCore = puppeteerCoreModule.default || puppeteerCoreModule;
      return await puppeteerCore.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });
    } catch (err) {
      console.error('[LAMBDA] Sparticuz Chromium launch failed, attempting Puppeteer fallback:', err);
      // Fallback for Docker container on Lambda
      const puppeteerModule = await import('puppeteer');
      const puppeteer = puppeteerModule.default || puppeteerModule;
      return await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
      });
    }
  }

  // Local development
  const puppeteerModule = await import('puppeteer');
  const puppeteer = puppeteerModule.default || puppeteerModule;
  return await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
}

async function fetchSubredditNewPosts(subreddit) {
  let browser;
  try {
    browser = await launchBrowser();

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navigate directly to the subreddit's new posts page
    await page.goto(`https://www.reddit.com/r/${subreddit}/new`, { waitUntil: 'networkidle2', timeout: config.PAGE_LOAD_TIMEOUT_MS });

    // Scroll slightly to trigger hydration of post elements
    await page.evaluate(() => window.scrollBy(0, 1000));
    await new Promise(resolve => setTimeout(resolve, config.WAF_STABILIZATION_DELAY_MS || 1500));

    // Extract posts directly from the rendered DOM (bypasses Reddit's 403 on unauthenticated .json endpoints)
    const posts = await page.evaluate((sub) => {
      const shredditPosts = Array.from(document.querySelectorAll('shreddit-post'));
      if (shredditPosts.length > 0) {
        return shredditPosts.slice(0, 15).map(el => {
          const bodyEl = el.querySelector('[slot="text-body"], .md, div[id*="post-rtjson-content"]');
          const timestamp = el.getAttribute('created-timestamp');
          const permalink = el.getAttribute('permalink') || '';
          return {
            id: (el.getAttribute('id') || '').replace(/^t3_/, ''),
            title: el.getAttribute('post-title') || '',
            selftext: bodyEl ? bodyEl.innerText.trim() : '',
            author: el.getAttribute('author') || '',
            permalink: permalink,
            url: el.getAttribute('content-href') || ('https://www.reddit.com' + permalink),
            subreddit: el.getAttribute('subreddit-prefixed-name')?.replace(/^r\//, '') || el.getAttribute('subreddit-name') || sub,
            pinned: el.hasAttribute('pinned') || el.classList.contains('pinned'),
            created_utc: timestamp ? Math.floor(new Date(timestamp).getTime() / 1000) : Math.floor(Date.now() / 1000)
          };
        });
      }

      // Legacy fallback (old.reddit style if served)
      const legacyPosts = Array.from(document.querySelectorAll('div.thing'));
      if (legacyPosts.length > 0) {
        return legacyPosts.slice(0, 15).map(el => {
          const titleEl = el.querySelector('a.title');
          const bodyEl = el.querySelector('div.usertext-body');
          return {
            id: (el.getAttribute('data-fullname') || '').replace(/^t3_/, ''),
            title: titleEl ? titleEl.innerText.trim() : '',
            selftext: bodyEl ? bodyEl.innerText.trim() : '',
            author: el.getAttribute('data-author') || '',
            permalink: el.getAttribute('data-permalink') || '',
            url: el.getAttribute('data-url') || '',
            subreddit: el.getAttribute('data-subreddit') || sub,
            pinned: el.classList.contains('stickied'),
            created_utc: Number(el.getAttribute('data-timestamp') || Date.now()) / 1000
          };
        });
      }

      return [];
    }, subreddit);

    return { success: true, data: posts };
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

    // if title start with "[FOR HIRE]" then SKIP
    if (title.toUpperCase().includes('[FOR HIRE]')) {
      console.log('Skipping post: title contains [FOR HIRE]');
      return 'SKIP';
    }

    const getEvaluatePostPrompt = require('./prompts/evaluatePostPrompt');
    const prompt = getEvaluatePostPrompt({
      profileName,
      masterProfile: settings.masterProfile,
      title,
      description,
      customDmPrompt: settings.dmPrompt
    });

    // MAKING LLM CALL
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

    onLog(`[${subreddit}] Found ${data ? data.length : 0} posts on page.`);

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
        if (onMatchSkipped) onMatchSkipped(post, 'Already processed in 72h window');
        continue;
      }

      // Filter outdated posts (older than retention window)
      const retentionCutoffMs = Date.now() - ((config.HISTORY_RETENTION_HOURS || 72) * 60 * 60 * 1000);
      if (post.created_utc * 1000 < retentionCutoffMs) {
        appendToLogFile(`Skipped (Older than ${config.HISTORY_RETENTION_HOURS || 72}h): [${subreddit}] ${post.title}`);
        if (onMatchSkipped) onMatchSkipped(post, `Older than ${config.HISTORY_RETENTION_HOURS || 72} hours`);
        continue;
      }

      appendToLogFile(`Evaluating New Post: [${subreddit}] ${post.title} (URL: https://reddit.com${post.permalink})`);

      processedPostIds.add(post.id);

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
