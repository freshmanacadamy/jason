const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const app = express();

// Middleware
app.use(express.json());

// Health check endpoint for Render
app.get('/', (req, res) => {
  res.send('🤖 Bot is alive and running!');
});

// Webhook endpoint (optional for Render)
app.post('/webhook', (req, res) => {
  // Handle webhook if you switch from polling
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Get token from environment variable (set in Render)
const token = process.env.BOT_TOKEN;

if (!token) {
  console.error('❌ BOT_TOKEN environment variable is not set!');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

console.log('✅ Bot started successfully!');

// Handle /start command with main menu
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const options = {
    reply_markup: {
      keyboard: [
        [{ text: '📊 Get Info' }, { text: '🛠️ Services' }],
        [{ text: '🔗 Links' }, { text: 'ℹ️ About' }],
        [{ text: '🎲 Random Number' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
  
  bot.sendMessage(chatId, 'Welcome! Choose an option:', options);
});

// Handle inline buttons for specific actions
bot.onText(/\/menu/, (msg) => {
  const chatId = msg.chat.id;
  const inlineKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '⭐ Star Repository', url: 'https://github.com' },
          { text: '📞 Contact', callback_data: 'contact' }
        ],
        [
          { text: '🔄 Refresh', callback_data: 'refresh' },
          { text: '❌ Close', callback_data: 'close' }
        ]
      ]
    }
  };
  
  bot.sendMessage(chatId, '🔧 Quick Actions Menu:', inlineKeyboard);
});

// Handle button callbacks
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const data = callbackQuery.data;

  try {
    switch (data) {
      case 'contact':
        await bot.answerCallbackQuery(callbackQuery.id, { text: '📧 Contact: example@email.com' });
        break;
        
      case 'refresh':
        await bot.answerCallbackQuery(callbackQuery.id, { text: '🔄 Refreshing...' });
        await bot.editMessageText('✅ Menu refreshed!', {
          chat_id: chatId,
          message_id: message.message_id
        });
        break;
        
      case 'close':
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Menu closed' });
        await bot.deleteMessage(chatId, message.message_id);
        break;
        
      default:
        await bot.answerCallbackQuery(callbackQuery.id, { text: '⚙️ Action processed' });
    }
  } catch (error) {
    console.error('Error handling callback:', error);
  }
});

// Handle regular keyboard buttons
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Ignore commands that are already handled
  if (text.startsWith('/')) return;

  switch (text) {
    case '📊 Get Info':
      const userInfo = `
👤 User Info:
ID: ${msg.from.id}
First Name: ${msg.from.first_name}
Username: @${msg.from.username || 'N/A'}
      `.trim();
      
      await bot.sendMessage(chatId, userInfo);
      break;
      
    case '🛠️ Services':
      const servicesKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🌐 Web Development', callback_data: 'web_dev' },
              { text: '📱 App Development', callback_data: 'app_dev' }
            ],
            [
              { text: '☁️ Cloud Services', callback_data: 'cloud' },
              { text: '🔒 Security', callback_data: 'security' }
            ]
          ]
        }
      };
      await bot.sendMessage(chatId, 'Our Services:', servicesKeyboard);
      break;
      
    case '🔗 Links':
      const linksKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🌐 Website', url: 'https://example.com' },
              { text: '📚 Documentation', url: 'https://docs.example.com' }
            ],
            [
              { text: '💬 Support', url: 'https://t.me/yourchannel' },
              { text: '🐙 GitHub', url: 'https://github.com' }
            ]
          ]
        }
      };
      await bot.sendMessage(chatId, 'Useful Links:', linksKeyboard);
      break;
      
    case 'ℹ️ About':
      await bot.sendMessage(chatId, 
        `🤖 About This Bot:
Version: 1.0
Framework: Node.js
Host: Render
Features: Buttons, Inline Keyboard, Web Server
        
This is a demo bot showcasing Telegram Bot API capabilities.`
      );
      break;
      
    case '🎲 Random Number':
      const randomNum = Math.floor(Math.random() * 100) + 1;
      await bot.sendMessage(chatId, `🎲 Your random number: ${randomNum}`);
      break;
      
    default:
      // Echo other messages
      if (msg.text && !msg.text.startsWith('/')) {
        await bot.sendMessage(chatId, `You said: "${msg.text}"\n\nUse /start for main menu or /menu for inline buttons.`);
      }
  }
});

// Error handling
bot.on('error', (error) => {
  console.error('❌ Bot error:', error);
});

bot.on('polling_error', (error) => {
  console.error('❌ Polling error:', error);
});
