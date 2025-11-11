const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
require('dotenv').config();

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

app.get('/', (req, res) => {
  res.send('🤖 Image Gallery Bot is alive!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

console.log('✅ Image Gallery Bot started!');

// Store user images
const userImages = new Map();

// ========== MAIN MENU ========== //
const showMainMenu = (chatId) => {
  const options = {
    reply_markup: {
      keyboard: [
        [{ text: '📸 Upload Image' }, { text: '🖼️ See Your Images' }],
        [{ text: 'ℹ️ Help' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
  
  bot.sendMessage(chatId, 
    `🖼️ *Image Gallery Bot*\n\n` +
    `Upload your images and view them anytime!\n\n` +
    `Choose an option:`,
    { parse_mode: 'Markdown', ...options }
  );
};

// ========== START COMMAND ========== //
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  // Initialize user storage if not exists
  if (!userImages.has(userId)) {
    userImages.set(userId, []);
  }
  
  bot.sendMessage(chatId, 
    `👋 Welcome to Image Gallery!\n\n` +
    `📸 *Upload* - Add your images\n` +
    `🖼️ *See Your Images* - View all your uploaded images\n\n` +
    `Start by uploading your first image!`,
    { parse_mode: 'Markdown' }
  );
  
  showMainMenu(chatId);
});

// ========== UPLOAD IMAGE ========== //
bot.onText(/\/upload|📸 Upload Image/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  // Initialize user storage if not exists
  if (!userImages.has(userId)) {
    userImages.set(userId, []);
  }
  
  bot.sendMessage(chatId, 
    `📸 *Upload Image*\n\n` +
    `Send me a photo and I'll save it to your gallery!\n\n` +
    `You can upload multiple images.`,
    { parse_mode: 'Markdown' }
  );
});

// Handle image uploads
bot.on('photo', (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const photo = msg.photo[msg.photo.length - 1];
  
  // Initialize user storage if not exists
  if (!userImages.has(userId)) {
    userImages.set(userId, []);
  }
  
  const userImageList = userImages.get(userId);
  
  // Save image info
  const imageData = {
    fileId: photo.file_id,
    timestamp: new Date(),
    fileSize: photo.file_size,
    messageId: msg.message_id
  };
  
  userImageList.push(imageData);
  
  bot.sendMessage(chatId,
    `✅ *Image Uploaded Successfully!*\n\n` +
    `🖼️ Image #${userImageList.length} saved to your gallery\n` +
    `📅 Uploaded: ${imageData.timestamp.toLocaleString()}\n` +
    `💾 Size: ${(photo.file_size / 1024).toFixed(1)} KB\n\n` +
    `Click "🖼️ See Your Images" to view all your photos!`,
    { parse_mode: 'Markdown' }
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
      `You haven't uploaded any images yet!\n\n` +
      `Click "📸 Upload Image" to add your first photo.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  // Send gallery summary
  bot.sendMessage(chatId,
    `🖼️ *Your Image Gallery*\n\n` +
    `You have ${userImageList.length} image(s) in your gallery:\n\n` +
    `Scroll down to view all your images 👇`,
    { parse_mode: 'Markdown' }
  );
  
  // Send each image with navigation buttons
  userImageList.forEach((image, index) => {
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: `🖼️ Image ${index + 1}/${userImageList.length}`, callback_data: 'image_info' },
            { text: '🗑️ Delete', callback_data: `delete_${index}` }
          ],
          [
            { text: '⬅️ Previous', callback_data: `prev_${index}` },
            { text: 'Next ➡️', callback_data: `next_${index}` }
          ]
        ]
      }
    };
    
    bot.sendPhoto(chatId, image.fileId, {
      caption: `🖼️ *Your Image ${index + 1}/${userImageList.length}*\n\n` +
               `📅 Uploaded: ${image.timestamp.toLocaleString()}\n` +
               `💾 Size: ${(image.fileSize / 1024).toFixed(1)} KB`,
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  });
});

// ========== GALLERY CONTROLS ========== //
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;
  
  const userImageList = userImages.get(userId) || [];
  
  try {
    if (data === 'image_info') {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: `You have ${userImageList.length} images in gallery`
      });
      return;
    }
    
    if (data.startsWith('delete_')) {
      const index = parseInt(data.replace('delete_', ''));
      
      if (userImageList[index]) {
        userImageList.splice(index, 1);
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: '✅ Image deleted from gallery'
        });
        
        // Update the message
        await bot.editMessageCaption('🗑️ *Image Deleted*\n\nThis image has been removed from your gallery.', {
          chat_id: chatId,
          message_id: message.message_id,
          parse_mode: 'Markdown'
        });
      }
      return;
    }
    
    if (data.startsWith('prev_')) {
      const currentIndex = parseInt(data.replace('prev_', ''));
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : userImageList.length - 1;
      const image = userImageList[prevIndex];
      
      if (image) {
        await bot.editMessageMedia(
          {
            type: 'photo',
            media: image.fileId,
            caption: `🖼️ *Your Image ${prevIndex + 1}/${userImageList.length}*\n\n` +
                     `📅 Uploaded: ${image.timestamp.toLocaleString()}\n` +
                     `💾 Size: ${(image.fileSize / 1024).toFixed(1)} KB`,
            parse_mode: 'Markdown'
          },
          {
            chat_id: chatId,
            message_id: message.message_id,
            reply_markup: {
              inline_keyboard: [
                [
                  { text: `🖼️ Image ${prevIndex + 1}/${userImageList.length}`, callback_data: 'image_info' },
                  { text: '🗑️ Delete', callback_data: `delete_${prevIndex}` }
                ],
                [
                  { text: '⬅️ Previous', callback_data: `prev_${prevIndex}` },
                  { text: 'Next ➡️', callback_data: `next_${prevIndex}` }
                ]
              ]
            }
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: `Image ${prevIndex + 1}/${userImageList.length}`
        });
      }
      return;
    }
    
    if (data.startsWith('next_')) {
      const currentIndex = parseInt(data.replace('next_', ''));
      const nextIndex = currentIndex < userImageList.length - 1 ? currentIndex + 1 : 0;
      const image = userImageList[nextIndex];
      
      if (image) {
        await bot.editMessageMedia(
          {
            type: 'photo',
            media: image.fileId,
            caption: `🖼️ *Your Image ${nextIndex + 1}/${userImageList.length}*\n\n` +
                     `📅 Uploaded: ${image.timestamp.toLocaleString()}\n` +
                     `💾 Size: ${(image.fileSize / 1024).toFixed(1)} KB`,
            parse_mode: 'Markdown'
          },
          {
            chat_id: chatId,
            message_id: message.message_id,
            reply_markup: {
              inline_keyboard: [
                [
                  { text: `🖼️ Image ${nextIndex + 1}/${userImageList.length}`, callback_data: 'image_info' },
                  { text: '🗑️ Delete', callback_data: `delete_${nextIndex}` }
                ],
                [
                  { text: '⬅️ Previous', callback_data: `prev_${nextIndex}` },
                  { text: 'Next ➡️', callback_data: `next_${nextIndex}` }
                ]
              ]
            }
          }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: `Image ${nextIndex + 1}/${userImageList.length}`
        });
      }
      return;
    }
    
  } catch (error) {
    console.error('Gallery control error:', error);
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: '❌ Error processing request'
    });
  }
});

// ========== HELP COMMAND ========== //
bot.onText(/\/help|ℹ️ Help/, (msg) => {
  const chatId = msg.chat.id;
  
  bot.sendMessage(chatId,
    `ℹ️ *Image Gallery Bot Help*\n\n` +
    `*How to Use:*\n` +
    `📸 *Upload Image* - Send photos to save in your gallery\n` +
    `🖼️ *See Your Images* - View all your uploaded images\n\n` +
    `*Gallery Features:*\n` +
    `• Navigate with Previous/Next buttons\n` +
    `• Delete images you don't want\n` +
    `• View upload date and file size\n` +
    `• All images stored securely\n\n` +
    `*Commands:*\n` +
    `/start - Start the bot\n` +
    `/upload - Upload images\n` +
    `/gallery - View your images\n` +
    `/help - This message`,
    { parse_mode: 'Markdown' }
  );
});

// ========== ADMIN COMMAND (View Stats) ========== //
bot.onText(/\/stats/, (msg) => {
  const chatId = msg.chat.id;
  
  let totalImages = 0;
  let totalUsers = 0;
  
  userImages.forEach((images, userId) => {
    totalUsers++;
    totalImages += images.length;
  });
  
  bot.sendMessage(chatId,
    `📊 *Bot Statistics*\n\n` +
    `👥 Total Users: ${totalUsers}\n` +
    `🖼️ Total Images: ${totalImages}\n` +
    `💾 Storage: Memory (temporary)\n\n` +
    `*Note:* Images are stored temporarily and will be lost when bot restarts.`,
    { parse_mode: 'Markdown' }
  );
});

console.log('🎉 Image Gallery Bot ready! Users can upload and view images.');
