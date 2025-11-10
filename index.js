const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();

const PORT = process.env.PORT || 3000;

// Express server for 24/7
app.get('/', (req, res) => {
  res.send('🤖 Registration Bot with Photo Upload is Running!');
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Telegram Bot
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Database setup
const db = new sqlite3.Database('users.db');
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER,
    username TEXT,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    photo_id TEXT,
    status TEXT DEFAULT 'pending',
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS admins (
    chat_id INTEGER PRIMARY KEY,
    username TEXT
  )
`);

// Admin chat ID - replace with your actual Telegram chat ID
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '7362758034'; // Your personal Telegram chat ID

// Store user registration state
const userStates = {};

// Start command with registration buttons
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || 'No username';
  
  const welcomeMessage = `👋 Welcome ${msg.from.first_name}!\n\nI can help you with registration. Please choose an option:`;
  
  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📝 Start Registration', callback_data: 'start_registration' },
          { text: 'ℹ️ About Us', callback_data: 'about' }
        ],
        [
          { text: '📞 Contact Admin', callback_data: 'contact_admin' }
        ]
      ]
    }
  };
  
  bot.sendMessage(chatId, welcomeMessage, options);
});

// Handle button callbacks
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const data = callbackQuery.data;

  try {
    if (data === 'start_registration') {
      await startRegistration(chatId, callbackQuery.from);
    } else if (data === 'about') {
      await bot.sendMessage(chatId, '🤖 We provide amazing services! Contact us for more information.');
    } else if (data === 'contact_admin') {
      await bot.sendMessage(chatId, '📞 Please contact our admin directly or use the registration form.');
    } else if (data === 'submit_registration') {
      await submitRegistration(chatId);
    } else if (data === 'cancel_registration') {
      await cancelRegistration(chatId);
    }
    
    // Answer callback query to remove loading state
    bot.answerCallbackQuery(callbackQuery.id);
  } catch (error) {
    console.error('Callback error:', error);
    bot.answerCallbackQuery(callbackQuery.id, { text: 'Error occurred!' });
  }
});

// Start registration process
async function startRegistration(chatId, user) {
  userStates[chatId] = {
    step: 'waiting_full_name',
    data: {
      username: user.username,
      full_name: '',
      email: '',
      phone: '',
      photo_id: ''
    }
  };
  
  const registrationMessage = `📝 Registration Started!\n\nPlease follow these steps:\n\n1. Send your full name\n2. Send your email\n3. Send your phone number\n4. Upload a profile photo\n\nYou can cancel anytime using /cancel`;
  
  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '❌ Cancel Registration', callback_data: 'cancel_registration' }]
      ]
    }
  };
  
  await bot.sendMessage(chatId, registrationMessage, options);
  await bot.sendMessage(chatId, 'Step 1: Please send your full name:');
}

// Handle messages during registration
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Skip if it's a command or user not in registration
  if (!userStates[chatId] || msg.text?.startsWith('/')) return;
  
  const state = userStates[chatId];
  
  try {
    if (state.step === 'waiting_full_name') {
      state.data.full_name = text;
      state.step = 'waiting_email';
      await bot.sendMessage(chatId, 'Step 2: Please send your email:');
      
    } else if (state.step === 'waiting_email') {
      // Simple email validation
      if (!text.includes('@')) {
        await bot.sendMessage(chatId, '❌ Please enter a valid email address:');
        return;
      }
      state.data.email = text;
      state.step = 'waiting_phone';
      await bot.sendMessage(chatId, 'Step 3: Please send your phone number:');
      
    } else if (state.step === 'waiting_phone') {
      state.data.phone = text;
      state.step = 'waiting_photo';
      await bot.sendMessage(chatId, 'Step 4: Please upload your profile photo:');
    }
  } catch (error) {
    console.error('Message handling error:', error);
    await bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
  }
});

// Handle photo uploads
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  
  if (!userStates[chatId] || userStates[chatId].step !== 'waiting_photo') return;
  
  try {
    // Get the largest photo version
    const photo = msg.photo[msg.photo.length - 1];
    const fileId = photo.file_id;
    
    userStates[chatId].data.photo_id = fileId;
    userStates[chatId].step = 'completed';
    
    // Show registration summary
    const userData = userStates[chatId].data;
    const summary = `
✅ Registration Complete!

📋 Your Details:
👤 Name: ${userData.full_name}
📧 Email: ${userData.email}
📞 Phone: ${userData.phone}
🖼️ Photo: Uploaded

Please review and submit your registration.
    `;
    
    const options = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Submit Registration', callback_data: 'submit_registration' },
            { text: '❌ Cancel', callback_data: 'cancel_registration' }
          ]
        ]
      }
    };
    
    // Send the uploaded photo back to user
    await bot.sendPhoto(chatId, fileId, { caption: '📸 Your uploaded photo' });
    await bot.sendMessage(chatId, summary, options);
    
  } catch (error) {
    console.error('Photo handling error:', error);
    await bot.sendMessage(chatId, '❌ Error processing photo. Please try again.');
  }
});

// Submit registration to admin
async function submitRegistration(chatId) {
  try {
    const userData = userStates[chatId].data;
    
    // Save to database
    db.run(
      `INSERT INTO users (chat_id, username, full_name, email, phone, photo_id, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [chatId, userData.username, userData.full_name, userData.email, userData.phone, userData.photo_id, 'pending'],
      function(err) {
        if (err) {
          console.error('Database error:', err);
          bot.sendMessage(chatId, '❌ Database error. Please try again.');
          return;
        }
        
        // Send notification to admin
        const adminMessage = `
🆕 NEW REGISTRATION!

👤 User: ${userData.full_name}
📧 Email: ${userData.email}
📞 Phone: ${userData.phone}
🤖 Username: @${userData.username}
🆔 User ID: ${chatId}
📅 Registered: ${new Date().toLocaleString()}
        `;
        
        // Send text info to admin
        bot.sendMessage(ADMIN_CHAT_ID, adminMessage);
        
        // Send photo to admin if available
        if (userData.photo_id) {
          bot.sendPhoto(ADMIN_CHAT_ID, userData.photo_id, { 
            caption: `📸 Profile photo from ${userData.full_name}` 
          });
        }
        
        // Admin actions keyboard
        const adminOptions = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Approve User', callback_data: `approve_${chatId}` },
                { text: '❌ Reject User', callback_data: `reject_${chatId}` }
              ],
              [
                { text: '📞 Contact User', callback_data: `contact_${chatId}` }
              ]
            ]
          }
        };
        
        bot.sendMessage(ADMIN_CHAT_ID, 'Choose action:', adminOptions);
        
        // Confirm to user
        bot.sendMessage(chatId, '✅ Your registration has been submitted! Admin will review it soon.');
        
        // Clear user state
        delete userStates[chatId];
      }
    );
  } catch (error) {
    console.error('Submission error:', error);
    bot.sendMessage(chatId, '❌ Error submitting registration. Please try again.');
  }
}

// Cancel registration
async function cancelRegistration(chatId) {
  delete userStates[chatId];
  await bot.sendMessage(chatId, '❌ Registration cancelled. Use /start to begin again.');
}

// Admin commands
bot.onText(/\/admin/, (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is admin
  if (chatId.toString() !== ADMIN_CHAT_ID.toString()) {
    bot.sendMessage(chatId, '❌ Access denied. Admin only.');
    return;
  }
  
  const adminMessage = `👑 Admin Panel\n\nChoose an action:`;
  
  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📊 View Statistics', callback_data: 'admin_stats' }],
        [{ text: '👥 Pending Registrations', callback_data: 'admin_pending' }],
        [{ text: '📢 Broadcast Message', callback_data: 'admin_broadcast' }]
      ]
    }
  };
  
  bot.sendMessage(chatId, adminMessage, options);
});

// Handle admin callbacks
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const data = callbackQuery.data;
  
  // Check if admin
  if (chatId.toString() !== ADMIN_CHAT_ID.toString()) {
    bot.answerCallbackQuery(callbackQuery.id, { text: 'Admin only!' });
    return;
  }
  
  if (data.startsWith('approve_')) {
    const userChatId = data.replace('approve_', '');
    // Approve user logic here
    bot.sendMessage(chatId, `✅ User ${userChatId} approved!`);
    bot.sendMessage(userChatId, '🎉 Your registration has been approved!');
  } else if (data.startsWith('reject_')) {
    const userChatId = data.replace('reject_', '');
    // Reject user logic here
    bot.sendMessage(chatId, `❌ User ${userChatId} rejected!`);
    bot.sendMessage(userChatId, '❌ Your registration has been rejected. Contact admin for details.');
  }
  
  bot.answerCallbackQuery(callbackQuery.id);
});

console.log('✅ Telegram Registration Bot Started!');
