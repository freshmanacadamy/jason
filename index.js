const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

// Express server
app.get('/', (req, res) => {
  res.send('🤖 Bot is Running!');
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Telegram Bot with error handling
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { 
  polling: {
    params: {
      timeout: 10,
      limit: 1
    }
  }
});

// Handle polling errors
bot.on('polling_error', (error) => {
  console.log('Polling error, restarting...', error.code);
  // Auto-restart after 5 seconds
  setTimeout(() => {
    bot.startPolling();
  }, 5000);
});

bot.on('webhook_error', (error) => {
  console.log('Webhook error:', error);
});

// Your existing bot code continues here...
bot.onText(/\/start/, (msg) => {
  // Your start command code
});

// Rest of your existing code...
