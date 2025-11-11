const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();

const PORT = process.env.PORT || 3000;

// Express server for 24/7
app.get('/', (req, res) => {
  res.send('🎓 Lecture Class Registration Bot is Running!');
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
const db = new sqlite3.Database('lecture_registrations.db');
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

// Admin chat ID
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '123456789';

// Store user registration state
const userStates = {};

// Store admin broadcast state
const adminBroadcastState = {};

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

// Start command with registration buttons
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  const welcomeMessage = `🎓 Welcome to Freshman Tutorial Class Registration!

Dear ${msg.from.first_name},

We're excited to invite you to register for our freshman tutorial classes! Experienced seniors will provide guidance and support.

**Registration Process:**
1. Your full name
2. Department selection  
3. Student ID
4. Profile photo
5. ID card photo

Click below to start registration:`;
  
  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📝 Register for Tutorial', callback_data: 'start_registration' },
          { text: 'ℹ️ About Program', callback_data: 'about_program' }
        ],
        [
          { text: '👨‍🏫 Become a Tutor', callback_data: 'become_tutor' },
          { text: '📞 Contact Coordinators', callback_data: 'contact_coordinators' }
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
    } else if (data === 'about_program') {
      await bot.sendMessage(chatId, 
        `🎯 **Freshman Tutorial Program**\n\nOur program connects freshmen with experienced senior tutors who provide:\n\n• Academic guidance\n• Course selection advice\n• Study techniques\n• Campus navigation\n• Peer support\n\nRegistration is free and open to all freshmen!`
      );
    } else if (data === 'become_tutor') {
      await bot.sendMessage(chatId, '👨‍🏫 Interested in becoming a tutor? Please contact the program coordinators directly.');
    } else if (data === 'contact_coordinators') {
      await bot.sendMessage(chatId, '📞 Program Coordinators:\n\n• Prof. Johnson - CS Department\n• Dr. Smith - Student Affairs\n• Email: tutors@university.edu');
    } else if (data === 'submit_registration') {
      await submitRegistration(chatId);
    } else if (data === 'cancel_registration') {
      await cancelRegistration(chatId);
    }
    
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
      full_name: '',
      department: '',
      student_id: '',
      profile_photo_id: '',
      id_card_photo_id: ''
    }
  };
  
  const registrationMessage = `📝 Tutorial Class Registration Started!\n\nPlease complete these 5 steps:\n\n1. 👤 Your full name (as per university records)\n2. 🏫 Your department\n3. 🆔 Student ID number\n4. 📸 Profile photo (recent picture)\n5. 🪪 ID card photo (clear image)\n\nYou can cancel anytime using /cancel`;
  
  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '❌ Cancel Registration', callback_data: 'cancel_registration' }]
      ]
    }
  };
  
  await bot.sendMessage(chatId, registrationMessage, options);
  await bot.sendMessage(chatId, 'Step 1: Please send your full name (as it appears on university records):');
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
      await showDepartmentSelection(chatId);
      
    } else if (state.step === 'waiting_student_id') {
      // Validate student ID format (basic check)
      if (text.length < 3) {
        await bot.sendMessage(chatId, '❌ Please enter a valid student ID:');
        return;
      }
      state.data.student_id = text;
      state.step = 'waiting_profile_photo';
      await bot.sendMessage(chatId, 'Step 4: Please upload a clear profile photo (your recent picture):');
    }
  } catch (error) {
    console.error('Message handling error:', error);
    await bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
  }
});

// Show department selection
async function showDepartmentSelection(chatId) {
  const state = userStates[chatId];
  state.step = 'waiting_department';
  
  // Create department buttons (2 per row)
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
  
  await bot.sendMessage(chatId, 'Step 2: Please select your department:', options);
}

// Handle department selection
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const data = callbackQuery.data;

  if (data.startsWith('dept_')) {
    const deptIndex = parseInt(data.replace('dept_', ''));
    const department = departments[deptIndex];
    
    if (userStates[chatId] && userStates[chatId].step === 'waiting_department') {
      userStates[chatId].data.department = department;
      userStates[chatId].step = 'waiting_student_id';
      
      await bot.sendMessage(chatId, `✅ Department selected: ${department}`);
      await bot.sendMessage(chatId, 'Step 3: Please send your student ID number:');
    }
    
    bot.answerCallbackQuery(callbackQuery.id);
  }
});

// Handle profile photo upload
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const state = userStates[chatId];
  
  if (!state) return;
  
  try {
    // Get the largest photo version
    const photo = msg.photo[msg.photo.length - 1];
    const fileId = photo.file_id;
    
    if (state.step === 'waiting_profile_photo') {
      state.data.profile_photo_id = fileId;
      state.step = 'waiting_id_card_photo';
      
      await bot.sendPhoto(chatId, fileId, { caption: '✅ Profile photo received!' });
      await bot.sendMessage(chatId, 'Step 5: Please upload a clear photo of your student ID card:');
      
    } else if (state.step === 'waiting_id_card_photo') {
      state.data.id_card_photo_id = fileId;
      state.step = 'completed';
      
      await bot.sendPhoto(chatId, fileId, { caption: '✅ ID card photo received!' });
      await showRegistrationSummary(chatId);
    }
    
  } catch (error) {
    console.error('Photo handling error:', error);
    await bot.sendMessage(chatId, '❌ Error processing photo. Please try again.');
  }
});

// Show registration summary
async function showRegistrationSummary(chatId) {
  const userData = userStates[chatId].data;
  
  const summary = `
🎓 **Registration Complete!**

📋 Your Details:
👤 Name: ${userData.full_name}
🏫 Department: ${userData.department}
🆔 Student ID: ${userData.student_id}
📸 Photos: Profile & ID card uploaded

Please review your information and submit for approval.
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
  
  await bot.sendMessage(chatId, summary, options);
}

// Submit registration to admin
async function submitRegistration(chatId) {
  try {
    const userData = userStates[chatId].data;
    
    // Save to database
    db.run(
      `INSERT INTO students (chat_id, full_name, department, student_id, profile_photo_id, id_card_photo_id, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [chatId, userData.full_name, userData.department, userData.student_id, userData.profile_photo_id, userData.id_card_photo_id, 'pending'],
      function(err) {
        if (err) {
          console.error('Database error:', err);
          bot.sendMessage(chatId, '❌ Database error. Please try again.');
          return;
        }
        
        // Send notification to admin
        const adminMessage = `
🎓 NEW TUTORIAL REGISTRATION!

👤 Student: ${userData.full_name}
🏫 Department: ${userData.department}
🆔 Student ID: ${userData.student_id}
🆔 User ID: ${chatId}
📅 Registered: ${new Date().toLocaleString()}
        `;
        
        // Send text info to admin
        bot.sendMessage(ADMIN_CHAT_ID, adminMessage);
        
        // Send photos to admin if available
        if (userData.profile_photo_id) {
          bot.sendPhoto(ADMIN_CHAT_ID, userData.profile_photo_id, { 
            caption: `📸 Profile photo - ${userData.full_name}` 
          });
        }
        
        if (userData.id_card_photo_id) {
          bot.sendPhoto(ADMIN_CHAT_ID, userData.id_card_photo_id, { 
            caption: `🪪 ID Card - ${userData.full_name}` 
          });
        }
        
        // Admin actions keyboard
        const adminOptions = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Approve Student', callback_data: `approve_${chatId}` },
                { text: '❌ Reject Student', callback_data: `reject_${chatId}` }
              ],
              [
                { text: '📞 Contact Student', callback_data: `contact_${chatId}` },
                { text: '📊 View Details', callback_data: `details_${chatId}` }
              ]
            ]
          }
        };
        
        bot.sendMessage(ADMIN_CHAT_ID, 'Choose action:', adminOptions);
        
        // Confirm to student
        const confirmationMessage = `
✅ Registration Submitted Successfully!

Thank you for registering for the freshman tutorial program!

**What happens next:**
1. Program coordinators will review your application
2. You'll be matched with a suitable tutor
3. You'll receive notification within 3-5 days

For questions, contact the program coordinators.
        `;
        
        bot.sendMessage(chatId, confirmationMessage);
        
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

// ==================== NEW MESSAGING FEATURES ====================

// Admin commands
bot.onText(/\/admin/, (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is admin
  if (chatId.toString() !== ADMIN_CHAT_ID.toString()) {
    bot.sendMessage(chatId, '❌ Access denied. Admin only.');
    return;
  }
  
  const adminMessage = `👑 Tutorial Program Admin Panel\n\nChoose an action:`;
  
  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📊 View Statistics', callback_data: 'admin_stats' }],
        [{ text: '👥 Pending Registrations', callback_data: 'admin_pending' }],
        [{ text: '🎓 Approved Students', callback_data: 'admin_approved' }],
        [{ text: '📢 Broadcast Message', callback_data: 'admin_broadcast' }],
        [{ text: '📩 Message Student', callback_data: 'admin_message_student' }],
        [{ text: '📥 Export Data', callback_data: 'admin_export' }]
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
  
  try {
    if (data.startsWith('approve_')) {
      const userChatId = data.replace('approve_', '');
      // Approve student logic
      db.run("UPDATE students SET status = 'approved' WHERE chat_id = ?", [userChatId]);
      bot.sendMessage(chatId, `✅ Student ${userChatId} approved for tutorial program!`);
      bot.sendMessage(userChatId, 
        `🎉 Congratulations! Your tutorial program registration has been approved!\n\nYou'll be contacted soon with your tutor assignment.`
      );
    } else if (data.startsWith('reject_')) {
      const userChatId = data.replace('reject_', '');
      // Reject student logic
      db.run("UPDATE students SET status = 'rejected' WHERE chat_id = ?", [userChatId]);
      bot.sendMessage(chatId, `❌ Student ${userChatId} registration rejected.`);
      bot.sendMessage(userChatId, 
        `❌ Your tutorial program registration requires additional verification.\n\nPlease contact the program coordinators for more information.`
      );
    } else if (data === 'admin_broadcast') {
      await startBroadcast(chatId);
    } else if (data === 'admin_message_student') {
      await showStudentListForMessaging(chatId);
    } else if (data.startsWith('msgstudent_')) {
      const studentChatId = data.replace('msgstudent_', '');
      await startIndividualMessage(chatId, studentChatId);
    } else if (data.startsWith('broadcast_')) {
      const target = data.replace('broadcast_', '');
      await startTargetedBroadcast(chatId, target);
    }
    
    bot.answerCallbackQuery(callbackQuery.id);
  } catch (error) {
    console.error('Admin callback error:', error);
    bot.answerCallbackQuery(callbackQuery.id, { text: 'Error occurred!' });
  }
});

// ==================== INDIVIDUAL MESSAGING ====================

// Show student list for individual messaging
async function showStudentListForMessaging(chatId) {
  db.all("SELECT chat_id, full_name, department, status FROM students ORDER BY registered_at DESC LIMIT 50", async (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      bot.sendMessage(chatId, '❌ Error loading student list.');
      return;
    }

    if (rows.length === 0) {
      bot.sendMessage(chatId, '📭 No students found in database.');
      return;
    }

    let message = `📋 Students List (${rows.length} total)\n\n`;
    
    // Create buttons for students (5 per row)
    const studentButtons = [];
    for (let i = 0; i < rows.length; i += 2) {
      const row = [];
      if (rows[i]) {
        const student = rows[i];
        row.push({ 
          text: `${student.full_name} (${student.status})`, 
          callback_data: `msgstudent_${student.chat_id}` 
        });
      }
      if (rows[i + 1]) {
        const student = rows[i + 1];
        row.push({ 
          text: `${student.full_name} (${student.status})`, 
          callback_data: `msgstudent_${student.chat_id}` 
        });
      }
      studentButtons.push(row);
    }

    // Add back button
    studentButtons.push([{ text: '🔙 Back to Admin', callback_data: 'back_to_admin' }]);

    const options = {
      reply_markup: {
        inline_keyboard: studentButtons
      }
    };

    await bot.sendMessage(chatId, message, options);
  });
}

// Start individual message to student
async function startIndividualMessage(adminChatId, studentChatId) {
  adminBroadcastState[adminChatId] = {
    type: 'individual',
    targetChatId: studentChatId,
    step: 'waiting_message'
  };

  // Get student info for context
  db.get("SELECT full_name, department FROM students WHERE chat_id = ?", [studentChatId], (err, student) => {
    if (err || !student) {
      bot.sendMessage(adminChatId, '❌ Student not found.');
      return;
    }

    bot.sendMessage(adminChatId, 
      `📩 Message to: ${student.full_name} (${student.department})\n\nPlease type your message to send to this student:\n\nUse /cancel to cancel.`
    );
  });
}

// ==================== BROADCAST MESSAGING ====================

// Start broadcast message
async function startBroadcast(adminChatId) {
  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📢 All Students', callback_data: 'broadcast_all' },
          { text: '✅ Approved Only', callback_data: 'broadcast_approved' }
        ],
        [
          { text: '⏳ Pending Only', callback_data: 'broadcast_pending' },
          { text: '🏫 By Department', callback_data: 'broadcast_department' }
        ],
        [
          { text: '🔙 Back to Admin', callback_data: 'back_to_admin' }
        ]
      ]
    }
  };

  await bot.sendMessage(adminChatId, '📢 Choose broadcast target:', options);
}

// Start targeted broadcast
async function startTargetedBroadcast(adminChatId, target) {
  adminBroadcastState[adminChatId] = {
    type: 'broadcast',
    target: target,
    step: 'waiting_message'
  };

  let targetDescription = '';
  switch (target) {
    case 'all':
      targetDescription = 'all registered students';
      break;
    case 'approved':
      targetDescription = 'approved students only';
      break;
    case 'pending':
      targetDescription = 'pending students only';
      break;
    case 'department':
      targetDescription = 'students by department';
      break;
  }

  bot.sendMessage(adminChatId, 
    `📢 Broadcast to: ${targetDescription}\n\nPlease type your broadcast message:\n\nUse /cancel to cancel.`
  );
}

// Handle admin messages for broadcasting/individual messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Check if admin is in broadcast/message mode
  if (!adminBroadcastState[chatId] || msg.text?.startsWith('/')) return;

  const state = adminBroadcastState[chatId];

  try {
    if (state.step === 'waiting_message') {
      if (state.type === 'individual') {
        await sendIndividualMessage(chatId, state.targetChatId, text);
      } else if (state.type === 'broadcast') {
        await sendBroadcastMessage(chatId, state.target, text);
      }
      
      // Clear state after sending
      delete adminBroadcastState[chatId];
    }
  } catch (error) {
    console.error('Message sending error:', error);
    bot.sendMessage(chatId, '❌ Error sending message. Please try again.');
    delete adminBroadcastState[chatId];
  }
});

// Send individual message to student
async function sendIndividualMessage(adminChatId, studentChatId, message) {
  try {
    // Send message to student
    await bot.sendMessage(studentChatId, `📩 Message from Program Coordinator:\n\n${message}`);
    
    // Confirm to admin
    db.get("SELECT full_name FROM students WHERE chat_id = ?", [studentChatId], (err, student) => {
      if (!err && student) {
        bot.sendMessage(adminChatId, `✅ Message sent to ${student.full_name}`);
      } else {
        bot.sendMessage(adminChatId, `✅ Message sent to student (ID: ${studentChatId})`);
      }
    });
  } catch (error) {
    if (error.response && error.response.statusCode === 403) {
      bot.sendMessage(adminChatId, '❌ Message failed: Student has blocked the bot.');
    } else {
      throw error;
    }
  }
}

// Send broadcast message
async function sendBroadcastMessage(adminChatId, target, message) {
  let query = "SELECT chat_id, full_name FROM students WHERE 1=1";
  let params = [];

  switch (target) {
    case 'approved':
      query += " AND status = 'approved'";
      break;
    case 'pending':
      query += " AND status = 'pending'";
      break;
    // 'all' includes all students
  }

  db.all(query, params, async (err, students) => {
    if (err) {
      console.error('Database error:', err);
      bot.sendMessage(adminChatId, '❌ Error loading student list.');
      return;
    }

    if (students.length === 0) {
      bot.sendMessage(adminChatId, '❌ No students found for this target.');
      return;
    }

    const broadcastMessage = `📢 Announcement from Tutorial Program:\n\n${message}`;
    
    let successCount = 0;
    let failCount = 0;

    // Send progress message
    const progressMsg = await bot.sendMessage(adminChatId, `📤 Sending broadcast to ${students.length} students...\n\n✅ Successful: 0\n❌ Failed: 0`);

    // Send messages with delay to avoid rate limits
    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      
      try {
        await bot.sendMessage(student.chat_id, broadcastMessage);
        successCount++;
      } catch (error) {
        failCount++;
      }

      // Update progress every 10 messages or at the end
      if (i % 10 === 0 || i === students.length - 1) {
        await bot.editMessageText(
          `📤 Sending broadcast to ${students.length} students...\n\n✅ Successful: ${successCount}\n❌ Failed: ${failCount}`,
          {
            chat_id: adminChatId,
            message_id: progressMsg.message_id
          }
        );
      }

      // Delay to avoid hitting rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Final result
    await bot.editMessageText(
      `📢 Broadcast Complete!\n\n✅ Successful: ${successCount}\n❌ Failed: ${failCount}\n📊 Total: ${students.length}`,
      {
        chat_id: adminChatId,
        message_id: progressMsg.message_id
      }
    );
  });
}

// Cancel command for admin
bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;
  
  if (adminBroadcastState[chatId]) {
    delete adminBroadcastState[chatId];
    bot.sendMessage(chatId, '❌ Message/broadcast cancelled.');
  }
});

// Handle back to admin callback
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const data = callbackQuery.data;

  if (data === 'back_to_admin' && chatId.toString() === ADMIN_CHAT_ID.toString()) {
    // Re-show admin panel
    const adminMessage = `👑 Tutorial Program Admin Panel\n\nChoose an action:`;
    
    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📊 View Statistics', callback_data: 'admin_stats' }],
          [{ text: '👥 Pending Registrations', callback_data: 'admin_pending' }],
          [{ text: '🎓 Approved Students', callback_data: 'admin_approved' }],
          [{ text: '📢 Broadcast Message', callback_data: 'admin_broadcast' }],
          [{ text: '📩 Message Student', callback_data: 'admin_message_student' }],
          [{ text: '📥 Export Data', callback_data: 'admin_export' }]
        ]
      }
    };
    
    await bot.editMessageText(adminMessage, {
      chat_id: chatId,
      message_id: message.message_id,
      reply_markup: options.reply_markup
    });
    
    bot.answerCallbackQuery(callbackQuery.id);
  }
});

console.log('✅ Lecture Class Registration Bot with Messaging Started!');
