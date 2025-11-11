const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
require('dotenv').config();

const app = express();
app.use(express.json());

// Get bot token from environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;

// Initialize bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Express server for Render
app.get('/', (req, res) => {
  res.send('🤖 Echo Bot is alive!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

console.log('✅ Echo Bot started successfully!');

// ========== SIMPLE ECHO FUNCTIONALITY ========== //

// Start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  bot.sendMessage(chatId,
    `👋 Hello! I'm a simple Echo Bot!\n\n` +
    `Send me any message or photo, and I'll echo it back to you.\n\n` +
    `Commands:\n` +
    `/start - Show this message\n` +
    `/help - Get help\n` +
    `Or just send me anything!`
  );
});

// Help command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  
  bot.sendMessage(chatId,
    `ℹ️ *Echo Bot Help*\n\n` +
    `I simply repeat whatever you send me!\n\n` +
    `📝 *Text* - I'll send it back\n` +
    `🖼️ *Photos* - I'll send the photo back\n` +
    `📁 *Documents* - I'll send them back\n\n` +
    `Try sending me something!`,
    { parse_mode: 'Markdown' }
  );
});

// Echo text messages
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Ignore commands
  if (text && text.startsWith('/')) return;

  // Echo text messages
  if (text) {
    bot.sendMessage(chatId, `📝 You said: "${text}"`);
    console.log(`📝 Echoed text: ${text}`);
  }
});

// Echo photos
bot.on('photo', (msg) => {
  const chatId = msg.chat.id;
  const photo = msg.photo[msg.photo.length - 1]; // Get highest quality photo

  bot.sendPhoto(chatId, photo.file_id, {
    caption: '🖼️ Here is your photo back!'
  });
  
  console.log('🖼️ Echoed photo');
});

// Echo documents
bot.on('document', (msg) => {
  const chatId = msg.chat.id;
  const document = msg.document;

  bot.sendDocument(chatId, document.file_id, {
    caption: '📁 Here is your document back!'
  });
  
  console.log('📁 Echoed document');
});

// Error handling
bot.on('error', (error) => {
  console.error('❌ Bot error:', error);
});

console.log('🎉 Echo Bot is ready! Send /start to begin.');
