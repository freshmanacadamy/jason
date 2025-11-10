const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');

// Check if token exists
if (!config.BOT_TOKEN) {
  console.error('❌ ERROR: BOT_TOKEN is missing!');
  console.log('💡 Set BOT_TOKEN in Render environment variables');
  process.exit(1);
}

if (!config.ADMIN_ID) {
  console.error('❌ ERROR: ADMIN_ID is missing!');
  console.log('💡 Set ADMIN_ID in Render environment variables');
  process.exit(1);
}

// Initialize bot
const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });

console.log('✅ Simple Phone Bot Started!');
console.log(`👤 Admin ID: ${config.ADMIN_ID}`);

// Store user states (optional - for tracking)
const userStates = new Map();

// Start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || 'User';
  
  const welcomeMessage = `👋 Hello ${userName}!\n\n` +
                        `📞 Please share your phone number so we can contact you.\n\n` +
                        `Click the button below to share your phone number securely:`;
  
  const keyboard = {
    reply_markup: {
      keyboard: [[{
        text: "📱 Share Phone Number",
        request_contact: true
      }]],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
  
  bot.sendMessage(chatId, welcomeMessage, keyboard);
});

// Handle contact messages
bot.on('contact', (msg) => {
  const chatId = msg.chat.id;
  const contact = msg.contact;
  const user = msg.from;
  
  // Extract phone number details
  const phoneNumber = contact.phone_number;
  const userId = contact.user_id;
  const firstName = contact.first_name;
  const lastName = contact.last_name || '';
  
  console.log(`📞 New phone number received from: ${firstName} ${lastName} (${phoneNumber})`);
  
  // Send confirmation to user
  bot.sendMessage(chatId, 
    `✅ Thank you ${firstName}! Your phone number has been received.\n\n` +
    `We'll contact you soon at: ${phoneNumber}`,
    { reply_markup: { remove_keyboard: true } }
  );
  
  // Send notification to admin
  const adminMessage = `📱 NEW PHONE NUMBER RECEIVED\n\n` +
                      `👤 User: ${firstName} ${lastName}\n` +
                      `📞 Phone: ${phoneNumber}\n` +
                      `🆔 User ID: ${userId}\n` +
                      `👥 Username: @${user.username || 'N/A'}\n` +
                      `⏰ Time: ${new Date().toLocaleString()}`;
  
  bot.sendMessage(config.ADMIN_ID, adminMessage)
    .then(() => {
      console.log('✅ Notification sent to admin');
    })
    .catch(error => {
      console.error('❌ Failed to send to admin:', error.message);
    });
});

// Handle regular text messages
bot.on('text', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Ignore commands
  if (text.startsWith('/')) return;
  
  // If user sends text instead of phone button
  bot.sendMessage(chatId, 
    `Please use the "Share Phone Number" button below to share your phone number securely.`,
    {
      reply_markup: {
        keyboard: [[{
          text: "📱 Share Phone Number",
          request_contact: true
        }]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    }
  );
});

// Admin commands
bot.onText(/\/stats/, (msg) => {
  if (msg.from.id !== config.ADMIN_ID) {
    return bot.sendMessage(msg.chat.id, '❌ Access denied.');
  }
  
  const stats = `🤖 BOT STATS\n\n` +
               `✅ Bot is running\n` +
               `👤 Admin: ${config.ADMIN_ID}\n` +
               `🕒 Uptime: ${process.uptime().toFixed(0)} seconds\n` +
               `📊 Active users: ${userStates.size}`;
  
  bot.sendMessage(msg.chat.id, stats);
});

// Error handling
bot.on('error', (error) => {
  console.error('❌ Bot Error:', error);
});

bot.on('polling_error', (error) => {
  console.error('❌ Polling Error:', error);
});

console.log('🚀 Bot is now running...');
