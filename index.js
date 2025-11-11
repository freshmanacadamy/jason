// ========== ENHANCED ADMIN NOTIFICATION & MESSAGING SYSTEM ========== //

// Function to notify admins about new products
async function notifyAdminsAboutNewProduct(product) {
  const seller = users.get(product.sellerId);
  let notifiedCount = 0;

  for (const adminId of ADMIN_IDS) {
    try {
      const approveKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Approve', callback_data: `approve_${product.id}` },
              { text: '❌ Reject', callback_data: `reject_${product.id}` }
            ],
            [
              { text: '👀 View Details', callback_data: `admindetails_${product.id}` },
              { text: '📨 Message Seller', callback_data: `message_seller_${product.sellerId}` }
            ]
          ]
        }
      };

      // Try to send with image first
      try {
        await bot.sendPhoto(adminId, product.images[0], {
          caption: `🆕 *NEW PRODUCT FOR APPROVAL*\n\n` +
                   `🏷️ *Title:* ${product.title}\n` +
                   `💰 *Price:* ${product.price} ETB\n` +
                   `📂 *Category:* ${product.category}\n` +
                   `👤 *Seller:* ${seller?.firstName || 'Student'}\n` +
                   `📞 *Contact:* @${seller?.username || 'No username'}\n` +
                   `${product.description ? `📝 *Description:* ${product.description}\n` : ''}` +
                   `⏰ *Submitted:* ${product.createdAt.toLocaleString()}\n\n` +
                   `*Quick Actions Below ↓*`,
          parse_mode: 'Markdown',
          reply_markup: approveKeyboard.reply_markup
        });
      } catch (photoError) {
        // Fallback to text message
        await bot.sendMessage(adminId,
          `🆕 *NEW PRODUCT FOR APPROVAL*\n\n` +
          `🏷️ *Title:* ${product.title}\n` +
          `💰 *Price:* ${product.price} ETB\n` +
          `📂 *Category:* ${product.category}\n` +
          `👤 *Seller:* ${seller?.firstName || 'Student'}\n` +
          `📞 *Contact:* @${seller?.username || 'No username'}\n` +
          `${product.description ? `📝 *Description:* ${product.description}\n` : ''}` +
          `⏰ *Submitted:* ${product.createdAt.toLocaleString()}\n\n` +
          `*Click buttons to approve/reject:*`,
          { parse_mode: 'Markdown', ...approveKeyboard }
        );
      }
      
      notifiedCount++;
      console.log(`✅ Notification sent to admin: ${adminId}`);

    } catch (error) {
      console.error(`❌ Failed to notify admin ${adminId}:`, error.message);
    }

    // Small delay between notifications
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  return notifiedCount;
}

// ========== ADMIN MESSAGING SYSTEM ========== //

// Admin: Message individual user
bot.onText(/\/messageuser/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!ADMIN_IDS.includes(userId)) return;
  
  userStates.set(userId, { state: 'awaiting_user_id_for_message' });
  
  await bot.sendMessage(chatId,
    `📨 *Message Individual User*\n\n` +
    `Please send the User ID you want to message.\n\n` +
    `You can get User IDs from:\n` +
    `• /users command\n` +
    `• Product approval notifications\n\n` +
    `Type /cancel to cancel.`,
    { parse_mode: 'Markdown' }
  );
});

// Admin: Broadcast to all users
bot.onText(/\/broadcast/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!ADMIN_IDS.includes(userId)) return;
  
  userStates.set(userId, { state: 'awaiting_broadcast_message' });
  
  await bot.sendMessage(chatId,
    `📢 *Broadcast to All Users*\n\n` +
    `Send the message you want to broadcast to *ALL* users (${users.size} people).\n\n` +
    `You can use:\n` +
    `• Text and emojis\n` +
    `• Markdown formatting\n` +
    `• Important announcements\n\n` +
    `Type /cancel to cancel.`,
    { parse_mode: 'Markdown' }
  );
});

// ========== ENHANCED ADMIN PANEL ========== //

bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!ADMIN_IDS.includes(userId)) {
    await bot.sendMessage(chatId,
      '❌ *Access Denied*\n\nYou are not authorized to use admin commands.',
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  // Get pending products count
  const pendingCount = Array.from(products.values())
    .filter(p => p.status === 'pending').length;
  
  const adminKeyboard = {
    reply_markup: {
      keyboard: [
        [{ text: `⏳ Pending (${pendingCount})` }, { text: '📊 Stats' }],
        [{ text: '📨 Message User' }, { text: '📢 Broadcast' }],
        [{ text: '👥 Users' }, { text: '🛍️ All Products' }],
        [{ text: '🏪 Main Menu' }]
      ],
      resize_keyboard: true
    }
  };
  
  await bot.sendMessage(chatId,
    `⚡ *JU Marketplace Admin Panel*\n\n` +
    `*Quick Stats:*\n` +
    `• 👥 Users: ${users.size}\n` +
    `• 🛍️ Products: ${products.size}\n` +
    `• ⏳ Pending: ${pendingCount}\n\n` +
    `Choose an option below:`,
    { parse_mode: 'Markdown', ...adminKeyboard }
  );
});

// ========== ENHANCED PENDING APPROVALS ========== //

bot.onText(/\/pending/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!ADMIN_IDS.includes(userId)) return;
  
  const pendingProducts = Array.from(products.values())
    .filter(product => product.status === 'pending')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  if (pendingProducts.length === 0) {
    await bot.sendMessage(chatId,
      '✅ *All Caught Up!*\n\nNo products pending approval. Great job! 🎉',
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  await bot.sendMessage(chatId,
    `⏳ *Pending Approvals (${pendingProducts.length})*\n\n` +
    `Products waiting for your review:`,
    { parse_mode: 'Markdown' }
  );
  
  for (const product of pendingProducts) {
    const seller = users.get(product.sellerId);
    const timeAgo = getTimeAgo(product.createdAt);
    
    const approveKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Approve', callback_data: `approve_${product.id}` },
            { text: '❌ Reject', callback_data: `reject_${product.id}` }
          ],
          [
            { text: '📨 Message Seller', callback_data: `message_seller_${product.sellerId}` },
            { text: '👀 Details', callback_data: `admindetails_${product.id}` }
          ]
        ]
      }
    };
    
    try {
      await bot.sendPhoto(chatId, product.images[0], {
        caption: `⏳ *Pending Approval* (${timeAgo})\n\n` +
                 `🏷️ *Title:* ${product.title}\n` +
                 `💰 *Price:* ${product.price} ETB\n` +
                 `📂 *Category:* ${product.category}\n` +
                 `👤 *Seller:* ${seller?.firstName || 'Student'} (@${seller?.username || 'No username'})\n` +
                 `${product.description ? `📝 *Description:* ${product.description}\n` : ''}` +
                 `📅 *Submitted:* ${product.createdAt.toLocaleString()}`,
        parse_mode: 'Markdown',
        reply_markup: approveKeyboard.reply_markup
      });
    } catch (error) {
      await bot.sendMessage(chatId,
        `⏳ *Pending Approval* (${timeAgo})\n\n` +
        `🏷️ *Title:* ${product.title}\n` +
        `💰 *Price:* ${product.price} ETB\n` +
        `📂 *Category:* ${product.category}\n` +
        `👤 *Seller:* ${seller?.firstName || 'Student'}\n` +
        `${product.description ? `📝 *Description:* ${product.description}\n` : ''}`,
        { parse_mode: 'Markdown', reply_markup: approveKeyboard.reply_markup }
      );
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
  }
});

// ========== ENHANCED CALLBACK HANDLERS ========== //

bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;
  
  try {
    // Admin approval
    if (data.startsWith('approve_')) {
      const productId = parseInt(data.replace('approve_', ''));
      await handleAdminApproval(productId, callbackQuery, true);
      return;
    }
    
    // Admin rejection
    if (data.startsWith('reject_')) {
      const productId = parseInt(data.replace('reject_', ''));
      await handleAdminApproval(productId, callbackQuery, false);
      return;
    }
    
    // Message seller directly from approval notification
    if (data.startsWith('message_seller_')) {
      const sellerId = parseInt(data.replace('message_seller_', ''));
      
      if (!ADMIN_IDS.includes(userId)) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Admin access required' });
        return;
      }
      
      const seller = users.get(sellerId);
      if (!seller) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Seller not found' });
        return;
      }
      
      userStates.set(userId, { 
        state: 'awaiting_individual_message', 
        targetUserId: sellerId 
      });
      
      await bot.sendMessage(chatId,
        `📨 *Message Seller*\n\n` +
        `Seller: ${seller.firstName} (@${seller.username || 'No username'})\n` +
        `ID: ${sellerId}\n\n` +
        `Please send your message:`,
        { parse_mode: 'Markdown' }
      );
      
      await bot.answerCallbackQuery(callbackQuery.id, { 
        text: `Messaging ${seller.firstName}` 
      });
      return;
    }
    
    // Handle broadcast confirmation
    if (data.startsWith('confirm_broadcast_')) {
      const broadcastMessage = decodeURIComponent(data.replace('confirm_broadcast_', ''));
      let sentCount = 0;
      let failedCount = 0;
      
      await bot.editMessageText(
        `📢 *Sending Broadcast...*\n\n` +
        `Please wait while I send to ${users.size} users...`,
        {
          chat_id: chatId,
          message_id: message.message_id,
          parse_mode: 'Markdown'
        }
      );
      
      // Send to all users
      for (const [userTelegramId, user] of users) {
        try {
          await bot.sendMessage(userTelegramId,
            `📢 *Important Announcement*\n\n` +
            `${broadcastMessage}\n\n` +
            `*Jimma University Marketplace* 🎓`,
            { parse_mode: 'Markdown' }
          );
          sentCount++;
          
          // Delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          failedCount++;
        }
      }
      
      await bot.editMessageText(
        `✅ *Broadcast Complete!*\n\n` +
        `📤 *Sent to:* ${sentCount} users\n` +
        `❌ *Failed:* ${failedCount} users\n` +
        `📊 *Success rate:* ${((sentCount / users.size) * 100).toFixed(1)}%\n\n` +
        `Message delivered to JU Marketplace community! 🎉`,
        {
          chat_id: chatId,
          message_id: message.message_id,
          parse_mode: 'Markdown'
        }
      );
      
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: `✅ Sent to ${sentCount} users`
      });
      return;
    }
    
    // Cancel broadcast
    if (data === 'cancel_broadcast') {
      await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Broadcast cancelled' });
      await bot.sendMessage(chatId, 'Broadcast cancelled.');
      return;
    }
    
    // Admin view details
    if (data.startsWith('admindetails_')) {
      const productId = parseInt(data.replace('admindetails_', ''));
      
      if (!ADMIN_IDS.includes(userId)) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Admin access required' });
        return;
      }
      
      const product = products.get(productId);
      if (!product) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Product not found' });
        return;
      }
      
      const seller = users.get(product.sellerId);
      
      await bot.sendMessage(chatId,
        `🔍 *Admin - Product Details*\n\n` +
        `🏷️ *Title:* ${product.title}\n` +
        `💰 *Price:* ${product.price} ETB\n` +
        `📂 *Category:* ${product.category}\n` +
        `👤 *Seller:* ${seller?.firstName || 'Unknown'} (@${seller?.username || 'No username'})\n` +
        `🆔 *Seller ID:* ${product.sellerId}\n` +
        `📅 *Submitted:* ${product.createdAt.toLocaleString()}\n` +
        `🏷️ *Status:* ${product.status}\n\n` +
        `${product.description ? `📝 *Description:*\n${product.description}\n\n` : ''}` +
        `🖼️ *Images:* ${product.images?.length || 0}`,
        { parse_mode: 'Markdown' }
      );
      
      await bot.answerCallbackQuery(callbackQuery.id, { text: '📦 Product details sent' });
      return;
    }
    
  } catch (error) {
    console.error('Admin callback error:', error);
    await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Error processing request' });
  }
});

// ========== HANDLE ADMIN MESSAGE INPUTS ========== //

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const userState = userStates.get(userId);
  
  if (userState && ADMIN_IDS.includes(userId)) {
    try {
      switch (userState.state) {
        case 'awaiting_user_id_for_message':
          const targetUserId = parseInt(text);
          if (isNaN(targetUserId)) {
            await bot.sendMessage(chatId, '❌ Please enter a valid numeric User ID.');
            return;
          }
          
          const targetUser = users.get(targetUserId);
          if (!targetUser) {
            await bot.sendMessage(chatId, '❌ User not found. Please check the User ID.');
            return;
          }
          
          userStates.set(userId, { 
            state: 'awaiting_individual_message', 
            targetUserId: targetUserId 
          });
          
          await bot.sendMessage(chatId,
            `📨 *Message to ${targetUser.firstName}*\n\n` +
            `User: ${targetUser.firstName} (@${targetUser.username || 'No username'})\n` +
            `ID: ${targetUserId}\n\n` +
            `Now please send the message you want to send:`,
            { parse_mode: 'Markdown' }
          );
          break;
          
        case 'awaiting_individual_message':
          const targetUserID = userState.targetUserId;
          const targetUserInfo = users.get(targetUserID);
          
          try {
            // Send message to target user
            await bot.sendMessage(targetUserID,
              `📨 *Message from JU Marketplace Admin*\n\n` +
              `${text}\n\n` +
              `*Jimma University Marketplace* 🎓`,
              { parse_mode: 'Markdown' }
            );
            
            await bot.sendMessage(chatId,
              `✅ *Message Sent Successfully!*\n\n` +
              `To: ${targetUserInfo.firstName} (@${targetUserInfo.username || 'No username'})\n` +
              `ID: ${targetUserID}\n\n` +
              `Your message has been delivered.`,
              { parse_mode: 'Markdown' }
            );
            
          } catch (error) {
            await bot.sendMessage(chatId,
              `❌ *Failed to Send Message*\n\n` +
              `User might have blocked the bot or deleted their account.\n\n` +
              `Error: ${error.message}`,
              { parse_mode: 'Markdown' }
            );
          }
          
          userStates.delete(userId);
          break;
          
        case 'awaiting_broadcast_message':
          const confirmKeyboard = {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Yes, Send to All', callback_data: `confirm_broadcast_${encodeURIComponent(text)}` },
                  { text: '❌ Cancel', callback_data: 'cancel_broadcast' }
                ]
              ]
            }
          };
          
          await bot.sendMessage(chatId,
            `📢 *Broadcast Confirmation*\n\n` +
            `*Your Message:*\n"${text}"\n\n` +
            `*This will be sent to:* ${users.size} users\n\n` +
            `Are you sure you want to send this broadcast?`,
            { parse_mode: 'Markdown', ...confirmKeyboard }
          );
          
          userStates.delete(userId);
          break;
      }
    } catch (error) {
      console.error('Admin messaging error:', error);
      await bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
    }
  }
});

// ========== UTILITY FUNCTIONS ========== //

function getTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

// Test command to simulate a new product submission
bot.onText(/\/testapproval/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!ADMIN_IDS.includes(userId)) return;
  
  // Create test product
  const testProduct = {
    id: Date.now(),
    sellerId: userId,
    sellerUsername: 'test_seller',
    title: 'Test Product - Engineering Calculator',
    description: 'This is a test product for notification testing. Casio FX-991ES, like new condition.',
    price: 450,
    category: '💻 Electronics',
    images: ['AgACAgQAAxkDAAIBmWcAAAExnD5n8vVQnRwv6pR2S1yLdwACb8IxG8AAAVFTJ8AAAfQKAAH0BA'],
    status: 'pending',
    createdAt: new Date()
  };
  
  await bot.sendMessage(chatId, '🔄 Sending test approval notification...');
  
  const notifiedCount = await notifyAdminsAboutNewProduct(testProduct);
  
  await bot.sendMessage(chatId,
    `✅ Test completed!\n\n` +
    `Notifications sent to ${notifiedCount}/${ADMIN_IDS.length} admins.\n\n` +
    `You should receive the approval message shortly.`
  );
});
