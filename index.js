const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
require('dotenv').config();

const app = express();
app.use(express.json());

// Configuration - UPDATE THESE!
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const CHANNEL_USERNAME = '@jumarket';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'YOUR_USERNAME_HERE';

// In-memory storage (replace with database later)
let users = new Map();
let products = new Map();
let productIdCounter = 1;

// Initialize bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Express server for Render
app.get('/', (req, res) => {
  res.send('🤖 Jimma University Marketplace Bot is alive!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

console.log('✅ Bot started successfully!');

// User states for conversation flow
const userStates = new Map();

// Show main menu
const showMainMenu = (chatId) => {
  const options = {
    reply_markup: {
      keyboard: [
        [{ text: '➕ Add Product' }, { text: '🛍️ Browse Products' }],
        [{ text: '📋 My Products' }, { text: 'ℹ️ Help' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
  
  bot.sendMessage(chatId, 
    `🏪 *Welcome to Jimma University Marketplace!*\n\n` +
    `Choose an option below:`,
    { parse_mode: 'Markdown', ...options }
  );
};

// ========== START COMMAND ========== //
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  try {
    // Store user info
    users.set(userId, {
      telegramId: userId,
      username: msg.from.username,
      firstName: msg.from.first_name,
      lastName: msg.from.last_name,
      joinedChannel: true // Skip channel check for now
    });

    showMainMenu(chatId);
    
  } catch (error) {
    console.error('Error in /start:', error);
    bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
  }
});

// ========== ADD PRODUCT ========== //
bot.onText(/\/addproduct|➕ Add Product/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    userStates.set(userId, { 
      state: 'awaiting_images',
      productData: {}
    });
    
    bot.sendMessage(chatId, 
      `📸 *Add Product - Step 1/3*\n\n` +
      `Please send a photo of your product:`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error starting product addition:', error);
    bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
  }
});

// Handle photos
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const photo = msg.photo[msg.photo.length - 1];

  const userState = userStates.get(userId);
  
  if (userState && userState.state === 'awaiting_images') {
    try {
      userState.productData.image = photo.file_id;
      userState.state = 'awaiting_title';
      userStates.set(userId, userState);

      bot.sendMessage(chatId, 
        `✅ Photo received!\n\n` +
        `🏷️ *Step 2/3 - Product Title*\n\n` +
        `Enter a title for your product:`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error('Error handling photo:', error);
      bot.sendMessage(chatId, '❌ Error processing photo. Please try again.');
    }
  }
});

// Handle text messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  if (!text || text.startsWith('/')) return;

  const userState = userStates.get(userId);

  try {
    if (userState) {
      switch (userState.state) {
        case 'awaiting_title':
          userState.productData.title = text;
          userState.state = 'awaiting_price';
          userStates.set(userId, userState);

          bot.sendMessage(chatId, 
            `💰 *Step 3/3 - Product Price*\n\n` +
            `Enter the price in ETB:\n\n` +
            `Example: 1500`,
            { parse_mode: 'Markdown' }
          );
          break;

        case 'awaiting_price':
          if (!isNaN(text) && parseInt(text) > 0) {
            userState.productData.price = parseInt(text);
            userState.productData.sellerId = userId;
            userState.productData.sellerUsername = msg.from.username;
            userState.productData.status = 'approved'; // Auto-approve for now
            
            // Save product
            const productId = productIdCounter++;
            products.set(productId, { ...userState.productData, id: productId });
            userStates.delete(userId);

            // Show success message
            bot.sendMessage(chatId,
              `✅ *Product Added Successfully!*\n\n` +
              `🏷️ *Title:* ${userState.productData.title}\n` +
              `💰 *Price:* ${userState.productData.price} ETB\n\n` +
              `Your product is now live! 🎉`,
              { parse_mode: 'Markdown' }
            );

            showMainMenu(chatId);
          } else {
            bot.sendMessage(chatId, '❌ Please enter a valid price (numbers only).');
          }
          break;
      }
    }
  } catch (error) {
    console.error('Error handling message:', error);
    bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
  }
});

// ========== BROWSE PRODUCTS ========== //
bot.onText(/\/browse|🛍️ Browse Products/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    if (products.size === 0) {
      bot.sendMessage(chatId, 
        `🛍️ *Browse Products*\n\n` +
        `No products available yet.\n\n` +
        `Be the first to list something!`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    let message = `🛍️ *Available Products*\n\n`;
    
    products.forEach((product, id) => {
      if (product.status === 'approved') {
        message += `🏷️ *${product.title}*\n`;
        message += `💰 ${product.price} ETB\n`;
        message += `👤 @${product.sellerUsername || 'Student'}\n\n`;
      }
    });

    // Send product images with details
    products.forEach((product, id) => {
      if (product.status === 'approved') {
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🛒 BUY NOW', callback_data: `buy_${id}` },
                { text: '📞 CONTACT SELLER', callback_data: `contact_${id}` }
              ]
            ]
          }
        };

        bot.sendPhoto(chatId, product.image, {
          caption: `🏷️ *${product.title}*\n💰 ${product.price} ETB\n👤 @${product.sellerUsername}`,
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup
        });
      }
    });
    
  } catch (error) {
    console.error('Error browsing products:', error);
    bot.sendMessage(chatId, '❌ An error occurred while loading products.');
  }
});

// ========== CALLBACK QUERIES ========== //
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;

  try {
    if (data.startsWith('buy_')) {
      const productId = parseInt(data.replace('buy_', ''));
      const product = products.get(productId);
      const buyer = callbackQuery.from;
      
      if (product) {
        // Notify buyer
        await bot.sendMessage(chatId,
          `🛒 *Purchase Request Sent!*\n\n` +
          `📦 *Product:* ${product.title}\n` +
          `💰 *Price:* ${product.price} ETB\n` +
          `👤 *Seller:* @${product.sellerUsername}\n\n` +
          `Contact the seller directly: @${product.sellerUsername}`,
          { parse_mode: 'Markdown' }
        );

        // Notify seller
        await bot.sendMessage(product.sellerId,
          `🎉 *NEW BUYER INTERESTED!*\n\n` +
          `📦 *Your Product:* ${product.title}\n` +
          `💰 *Price:* ${product.price} ETB\n` +
          `👤 *Buyer:* ${buyer.first_name} @${buyer.username}\n\n` +
          `Please contact them to arrange the sale.`,
          { parse_mode: 'Markdown' }
        );

        await bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Seller notified!' });
      }
    }

    if (data.startsWith('contact_')) {
      const productId = parseInt(data.replace('contact_', ''));
      const product = products.get(productId);
      
      if (product) {
        await bot.sendMessage(chatId,
          `📞 *Seller Contact*\n\n` +
          `👤 *Seller:* @${product.sellerUsername}\n` +
          `📦 *Product:* ${product.title}\n` +
          `💰 *Price:* ${product.price} ETB\n\n` +
          `Send them a direct message!`,
          { parse_mode: 'Markdown' }
        );

        await bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Contact info sent' });
      }
    }

  } catch (error) {
    console.error('Error handling callback:', error);
    await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ An error occurred' });
  }
});

// ========== MY PRODUCTS ========== //
bot.onText(/\/myproducts|📋 My Products/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  try {
    let userProducts = [];
    products.forEach((product, id) => {
      if (product.sellerId === userId) {
        userProducts.push(product);
      }
    });

    if (userProducts.length === 0) {
      bot.sendMessage(chatId, 
        `📋 *My Products*\n\n` +
        `You haven't listed any products yet.\n\n` +
        `Use "➕ Add Product" to get started!`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    let message = `📋 *Your Products*\n\n`;
    
    userProducts.forEach((product, index) => {
      message += `${index + 1}. 🏷️ *${product.title}*\n`;
      message += `   💰 ${product.price} ETB\n`;
      message += `   ✅ Status: Approved\n\n`;
    });

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Error loading user products:', error);
    bot.sendMessage(chatId, '❌ An error occurred.');
  }
});

// ========== HELP COMMAND ========== //
bot.onText(/\/help|ℹ️ Help/, async (msg) => {
  const chatId = msg.chat.id;
  
  bot.sendMessage(chatId,
    `ℹ️ *Jimma University Marketplace Help*\n\n` +
    `*How to Sell:*\n` +
    `1. Use "➕ Add Product"\n` +
    `2. Send product photo\n` +
    `3. Add title and price\n` +
    `4. Your product goes live!\n\n` +
    `*How to Buy:*\n` +
    `1. Use "🛍️ Browse Products"\n` +
    `2. Click "BUY NOW" or "CONTACT SELLER"\n` +
    `3. Contact the seller directly\n\n` +
    `*Commands:*\n` +
    `/start - Start bot\n` +
    `/addproduct - List product\n` +
    `/browse - View products\n` +
    `/myproducts - Your listings\n` +
    `/help - This message`,
    { parse_mode: 'Markdown' }
  );
});

console.log('🎉 Bot is ready! Use /start to begin.');
