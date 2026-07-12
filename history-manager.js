class HistoryManager {
  constructor(store) {
    this.store = store;
  }

  async save(category, post, pitch = null, replyMessage = null) {
    const list = await this.store.get(category, []);
    const entry = { ...post, savedAt: new Date().toISOString() };
    
    if (pitch) {
      entry.pitch = pitch;
    }
    
    if (replyMessage) {
      entry.replyMessage = replyMessage;
    }
    
    list.unshift(entry);
    
    if (list.length > 1000) {
      list.length = 1000;
    }
    
    await this.store.set(category, list);
  }
}

module.exports = HistoryManager;
