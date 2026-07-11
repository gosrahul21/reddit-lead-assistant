class TelegramBot {
  constructor(token, chatId) {
    this.token = token;
    this.chatId = chatId;
    this.apiUrl = `https://api.telegram.org/bot${token}`;
  }

  async sendMessage(text) {
    if (!this.token || !this.chatId) {
      console.warn('Telegram Bot not fully configured (token or chatId missing).');
      return;
    }

    const payload = {
      chat_id: this.chatId,
      text: text,
      parse_mode: 'Markdown'
    };

    try {
      const response = await fetch(`${this.apiUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Telegram API error: ${response.status} - ${errorText}`);
      }
    } catch (e) {
      console.error('Telegram Send Error:', e);
    }
  }
}

module.exports = TelegramBot;
