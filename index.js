const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();

const PORT = process.env.PORT || 3000;

// Express server for 24/7
app.use(express.json());

app.get('/', (req, res) => {
  res.send('🎓 Lecture Class Registration Bot is Running!');
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Telegram Bot - FIXED: Simple polling without conflicts
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { 
  polling: true 
});

// Handle polling errors gracefully
bot.on('polling_error', (error) => {
  console.log('🔄 Polling error, restarting...', error.code);
});

console.log('✅ Bot started with polling');

// ========== DATABASE SETUP ==========
const db = new sqlite3.Database(':memory:'); // Use ':memory:' for testing, change to 'students.db' for production

db.run(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER,
    full_name TEXT,
    department TEXT,
    student_id TEXT,
    profile_photo_id TEXT,
    id_card_photo_id TEXT,
    status TEXT DEFAULT 'pending',
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Admin chat ID - REPLACE WITH YOUR ACTUAL CHAT ID
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '123456789';

// Store user registration state
const userStates = {};

// Available departments
const departments = [
  'Computer Science',
  'Electrical Engineering', 
  'Mechanical Engineering',
  'Civil Engineering',
  'Business Administration',
  'Medicine',
  'Law',
  'Arts & Humanities',
  'Science & Technology',
  'Other'
];

// ========== BUTTON HANDLERS - FIXED ==========

// Start command with registration buttons
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  const welcomeMessage = `🎓 Welcome to Freshman Tutorial Class Registration!

Dear ${msg.from.first_name},

We're excited to invite you to register for our freshman tutorial classes!`;

  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📝 Register Now', callback_data: 'start_registration' },
          { text: 'ℹ️ About Program', callback_data: 'about_program' }
        ],
        [
          { text: '📞 Contact Coordinators', callback_data: 'contact_coordinators' }
        ]
      ]
    }
  };
  
  bot.sendMessage(chatId, welcomeMessage, options);
});

// ========== CALLBACK QUERY HANDLER - FIXED ==========
bot.on('callback_query', (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const data = callbackQuery.data;

  console.log(`🔄 Button clicked: ${data} by user: ${chatId}`);

  try {
    // ALWAYS answer the callback query first
    bot.answerCallbackQuery(callbackQuery.id);

    if (data === 'start_registration') {
      startRegistration(chatId, callbackQuery.from);
    } 
    else if (data === 'about_program') {
      bot.sendMessage(chatId, 
        `🎯 **Freshman Tutorial Program**\n\nOur program connects freshmen with experienced senior tutors!`
      );
    } 
    else if (data === 'contact_coordinators') {
      bot.sendMessage(chatId, '📞 Contact: tutors@university.edu');
    }
    else if (data === 'submit_registration') {
      submitRegistration(chatId);
    }
    else if (data === 'cancel_registration') {
      cancelRegistration(chatId);
    }
    else if (data.startsWith('dept_')) {
      const deptIndex = parseInt(data.replace('dept_', ''));
      const department = departments[deptIndex];
      
      if (userStates[chatId] && userStates[chatId].step === 'waiting_department') {
        userStates[chatId].data.department = department;
        userStates[chatId].step = 'waiting_student_id';
        
        bot.sendMessage(chatId, `✅ Department selected: ${department}`);
        bot.sendMessage(chatId, 'Step 3: Please send your student ID number:');
      }
    }

  } catch (error) {
    console.error('❌ Callback error:', error);
    bot.sendMessage(chatId, '❌ Error occurred! Please try again.');
  }
});

// ========== REGISTRATION FUNCTIONS ==========

function startRegistration(chatId, user) {
  userStates[chatId] = {
    step: 'waiting_full_name',
    data: {
      full_name: '',
      department: '',
      student_id: '',
      profile_photo_id: '',
      id_card_photo_id: ''
    }
  };
  
  const registrationMessage = `📝 Registration Started!\n\nPlease follow these steps:\n\n1. Your full name\n2. Your department\n3. Student ID\n4. Profile photo\n5. ID card photo`;
  
  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '❌ Cancel', callback_data: 'cancel_registration' }]
      ]
    }
  };
  
  bot.sendMessage(chatId, registrationMessage, options);
  bot.sendMessage(chatId, 'Step 1: Please send your full name:');
}

function showDepartmentSelection(chatId) {
  const state = userStates[chatId];
  state.step = 'waiting_department';
  
  // Create department buttons
  const departmentButtons = [];
  for (let i = 0; i < departments.length; i += 2) {
    const row = [];
    if (departments[i]) row.push({ text: departments[i], callback_data: `dept_${i}` });
    if (departments[i + 1]) row.push({ text: departments[i + 1], callback_data: `dept_${i + 1}` });
    departmentButtons.push(row);
  }

  const options = {
    reply_markup: {
      inline_keyboard: departmentButtons
    }
  };
  
  bot.sendMessage(chatId, 'Step 2: Please select your department:', options);
}

// Handle messages during registration
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Skip commands
  if (text?.startsWith('/')) return;

  if (!userStates[chatId]) return;

  const state = userStates[chatId];

  try {
    if (state.step === 'waiting_full_name') {
      state.data.full_name = text;
      showDepartmentSelection(chatId);
    } 
    else if (state.step === 'waiting_student_id') {
      state.data.student_id = text;
      state.step = 'waiting_profile_photo';
      bot.sendMessage(chatId, 'Step 4: Please upload your profile photo:');
    }
  } catch (error) {
    console.error('Message handling error:', error);
    bot.sendMessage(chatId, '❌ Error occurred!');
  }
});

// Handle photos
bot.on('photo', (msg) => {
  const chatId = msg.chat.id;
  const state = userStates[chatId];
  
  if (!state) return;

  try {
    const photo = msg.photo[msg.photo.length - 1];
    const fileId = photo.file_id;

    if (state.step === 'waiting_profile_photo') {
      state.data.profile_photo_id = fileId;
      state.step = 'waiting_id_card_photo';
      bot.sendMessage(chatId, '✅ Profile photo received!');
      bot.sendMessage(chatId, 'Step 5: Please upload your ID card photo:');
    } 
    else if (state.step === 'waiting_id_card_photo') {
      state.data.id_card_photo_id = fileId;
      state.step = 'completed';
      bot.sendMessage(chatId, '✅ ID card photo received!');
      showRegistrationSummary(chatId);
    }
  } catch (error) {
    console.error('Photo error:', error);
    bot.sendMessage(chatId, '❌ Error processing photo!');
  }
});

function showRegistrationSummary(chatId) {
  const userData = userStates[chatId].data;
  
  const summary = `
🎓 **Registration Complete!**

👤 Name: ${userData.full_name}
🏫 Department: ${userData.department}
🆔 Student ID: ${userData.student_id}

Please submit for approval.
  `;
  
  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Submit', callback_data: 'submit_registration' },
          { text: '❌ Cancel', callback_data: 'cancel_registration' }
        ]
      ]
    }
  };
  
  bot.sendMessage(chatId, summary, options);
}

function submitRegistration(chatId) {
  try {
    const userData = userStates[chatId].data;
    
    // Save to database
    db.run(
      `INSERT INTO students (chat_id, full_name, department, student_id, profile_photo_id, id_card_photo_id) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [chatId, userData.full_name, userData.department, userData.student_id, userData.profile_photo_id, userData.id_card_photo_id],
      function(err) {
        if (err) {
          console.error('Database error:', err);
          bot.sendMessage(chatId, '❌ Database error.');
          return;
        }
        
        // Notify admin
        const adminMessage = `🎓 New Registration!\n👤 ${userData.full_name}\n🏫 ${userData.department}`;
        bot.sendMessage(ADMIN_CHAT_ID, adminMessage);
        
        // Confirm to student
        bot.sendMessage(chatId, '✅ Registration submitted successfully! Admin will contact you soon.');
        
        // Clear state
        delete userStates[chatId];
      }
    );
  } catch (error) {
    console.error('Submission error:', error);
    bot.sendMessage(chatId, '❌ Submission error!');
  }
}

function cancelRegistration(chatId) {
  delete userStates[chatId];
  bot.sendMessage(chatId, '❌ Registration cancelled. Use /start to begin again.');
}

// ========== TEST COMMAND ==========
bot.onText(/\/test/, (msg) => {
  const chatId = msg.chat.id;
  
  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🎯 TEST BUTTON 1', callback_data: 'test1' },
          { text: '🎯 TEST BUTTON 2', callback_data: 'test2' }
        ]
      ]
    }
  };
  
  bot.sendMessage(chatId, '🧪 TEST: Click a button below:', options);
});

// Test button handler
bot.on('callback_query', (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const data = callbackQuery.data;

  if (data === 'test1') {
    bot.sendMessage(chatId, '🎉 TEST 1 WORKED! Buttons are functioning!');
    bot.answerCallbackQuery(callbackQuery.id);
  }
  else if (data === 'test2') {
    bot.sendMessage(chatId, '🎉 TEST 2 WORKED! Buttons are functioning!');
    bot.answerCallbackQuery(callbackQuery.id);
  }
});

console.log('✅ Bot fully loaded and ready!');
