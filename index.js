const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
require('dotenv').config();

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID || '@jumarket'; // Your channel username or ID

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

app.get('/', (req, res) => {
  res.send('🤖 Image Gallery Bot with Channel Posting!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

console.log('✅ Image Gallery Bot with Channel Posting started!');

// Store user images
const userImages = new Map();

// ========== MAIN MENU ========== //
const showMainMenu = (chatId) => {
  const options = {
    reply_markup: {
      keyboard: [
        [{ text: '📸 Upload Image' }, { text: '🖼️ See Your Images' }],
        [{ text: '📢 Post to Channel' }, { text: 'ℹ️ Help' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
  
  bot.sendMessage(chatId, 
    `🖼️ *Image Gallery Bot*\n\n` +
    `Upload images and post them to our channel!\n\n` +
    `Choose an option:`,
    { parse_mode: 'Markdown', ...options }
  );
};

// ========== START COMMAND ========== //
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!userImages.has(userId)) {
    userImages.set(userId, []);
  }
  
  bot.sendMessage(chatId, 
    `👋 Welcome to Image Gallery!\n\n` +
    `📸 *Upload* - Add your images\n` +
    `🖼️ *See Your Images* - View your gallery\n` +
    `📢 *Post to Channel* - Share images to ${CHANNEL_ID}\n\n` +
    `Start by uploading your first image!`,
    { parse_mode: 'Markdown' }
  );
  
  showMainMenu(chatId);
});

// ========== UPLOAD IMAGE ========== //
bot.onText(/\/upload|📸 Upload Image/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!userImages.has(userId)) {
    userImages.set(userId, []);
  }
  
  bot.sendMessage(chatId, 
    `📸 *Upload Image*\n\n` +
    `Send me a photo and I'll save it to your gallery!\n\n` +
    `After uploading, you can post it to ${CHANNEL_ID}`,
    { parse_mode: 'Markdown' }
  );
});

// Handle image uploads
bot.on('photo', (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const photo = msg.photo[msg.photo.length - 1];
  
  if (!userImages.has(userId)) {
    userImages.set(userId, []);
  }
  
  const userImageList = userImages.get(userId);
  
  const imageData = {
    fileId: photo.file_id,
    timestamp: new Date(),
    fileSize: photo.file_size,
    messageId: msg.message_id,
    caption: '' // User can add caption later
  };
  
  userImageList.push(imageData);
  
  // Ask if user wants to add caption and post to channel
  const postKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✏️ Add Caption & Post', callback_data: `caption_${userImageList.length - 1}` },
          { text: '📢 Post Now', callback_data: `post_${userImageList.length - 1}` }
        ],
        [
          { text: '💾 Save Only', callback_data: 'save_only' }
        ]
      ]
    }
  };
  
  bot.sendMessage(chatId,
    `✅ *Image Uploaded Successfully!*\n\n` +
    `🖼️ Image #${userImageList.length} saved to your gallery\n\n` +
    `Would you like to post this image to ${CHANNEL_ID}?`,
    { parse_mode: 'Markdown', ...postKeyboard }
  );
});

// ========== SEE YOUR IMAGES ========== //
bot.onText(/\/gallery|🖼️ See Your Images/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  const userImageList = userImages.get(userId) || [];
  
  if (userImageList.length === 0) {
    bot.sendMessage(chatId,
      `🖼️ *Your Image Gallery*\n\n` +
      `No images yet! Use "📸 Upload Image" first.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  bot.sendMessage(chatId,
    `🖼️ *Your Image Gallery*\n\n` +
    `You have ${userImageList.length} image(s)\n\n` +
    `Scroll down to view 👇`,
    { parse_mode: 'Markdown' }
  );
  
  // Send each image with posting options
  userImageList.forEach((image, index) => {
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: `🖼️ ${index + 1}/${userImageList.length}`, callback_data: 'info' },
            { text: '📢 Post to Channel', callback_data: `post_${index}` }
          ],
          [
            { text: '✏️ Add Caption', callback_data: `addcaption_${index}` },
            { text: '🗑️ Delete', callback_data: `delete_${index}` }
          ],
          [
            { text: '⬅️ Previous', callback_data: `prev_${index}` },
            { text: 'Next ➡️', callback_data: `next_${index}` }
          ]
        ]
      }
    };
    
    const caption = image.caption 
      ? `📝 ${image.caption}\n\n🖼️ Image ${index + 1}/${userImageList.length}`
      : `🖼️ Image ${index + 1}/${userImageList.length}\n\nClick "✏️ Add Caption" to add text`;
    
    bot.sendPhoto(chatId, image.fileId, {
      caption: caption,
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  });
});

// ========== POST TO CHANNEL MENU ========== //
bot.onText(/\/post|📢 Post to Channel/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  const userImageList = userImages.get(userId) || [];
  
  if (userImageList.length === 0) {
    bot.sendMessage(chatId,
      `📢 *Post to Channel*\n\n` +
      `You need to upload images first!\n\n` +
      `Use "📸 Upload Image" to add photos to your gallery.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  const channelKeyboard = {
    reply_markup: {
      inline_keyboard: [
        ...userImageList.map((image, index) => [
          { 
            text: `🖼️ Image ${index + 1} ${image.caption ? '📝' : ''}`, 
            callback_data: `channelpost_${index}` 
          }
        ]),
        [
          { text: '📢 Post All Images', callback_data: 'post_all' }
        ]
      ]
    }
  };
  
  bot.sendMessage(chatId,
    `📢 *Post to ${CHANNEL_ID}*\n\n` +
    `Select an image to post to our channel:\n\n` +
    `🖼️ - Image without caption\n` +
    `📝 - Image with caption\n\n` +
    `You can also post all images at once!`,
    { parse_mode: 'Markdown', ...channelKeyboard }
  );
});

// ========== CALLBACK QUERY HANDLER ========== //
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;
  
  const userImageList = userImages.get(userId) || [];
  
  try {
    // Post image to channel immediately
    if (data.startsWith('post_')) {
      const index = parseInt(data.replace('post_', ''));
      const image = userImageList[index];
      
      if (image) {
        try {
          // Post to channel
          await bot.sendPhoto(CHANNEL_ID, image.fileId, {
            caption: image.caption || `📸 Shared via Image Gallery Bot\n👤 Posted by: @${callbackQuery.from.username || 'User'}`,
            parse_mode: 'Markdown'
          });
          
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: `✅ Image posted to ${CHANNEL_ID}!`
          });
          
          await bot.sendMessage(chatId,
            `📢 *Posted to Channel!*\n\n` +
            `Your image has been successfully posted to ${CHANNEL_ID}\n\n` +
            `Check it out in the channel! 🎉`,
            { parse_mode: 'Markdown' }
          );
          
        } catch (channelError) {
          console.error('Channel post error:', channelError);
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ Failed to post to channel'
          });
        }
      }
      return;
    }
    
    // Add caption before posting
    if (data.startsWith('caption_')) {
      const index = parseInt(data.replace('caption_', ''));
      const userState = { action: 'awaiting_caption', imageIndex: index };
      
      // Store user state for caption input
      if (!userImages.has(`state_${userId}`)) {
        userImages.set(`state_${userId}`, userState);
      } else {
        userImages.set(`state_${userId}`, userState);
      }
      
      await bot.sendMessage(chatId,
        `✏️ *Add Caption for Channel Post*\n\n` +
        `Please send the caption text for this image.\n\n` +
        `It will be posted to ${CHANNEL_ID}\n\n` +
        `Type /cancel to skip caption.`,
        { parse_mode: 'Markdown' }
      );
      
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '📝 Please enter caption'
      });
      return;
    }
    
    // Add caption to existing image
    if (data.startsWith('addcaption_')) {
      const index = parseInt(data.replace('addcaption_', ''));
      const userState = { action: 'add_caption', imageIndex: index };
      userImages.set(`state_${userId}`, userState);
      
      await bot.sendMessage(chatId,
        `✏️ *Add Caption*\n\n` +
        `Send the caption for this image:\n\n` +
        `Type /cancel to skip.`,
        { parse_mode: 'Markdown' }
      );
      
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '📝 Enter caption text'
      });
      return;
    }
    
    // Post specific image to channel from menu
    if (data.startsWith('channelpost_')) {
      const index = parseInt(data.replace('channelpost_', ''));
      const image = userImageList[index];
      
      if (image) {
        const confirmKeyboard = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Yes, Post Now', callback_data: `confirmpost_${index}` },
                { text: '✏️ Add Caption First', callback_data: `caption_${index}` }
              ],
              [
                { text: '❌ Cancel', callback_data: 'cancel_post' }
              ]
            ]
          }
        };
        
        await bot.sendMessage(chatId,
          `📢 *Post Image ${index + 1} to ${CHANNEL_ID}?*\n\n` +
          `This will share your image with the channel audience.\n\n` +
          `Caption: ${image.caption || 'No caption'}`,
          { parse_mode: 'Markdown', ...confirmKeyboard }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: 'Confirm channel post'
        });
      }
      return;
    }
    
    // Confirm and post to channel
    if (data.startsWith('confirmpost_')) {
      const index = parseInt(data.replace('confirmpost_', ''));
      const image = userImageList[index];
      
      if (image) {
        try {
          await bot.sendPhoto(CHANNEL_ID, image.fileId, {
            caption: image.caption || `📸 Shared via Image Gallery Bot\n👤 Posted by: @${callbackQuery.from.username || 'User'}`,
            parse_mode: 'Markdown'
          });
          
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: `✅ Posted to ${CHANNEL_ID}!`
          });
          
          await bot.editMessageText(
            `📢 *Successfully Posted!*\n\n` +
            `Your image has been shared in ${CHANNEL_ID}\n\n` +
            `Thank you for sharing! 🎉`,
            {
              chat_id: chatId,
              message_id: message.message_id,
              parse_mode: 'Markdown'
            }
          );
          
        } catch (error) {
          console.error('Channel post error:', error);
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ Failed to post to channel'
          });
        }
      }
      return;
    }
    
    // Post all images to channel
    if (data === 'post_all') {
      let postedCount = 0;
      
      for (let i = 0; i < userImageList.length; i++) {
        const image = userImageList[i];
        try {
          await bot.sendPhoto(CHANNEL_ID, image.fileId, {
            caption: image.caption || `📸 Image ${i + 1} shared via Image Gallery Bot`,
            parse_mode: 'Markdown'
          });
          postedCount++;
          
          // Small delay between posts to avoid rate limits
          if (i < userImageList.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          console.error(`Failed to post image ${i + 1}:`, error);
        }
      }
      
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: `✅ Posted ${postedCount}/${userImageList.length} images!`
      });
      
      await bot.editMessageText(
        `📢 *Bulk Post Complete!*\n\n` +
        `Successfully posted ${postedCount} images to ${CHANNEL_ID}\n\n` +
        `Check the channel to see all your shared images! 🎉`,
        {
          chat_id: chatId,
          message_id: message.message_id,
          parse_mode: 'Markdown'
        }
      );
      return;
    }
    
    // Handle caption input from text messages
    if (data === 'save_only') {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '✅ Image saved to gallery'
      });
      return;
    }
    
    // Keep your existing navigation and delete handlers here...
    // [Previous/Next/Delete code from earlier version]
    
  } catch (error) {
    console.error('Callback error:', error);
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: '❌ Error processing request'
    });
  }
});

// ========== HANDLE CAPTION INPUT ========== //
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const userState = userImages.get(`state_${userId}`);
  const userImageList = userImages.get(userId) || [];
  
  if (userState && (userState.action === 'awaiting_caption' || userState.action === 'add_caption')) {
    const imageIndex = userState.imageIndex;
    
    if (userImageList[imageIndex]) {
      // Save caption
      userImageList[imageIndex].caption = text;
      userImages.delete(`state_${userId}`);
      
      // If it was for immediate posting
      if (userState.action === 'awaiting_caption') {
        try {
          // Post to channel with new caption
          await bot.sendPhoto(CHANNEL_ID, userImageList[imageIndex].fileId, {
            caption: text,
            parse_mode: 'Markdown'
          });
          
          await bot.sendMessage(chatId,
            `📢 *Posted to Channel with Caption!*\n\n` +
            `"${text}"\n\n` +
            `Your image has been posted to ${CHANNEL_ID} 🎉`,
            { parse_mode: 'Markdown' }
          );
        } catch (error) {
          await bot.sendMessage(chatId,
            `❌ Failed to post to channel, but caption was saved.\n\n` +
            `You can try posting again from "📢 Post to Channel" menu.`,
            { parse_mode: 'Markdown' }
          );
        }
      } else {
        // Just saved caption
        await bot.sendMessage(chatId,
          `✅ *Caption Added!*\n\n` +
          `"${text}"\n\n` +
          `Caption saved for this image. You can post it to channel anytime.`,
          { parse_mode: 'Markdown' }
        );
      }
    }
  }
});

// Cancel command
bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (userImages.has(`state_${userId}`)) {
    userImages.delete(`state_${userId}`);
    bot.sendMessage(chatId, '❌ Action cancelled.');
  }
});

console.log('🎉 Image Gallery Bot with Channel Posting ready!');
