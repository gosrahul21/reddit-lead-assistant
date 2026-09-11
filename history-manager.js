const config = require('./config');

class HistoryManager {
  constructor(store) {
    this.store = store;
  }

  async save(category, post, pitch = null, replyMessage = null) {
    const postsMap = await this.store.get('postsMap', {});
    const matchedIds = await this.store.get('matchedPostIds', []);
    const rejectedIds = await this.store.get('rejectedPostIds', []);

    const entry = {
      ...post,
      savedAt: post.savedAt || new Date().toISOString()
    };

    if (pitch) entry.pitch = pitch;
    if (replyMessage) entry.replyMessage = replyMessage;

    // Store normalized post object in postsMap
    postsMap[post.id] = entry;

    if (category === 'matchedPosts') {
      if (!matchedIds.includes(post.id)) {
        matchedIds.unshift(post.id);
      }
    } else if (category === 'rejectedPosts') {
      if (!rejectedIds.includes(post.id)) {
        rejectedIds.unshift(post.id);
      }
    }

    await this.store.set('postsMap', postsMap);
    await this.store.set('matchedPostIds', matchedIds);
    await this.store.set('rejectedPostIds', rejectedIds);
  }

  async isProcessed(postId) {
    const matchedIds = await this.store.get('matchedPostIds', []);
    if (matchedIds.includes(postId)) return true;

    const rejectedIds = await this.store.get('rejectedPostIds', []);
    if (rejectedIds.includes(postId)) return true;

    const postsMap = await this.store.get('postsMap', {});
    return !!postsMap[postId];
  }

  async prune72HourOldData(retentionHours = config.HISTORY_RETENTION_HOURS || 72) {
    const cutoffTime = Date.now() - (retentionHours * 60 * 60 * 1000);

    const postsMap = await this.store.get('postsMap', {});
    let matchedIds = await this.store.get('matchedPostIds', []);
    let rejectedIds = await this.store.get('rejectedPostIds', []);

    let prunedCount = 0;
    for (const [id, entry] of Object.entries(postsMap)) {
      const savedTime = entry && entry.savedAt ? new Date(entry.savedAt).getTime() : 0;
      if (savedTime < cutoffTime) {
        delete postsMap[id];
        prunedCount++;
      }
    }

    // Keep only IDs that exist in the pruned postsMap
    matchedIds = matchedIds.filter(id => postsMap[id] !== undefined);
    rejectedIds = rejectedIds.filter(id => postsMap[id] !== undefined);

    await this.store.set('postsMap', postsMap);
    await this.store.set('matchedPostIds', matchedIds);
    await this.store.set('rejectedPostIds', rejectedIds);

    // Cleanup legacy unnormalized Redis keys if present
    await this.store.delete('allPosts');
    await this.store.delete('matchedPosts');
    await this.store.delete('rejectedPosts');
    await this.store.pruneProcessedIds('none'); // cleans processedIds_* keys

    return { prunedCount, remainingPosts: Object.keys(postsMap).length };
  }

  async getPosts(limit = null) {
    const postsMap = await this.store.get('postsMap', {});
    let matchedIds = await this.store.get('matchedPostIds', []);
    let rejectedIds = await this.store.get('rejectedPostIds', []);

    let matched = matchedIds.map(id => postsMap[id]).filter(Boolean);
    let rejected = rejectedIds.map(id => postsMap[id]).filter(Boolean);

    let all = [...matched, ...rejected].sort((a, b) => {
      const timeA = a.savedAt ? new Date(a.savedAt).getTime() : 0;
      const timeB = b.savedAt ? new Date(b.savedAt).getTime() : 0;
      return timeB - timeA;
    });

    if (limit && Number(limit) > 0) {
      const parsedLimit = Number(limit);
      matched = matched.slice(0, parsedLimit);
      rejected = rejected.slice(0, parsedLimit);
      all = all.slice(0, parsedLimit);
    }

    return { all, matched, rejected };
  }

  async getPostById(postId) {
    const postsMap = await this.store.get('postsMap', {});
    return postsMap[postId] || null;
  }
}

module.exports = HistoryManager;
