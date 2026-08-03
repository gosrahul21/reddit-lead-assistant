const dotenv = require('dotenv');
const Store = require('./store');

// Load environment variables before setting up store defaults
dotenv.config();

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

module.exports = store;
