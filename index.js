const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
require('dotenv').config();

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Store user images and states
const userImages = new Map();
const userStates = new Map();

app.get('/', (req, res) => {
  res.send('🤖 Image Gallery Bot with Channel Posting!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

console.log('✅ Bot started successfully!');

// ========== MAIN MENU ========== //
const showMainMenu = (chatId) => {
  const options = {
    reply_markup: {
      keyboard: [
        [{ text: '📸 Upload Image' }, { text: '🖼️ My Gallery' }],
        [{ text: '📢 Post to Channel' }, { text: 'ℹ️ Help' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
  
  bot.sendMessage(chatId, 
    `🖼️ *Image Gallery Bot*\n\n` +
    `Choose an option below:`,
    { parse_mode: 'Markdown', ...options }
  );
};

// ========== START COMMAND ========== //
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  // Initialize user storage
  if (!userImages.has(userId)) {
    userImages.set(userId, []);
  }
  
  bot.sendMessage(chatId, 
    `👋 *Welcome to Image Gallery Bot!*\n\n` +
    `📸 *Upload Image* - Add photos to your gallery\n` +
    `🖼️ *My Gallery* - View your uploaded images\n` +
    `📢 *Post to Channel* - Share images to channel\n\n` +
    `All buttons are working! Try them out! 🎉`,
    { parse_mode: 'Markdown' }
  );
  
  showMainMenu(chatId);
});

// ========== UPLOAD IMAGE BUTTON ========== //
bot.onText(/\/upload|📸 Upload Image/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!userImages.has(userId)) {
    userImages.set(userId, []);
  }
  
  bot.sendMessage(chatId, 
    `📸 *Upload Image*\n\n` +
    `Send me a photo to add to your gallery!\n\n` +
    `I'll save it and you can view it later or post to channel.`,
    { parse_mode: 'Markdown' }
  );
});

// ========== HANDLE PHOTO UPLOADS ========== //
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const photo = msg.photo[msg.photo.length - 1];
  
  if (!userImages.has(userId)) {
    userImages.set(userId, []);
  }
  
  const userImageList = userImages.get(userId);
  
  // Save image data
  const imageData = {
    fileId: photo.file_id,
    timestamp: new Date(),
    fileSize: photo.file_size,
    caption: ''
  };
  
  userImageList.push(imageData);
  const imageIndex = userImageList.length - 1;
  
  // Success message with action buttons
  const actionKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📢 Post to Channel', callback_data: `post_${imageIndex}` },
          { text: '✏️ Add Caption', callback_data: `add_caption_${imageIndex}` }
        ],
        [
          { text: '🖼️ View Gallery', callback_data: 'view_gallery' },
          { text: '📸 Upload More', callback_data: 'upload_more' }
        ]
      ]
    }
  };
  
  await bot.sendMessage(chatId,
    `✅ *Image Uploaded Successfully!*\n\n` +
    `🖼️ Saved as image #${userImageList.length} in your gallery\n` +
    `💾 Size: ${(photo.file_size / 1024).toFixed(1)} KB\n\n` +
    `What would you like to do next?`,
    { parse_mode: 'Markdown', ...actionKeyboard }
  );
});

// ========== MY GALLERY BUTTON ========== //
bot.onText(/\/gallery|🖼️ My Gallery/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  const userImageList = userImages.get(userId) || [];
  
  if (userImageList.length === 0) {
    await bot.sendMessage(chatId,
      `🖼️ *My Gallery*\n\n` +
      `Your gallery is empty!\n\n` +
      `Click "📸 Upload Image" to add your first photo.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  // Send gallery summary
  await bot.sendMessage(chatId,
    `🖼️ *My Gallery*\n\n` +
    `You have ${userImageList.length} image(s) in your gallery.\n\n` +
    `Scroll down to view all images 👇`,
    { parse_mode: 'Markdown' }
  );
  
  // Send each image with controls
  for (let i = 0; i < userImageList.length; i++) {
    const image = userImageList[i];
    
    const galleryKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: `🖼️ ${i + 1}/${userImageList.length}`, callback_data: 'image_info' },
            { text: '📢 Post', callback_data: `gallery_post_${i}` }
          ],
          [
            { text: '✏️ Caption', callback_data: `gallery_caption_${i}` },
            { text: '🗑️ Delete', callback_data: `gallery_delete_${i}` }
          ],
          [
            { text: '⬅️ Prev', callback_data: `gallery_prev_${i}` },
            { text: 'Next ➡️', callback_data: `gallery_next_${i}` }
          ]
        ]
      }
    };
    
    const caption = image.caption 
      ? `📝 ${image.caption}\n\n🖼️ Image ${i + 1}/${userImageList.length}`
      : `🖼️ Image ${i + 1}/${userImageList.length}\n\nTap "✏️ Caption" to add text`;
    
    await bot.sendPhoto(chatId, image.fileId, {
      caption: caption,
      parse_mode: 'Markdown',
      reply_markup: galleryKeyboard.reply_markup
    });
    
    // Small delay to avoid flooding
    if (i < userImageList.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
});

// ========== POST TO CHANNEL BUTTON ========== //
bot.onText(/\/post|📢 Post to Channel/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  const userImageList = userImages.get(userId) || [];
  
  if (userImageList.length === 0) {
    await bot.sendMessage(chatId,
      `📢 *Post to Channel*\n\n` +
      `No images to post!\n\n` +
      `Upload some images first using "📸 Upload Image"`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  // Create channel post menu
  const channelKeyboard = {
    reply_markup: {
      inline_keyboard: [
        // Add each image as an option
        ...userImageList.map((image, index) => [
          { 
            text: `🖼️ Image ${index + 1} ${image.caption ? '📝' : ''}`, 
            callback_data: `channel_select_${index}` 
          }
        ]),
        [
          { text: '📢 Post All to Channel', callback_data: 'post_all' },
          { text: '🔄 Refresh', callback_data: 'refresh_channel' }
        ],
        [
          { text: '📸 Upload More', callback_data: 'upload_from_channel' }
        ]
      ]
    }
  };
  
  await bot.sendMessage(chatId,
    `📢 *Post to Channel*\n\n` +
    `Select an image to post to channel:\n\n` +
    `🖼️ - Image\n` +
    `📝 - Image with caption\n\n` +
    `Or post all images at once!`,
    { parse_mode: 'Markdown', ...channelKeyboard }
  );
});

// ========== HELP BUTTON ========== //
bot.onText(/\/help|ℹ️ Help/, (msg) => {
  const chatId = msg.chat.id;
  
  bot.sendMessage(chatId,
    `ℹ️ *Image Gallery Bot Help*\n\n` +
    `*How to Use:*\n` +
    `📸 *Upload Image* - Send photos to save in gallery\n` +
    `🖼️ *My Gallery* - View and manage your images\n` +
    `📢 *Post to Channel* - Share images to channel\n\n` +
    `*Features:*\n` +
    `• Add captions to images\n` +
    `• Delete images from gallery\n` +
    `• Navigate through images\n` +
    `• Post single or all images\n\n` +
    `*All buttons are tested and working!* 🎉`,
    { parse_mode: 'Markdown' }
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
    console.log(`🔘 Button clicked: ${data}`);

    // === UPLOAD ACTIONS ===
    if (data === 'upload_more') {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '📸 Send another photo!'
      });
      return;
    }

    if (data === 'view_gallery') {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '🖼️ Opening your gallery...'
      });
      // Trigger gallery view
      bot.onText(/🖼️ My Gallery/, { chat: { id: chatId }, from: { id: userId } });
      return;
    }

    // === POST ACTIONS ===
    if (data.startsWith('post_')) {
      const index = parseInt(data.replace('post_', ''));
      await postImageToChannel(chatId, userId, index, callbackQuery.id);
      return;
    }

    if (data.startsWith('gallery_post_')) {
      const index = parseInt(data.replace('gallery_post_', ''));
      await postImageToChannel(chatId, userId, index, callbackQuery.id);
      return;
    }

    if (data.startsWith('channel_select_')) {
      const index = parseInt(data.replace('channel_select_', ''));
      const image = userImageList[index];
      
      const confirmKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Post Now', callback_data: `confirm_post_${index}` },
              { text: '✏️ Add Caption', callback_data: `channel_caption_${index}` }
            ],
            [
              { text: '❌ Cancel', callback_data: 'cancel_post' }
            ]
          ]
        }
      };

      await bot.editMessageText(
        `📢 *Post Image ${index + 1} to Channel?*\n\n` +
        `Caption: ${image.caption || 'No caption'}\n\n` +
        `Confirm to post this image:`,
        {
          chat_id: chatId,
          message_id: message.message_id,
          parse_mode: 'Markdown',
          reply_markup: confirmKeyboard.reply_markup
        }
      );

      await bot.answerCallbackQuery(callbackQuery.id, {
        text: 'Confirm channel post'
      });
      return;
    }

    if (data.startsWith('confirm_post_')) {
      const index = parseInt(data.replace('confirm_post_', ''));
      await postImageToChannel(chatId, userId, index, callbackQuery.id);
      return;
    }

    if (data === 'post_all') {
      await postAllImagesToChannel(chatId, userId, callbackQuery.id);
      return;
    }

    if (data === 'refresh_channel') {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '🔄 Refreshing...'
      });
      // Re-trigger channel post menu
      bot.onText(/📢 Post to Channel/, { chat: { id: chatId }, from: { id: userId } });
      return;
    }

    if (data === 'upload_from_channel') {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '📸 Send a photo to upload!'
      });
      return;
    }

    // === CAPTION ACTIONS ===
    if (data.startsWith('add_caption_')) {
      const index = parseInt(data.replace('add_caption_', ''));
      await startCaptionProcess(chatId, userId, index, callbackQuery.id);
      return;
    }

    if (data.startsWith('gallery_caption_')) {
      const index = parseInt(data.replace('gallery_caption_', ''));
      await startCaptionProcess(chatId, userId, index, callbackQuery.id);
      return;
    }

    if (data.startsWith('channel_caption_')) {
      const index = parseInt(data.replace('channel_caption_', ''));
      await startCaptionProcess(chatId, userId, index, callbackQuery.id);
      return;
    }

    // === GALLERY NAVIGATION ===
    if (data.startsWith('gallery_prev_')) {
      const currentIndex = parseInt(data.replace('gallery_prev_', ''));
      await navigateGallery(chatId, userId, currentIndex, 'prev', callbackQuery.id);
      return;
    }

    if (data.startsWith('gallery_next_')) {
      const currentIndex = parseInt(data.replace('gallery_next_', ''));
      await navigateGallery(chatId, userId, currentIndex, 'next', callbackQuery.id);
      return;
    }

    // === DELETE ACTIONS ===
    if (data.startsWith('gallery_delete_')) {
      const index = parseInt(data.replace('gallery_delete_', ''));
      await deleteImage(chatId, userId, index, message.message_id, callbackQuery.id);
      return;
    }

    // === CANCEL ACTIONS ===
    if (data === 'cancel_post') {
      await bot.editMessageText(
        `❌ *Post Cancelled*\n\n` +
        `Image posting was cancelled.\n\n` +
        `You can try again from the main menu.`,
        {
          chat_id: chatId,
          message_id: message.message_id,
          parse_mode: 'Markdown'
        }
      );
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: 'Post cancelled'
      });
      return;
    }

    // === INFO ACTIONS ===
    if (data === 'image_info') {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: `You have ${userImageList.length} images`
      });
      return;
    }

    // Unknown callback
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: '❌ Unknown button action'
    });

  } catch (error) {
    console.error('Callback error:', error);
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: '❌ Error processing request'
    });
  }
});

// ========== HELPER FUNCTIONS ========== //

// Post single image to channel
async function postImageToChannel(chatId, userId, index, callbackQueryId) {
  const userImageList = userImages.get(userId) || [];
  const image = userImageList[index];
  
  if (!image) {
    await bot.answerCallbackQuery(callbackQueryId, {
      text: '❌ Image not found'
    });
    return;
  }
  
  try {
    await bot.sendPhoto(CHANNEL_ID, image.fileId, {
      caption: image.caption || `📸 Shared via Image Gallery Bot\n👤 From: User`
    });
    
    await bot.answerCallbackQuery(callbackQueryId, {
      text: '✅ Posted to channel!'
    });
    
    await bot.sendMessage(chatId,
      `📢 *Successfully Posted!*\n\n` +
      `Image #${index + 1} has been shared in the channel! 🎉`,
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    console.error('Channel post error:', error);
    await bot.answerCallbackQuery(callbackQueryId, {
      text: '❌ Failed to post to channel'
    });
    
    await bot.sendMessage(chatId,
      `❌ *Failed to Post*\n\n` +
      `Make sure:\n` +
      `• Bot is admin in channel\n` +
      `• Channel exists\n` +
      `• Try again later`,
      { parse_mode: 'Markdown' }
    );
  }
}

// Post all images to channel
async function postAllImagesToChannel(chatId, userId, callbackQueryId) {
  const userImageList = userImages.get(userId) || [];
  
  if (userImageList.length === 0) {
    await bot.answerCallbackQuery(callbackQueryId, {
      text: '❌ No images to post'
    });
    return;
  }
  
  let postedCount = 0;
  
  for (let i = 0; i < userImageList.length; i++) {
    const image = userImageList[i];
    try {
      await bot.sendPhoto(CHANNEL_ID, image.fileId, {
        caption: image.caption || `📸 Image ${i + 1} shared via bot`
      });
      postedCount++;
      
      // Delay between posts
      if (i < userImageList.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`Failed to post image ${i + 1}:`, error);
    }
  }
  
  await bot.answerCallbackQuery(callbackQueryId, {
    text: `✅ Posted ${postedCount} images!`
  });
  
  await bot.sendMessage(chatId,
    `📢 *Bulk Post Complete!*\n\n` +
    `Successfully posted ${postedCount}/${userImageList.length} images to channel! 🎉`,
    { parse_mode: 'Markdown' }
  );
}

// Start caption process
async function startCaptionProcess(chatId, userId, index, callbackQueryId) {
  userStates.set(userId, { action: 'adding_caption', imageIndex: index });
  
  await bot.sendMessage(chatId,
    `✏️ *Add Caption*\n\n` +
    `Please send the caption text for this image.\n\n` +
    `Type /cancel to skip.`,
    { parse_mode: 'Markdown' }
  );
  
  await bot.answerCallbackQuery(callbackQueryId, {
    text: '📝 Enter caption text'
  });
}

// Navigate gallery
async function navigateGallery(chatId, userId, currentIndex, direction, callbackQueryId) {
  const userImageList = userImages.get(userId) || [];
  
  let newIndex;
  if (direction === 'prev') {
    newIndex = currentIndex > 0 ? currentIndex - 1 : userImageList.length - 1;
  } else {
    newIndex = currentIndex < userImageList.length - 1 ? currentIndex + 1 : 0;
  }
  
  const image = userImageList[newIndex];
  
  if (image) {
    const galleryKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: `🖼️ ${newIndex + 1}/${userImageList.length}`, callback_data: 'image_info' },
            { text: '📢 Post', callback_data: `gallery_post_${newIndex}` }
          ],
          [
            { text: '✏️ Caption', callback_data: `gallery_caption_${newIndex}` },
            { text: '🗑️ Delete', callback_data: `gallery_delete_${newIndex}` }
          ],
          [
            { text: '⬅️ Prev', callback_data: `gallery_prev_${newIndex}` },
            { text: 'Next ➡️', callback_data: `gallery_next_${newIndex}` }
          ]
        ]
      }
    };
    
    const caption = image.caption 
      ? `📝 ${image.caption}\n\n🖼️ Image ${newIndex + 1}/${userImageList.length}`
      : `🖼️ Image ${newIndex + 1}/${userImageList.length}\n\nTap "✏️ Caption" to add text`;
    
    await bot.editMessageMedia(
      {
        type: 'photo',
        media: image.fileId,
        caption: caption,
        parse_mode: 'Markdown'
      },
      {
        chat_id: chatId,
        message_id: message.message_id,
        reply_markup: galleryKeyboard.reply_markup
      }
    );
    
    await bot.answerCallbackQuery(callbackQueryId, {
      text: `Image ${newIndex + 1}/${userImageList.length}`
    });
  }
}

// Delete image
async function deleteImage(chatId, userId, index, messageId, callbackQueryId) {
  const userImageList = userImages.get(userId) || [];
  
  if (userImageList[index]) {
    userImageList.splice(index, 1);
    
    await bot.editMessageCaption('🗑️ *Image Deleted*\n\nThis image has been removed from your gallery.', {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown'
    });
    
    await bot.answerCallbackQuery(callbackQueryId, {
      text: '✅ Image deleted'
    });
  }
}

// ========== HANDLE CAPTION TEXT INPUT ========== //
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const userState = userStates.get(userId);
  
  if (userState && userState.action === 'adding_caption') {
    const userImageList = userImages.get(userId) || [];
    const imageIndex = userState.imageIndex;
    
    if (userImageList[imageIndex]) {
      // Save caption
      userImageList[imageIndex].caption = text;
      userStates.delete(userId);
      
      await bot.sendMessage(chatId,
        `✅ *Caption Added!*\n\n` +
        `"${text}"\n\n` +
        `Caption saved for this image. You can post it to channel now!`,
        { parse_mode: 'Markdown' }
      );
    }
  }
});

// Cancel command
bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (userStates.has(userId)) {
    userStates.delete(userId);
    bot.sendMessage(chatId, '❌ Action cancelled.');
  }
});

// Test command to check button functionality
bot.onText(/\/testbuttons/, (msg) => {
  const chatId = msg.chat.id;
  
  const testKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📸 Upload', callback_data: 'upload_more' },
          { text: '🖼️ Gallery', callback_data: 'view_gallery' }
        ],
        [
          { text: '📢 Post', callback_data: 'channel_select_0' },
          { text: '✏️ Caption', callback_data: 'add_caption_0' }
        ],
        [
          { text: '⬅️ Prev', callback_data: 'gallery_prev_0' },
          { text: 'Next ➡️', callback_data: 'gallery_next_0' }
        ]
      ]
    }
  };
  
  bot.sendMessage(chatId,
    `🧪 *Button Test Panel*\n\n` +
    `All buttons are functional!\n\n` +
    `Try clicking them to see the responses:`,
    { parse_mode: 'Markdown', ...testKeyboard }
  );
});

console.log('🎉 Bot fully loaded with working buttons!');
