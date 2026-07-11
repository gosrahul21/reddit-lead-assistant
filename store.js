const { Redis } = require('@upstash/redis');

class Store {
  constructor(options = {}) {
    this.defaults = options.defaults || {};
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    this.namespace = 'rla:'; // Prefix keys to avoid collisions
  }

  async get(key, defaultValue) {
    try {
      const data = await this.redis.get(this.namespace + key);
      if (data !== null && data !== undefined) {
        return data;
      }
    } catch (e) {
      console.error('Redis GET Error for key:', key, e);
    }
    return defaultValue !== undefined ? defaultValue : this.defaults[key];
  }

  async set(key, value) {
    try {
      if (typeof key === 'object' && key !== null) {
        // Bulk set
        for (const [k, v] of Object.entries(key)) {
          await this.redis.set(this.namespace + k, v);
        }
      } else {
        await this.redis.set(this.namespace + key, value);
      }
    } catch (e) {
      console.error('Redis SET Error for key:', key, e);
    }
  }

  async delete(key) {
    try {
      await this.redis.del(this.namespace + key);
    } catch (e) {
      console.error('Redis DEL Error:', e);
    }
  }

  async getAllSettings() {
    const keys = [
      'masterProfile', 'subreddits', 'dmPrompt', 'commentPrompt', 
      'geminiKey', 'geminiModel', 'telegramToken', 'telegramChatId', 'useTelegram',
      'runStartHour', 'runEndHour'
    ];
    const settings = {};
    for (const key of keys) {
      settings[key] = await this.get(key, this.defaults[key]);
    }
    return settings;
  }

  async pruneProcessedIds(currentKey) {
    try {
      // Find all keys starting with processedIds_
      const keys = await this.redis.keys(this.namespace + 'processedIds_*');
      for (const fullKey of keys) {
        const k = fullKey.replace(this.namespace, '');
        if (k !== currentKey) {
          await this.delete(k);
        }
      }
    } catch (e) {
      console.error('Redis Prune Error:', e);
    }
  }
}

module.exports = Store;
