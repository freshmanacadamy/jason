const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(express.json());

// Configuration
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_USERNAME = '@jumarket';
const CHANNEL_ID = process.env.CHANNEL_ID || '-1001234567890';
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [];
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jimma_marketplace';

const CATEGORIES = [
  '📚 Academic Books',
  '💻 Electronics', 
  '👕 Clothes & Fashion',
  '🏠 Furniture & Home',
  '📝 Study Materials',
  '🎮 Entertainment',
  '🍔 Food & Drinks',
  '🚗 Transportation',
  '🎒 Accessories',
  '❓ Others'
];

// MongoDB Schemas
const userSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  username: String,
  firstName: String,
  lastName: String,
  phone: String,
  department: String,
  year: String,
  joinedChannel: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const productSchema = new mongoose.Schema({
  sellerId: { type: Number, required: true },
  sellerUsername: String,
  title: { type: String, required: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true },
  category: { type: String, required: true },
  condition: { type: String, default: 'Used' },
  images: [String],
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'sold'], default: 'pending' },
  approvedBy: Number,
  channelMessageId: Number,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Product = mongoose.model('Product', productSchema);

// Initialize bot and express
if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN environment variable is not set!');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

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

// Utility functions
const checkChannelMembership = async (userId) => {
  try {
    const member = await bot.getChatMember(CHANNEL_ID, userId);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (error) {
    console.error('Error checking channel membership:', error);
    return false;
  }
};

const generateProductCaption = (product) => {
  return `🏷️ *${product.title}*

💰 *Price:* ${product.price} ETB
📦 *Condition:* ${product.condition}
👤 *Seller:* ${product.sellerUsername || 'Student'}

${product.description ? `📝 *Description:*\n${product.description}` : '📝 *No description provided*'}

#${product.category.replace(/[^a-zA-Z0-9]/g, '')}`;
};

const postToChannel = async (product) => {
  try {
    const caption = generateProductCaption(product);
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'SEE DETAILS 👀', callback_data: `view_${product._id}` },
            { text: 'BUY NOW 🛒', callback_data: `buy_${product._id}` }
          ],
          [
            { text: 'CONTACT SELLER 📞', callback_data: `contact_${product._id}` }
          ]
        ]
      }
    };

    const message = await bot.sendPhoto(CHANNEL_ID, product.images[0], {
      caption: caption,
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });

    return message.message_id;
  } catch (error) {
    console.error('Error posting to channel:', error);
    return null;
  }
};

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
    `Choose an option below:\n` +
    `• ➕ Add Product - List your item for sale\n` +
    `• 🛍️ Browse Products - View available items\n` +
    `• 📋 My Products - Manage your listings\n` +
    `• ℹ️ Help - Get assistance`,
    { parse_mode: 'Markdown', ...options }
  );
};

// ========== COMMAND HANDLERS ========== //

// Start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  try {
    let user = await User.findOne({ telegramId: userId });
    if (!user) {
      user = new User({
        telegramId: userId,
        username: msg.from.username,
        firstName: msg.from.first_name,
        lastName: msg.from.last_name
      });
      await user.save();
    }

    const isMember = await checkChannelMembership(userId);
    if (!isMember) {
      const joinKeyboard = {
        reply_markup: {
          inline_keyboard: [[
            { text: 'Join Channel 📢', url: `https://t.me/${CHANNEL_USERNAME.replace('@', '')}` },
            { text: '✅ I Joined', callback_data: 'check_membership' }
          ]]
        }
      };
      await bot.sendMessage(chatId, 
        `👋 Welcome to Jimma University Marketplace!\n\n` +
        `To use this bot, please join our official channel first:\n${CHANNEL_USERNAME}\n\n` +
        `After joining, click "✅ I Joined" below.`,
        joinKeyboard
      );
      return;
    }

    user.joinedChannel = true;
    await user.save();
    showMainMenu(chatId);
    
  } catch (error) {
    console.error('Error in /start:', error);
    bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
  }
});

// Add product command
bot.onText(/\/addproduct|➕ Add Product/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const isMember = await checkChannelMembership(userId);
    if (!isMember) {
      bot.sendMessage(chatId, '❌ Please join our channel first using /start');
      return;
    }

    userStates.set(userId, { state: 'awaiting_images' });
    bot.sendMessage(chatId, 
      `📸 *Add Product - Step 1/4*\n\n` +
      `Please send up to 5 photos of your product.\n\n` +
      `You can send multiple images at once.`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error starting product addition:', error);
    bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
  }
});

// Handle messages and photos
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  const photos = msg.photo;

  if (text && text.startsWith('/')) return;

  const userState = userStates.get(userId);

  try {
    if (userState) {
      switch (userState.state) {
        case 'awaiting_images':
          if (photos) {
            const fileId = photos[photos.length - 1].file_id;
            if (!userState.images) userState.images = [];
            userState.images.push(fileId);
            userState.state = 'awaiting_more_images';
            
            if (userState.images.length >= 5) {
              userState.state = 'awaiting_title';
              bot.sendMessage(chatId, 
                `✅ ${userState.images.length} images received!\n\n` +
                `🏷️ *Step 2/4 - Product Title*\n\n` +
                `Enter a clear title for your product:`,
                { parse_mode: 'Markdown' }
              );
            } else {
              bot.sendMessage(chatId, 
                `✅ Image ${userState.images.length} received! You can send more images (max 5) or type "next" to continue.`
              );
            }
          } else if (text && text.toLowerCase() === 'next' && userState.images && userState.images.length > 0) {
            userState.state = 'awaiting_title';
            bot.sendMessage(chatId, 
              `🏷️ *Step 2/4 - Product Title*\n\n` +
              `Enter a clear title for your product:`,
              { parse_mode: 'Markdown' }
            );
          } else {
            bot.sendMessage(chatId, '❌ Please send at least one product image first.');
          }
          break;

        case 'awaiting_more_images':
          if (photos) {
            const fileId = photos[photos.length - 1].file_id;
            userState.images.push(fileId);
            
            if (userState.images.length >= 5) {
              userState.state = 'awaiting_title';
              bot.sendMessage(chatId, 
                `✅ ${userState.images.length} images received!\n\n` +
                `🏷️ *Step 2/4 - Product Title*\n\n` +
                `Enter a clear title for your product:`,
                { parse_mode: 'Markdown' }
              );
            } else {
              bot.sendMessage(chatId, 
                `✅ Image ${userState.images.length} received! You can send more images (max 5) or type "next" to continue.`
              );
            }
          } else if (text && text.toLowerCase() === 'next') {
            userState.state = 'awaiting_title';
            bot.sendMessage(chatId, 
              `🏷️ *Step 2/4 - Product Title*\n\n` +
              `Enter a clear title for your product:`,
              { parse_mode: 'Markdown' }
            );
          }
          break;

        case 'awaiting_title':
          if (text) {
            userState.title = text;
            userState.state = 'awaiting_price';
            bot.sendMessage(chatId, 
              `💰 *Step 3/4 - Product Price*\n\n` +
              `Enter the price in ETB:\n\n` +
              `Example: 1500`,
              { parse_mode: 'Markdown' }
            );
          }
          break;

        case 'awaiting_price':
          if (text && !isNaN(text) && parseInt(text) > 0) {
            userState.price = parseInt(text);
            userState.state = 'awaiting_description';
            bot.sendMessage(chatId, 
              `📝 *Step 4/4 - Product Description*\n\n` +
              `Add a description (optional):\n\n` +
              `• Condition\n• Features\n• Reason for selling\n\n` +
              `Type /skip to skip description`,
              { parse_mode: 'Markdown' }
            );
          } else {
            bot.sendMessage(chatId, '❌ Please enter a valid price (numbers only).');
          }
          break;

        case 'awaiting_description':
          if (text === '/skip') {
            userState.description = '';
            await completeProductAddition(userId, chatId, userState);
          } else if (text) {
            userState.description = text;
            await completeProductAddition(userId, chatId, userState);
          }
          break;
      }
      userStates.set(userId, userState);
    }
  } catch (error) {
    console.error('Error handling message:', error);
    bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
  }
});

// Complete product addition
const completeProductAddition = async (userId, chatId, userState) => {
  try {
    // Show category selection
    const categoryKeyboard = {
      reply_markup: {
        inline_keyboard: CATEGORIES.map(category => [
          { text: category, callback_data: `category_${category}` }
        ])
      }
    };

    userState.state = 'awaiting_category';
    userStates.set(userId, userState);

    bot.sendMessage(chatId, 
      `📂 *Select Category*\n\n` +
      `Choose the most suitable category for your product:`,
      { parse_mode: 'Markdown', ...categoryKeyboard }
    );
  } catch (error) {
    console.error('Error completing product addition:', error);
    bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
  }
};

// ========== CALLBACK QUERY HANDLERS ========== //

bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;

  try {
    if (data === 'check_membership') {
      const isMember = await checkChannelMembership(userId);
      if (isMember) {
        let user = await User.findOne({ telegramId: userId });
        if (!user) {
          user = new User({
            telegramId: userId,
            username: callbackQuery.from.username,
            firstName: callbackQuery.from.first_name,
            lastName: callbackQuery.from.last_name,
            joinedChannel: true
          });
          await user.save();
        } else {
          user.joinedChannel = true;
          await user.save();
        }
        
        await bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Membership verified!' });
        showMainMenu(chatId);
      } else {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Please join the channel first' });
      }
      return;
    }

    if (data.startsWith('category_')) {
      const category = data.replace('category_', '');
      const userState = userStates.get(userId);
      
      if (userState && userState.state === 'awaiting_category') {
        // Create product in database
        const product = new Product({
          sellerId: userId,
          sellerUsername: callbackQuery.from.username,
          title: userState.title,
          description: userState.description || '',
          price: userState.price,
          category: category,
          images: userState.images,
          status: 'pending'
        });

        await product.save();
        userStates.delete(userId);

        // Notify admins
        for (const adminId of ADMIN_IDS) {
          try {
            const approveKeyboard = {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✅ Approve', callback_data: `approve_${product._id}` },
                    { text: '❌ Reject', callback_data: `reject_${product._id}` }
                  ],
                  [
                    { text: '👀 View Details', callback_data: `admindetail_${product._id}` }
                  ]
                ]
              }
            };

            await bot.sendMessage(adminId,
              `🆕 *New Product for Approval*\n\n` +
              `🏷️ Title: ${product.title}\n` +
              `💰 Price: ${product.price} ETB\n` +
              `📂 Category: ${product.category}\n` +
              `👤 Seller: @${product.sellerUsername || 'Unknown'}\n` +
              `📝 Description: ${product.description || 'None'}`,
              { parse_mode: 'Markdown', ...approveKeyboard }
            );
          } catch (error) {
            console.error('Error notifying admin:', error);
          }
        }

        await bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Product submitted for admin approval!' });
        await bot.sendMessage(chatId,
          `✅ *Product Submitted Successfully!*\n\n` +
          `Your product "${product.title}" has been submitted for admin approval.\n\n` +
          `You will be notified once it's approved and listed in the channel.`,
          { parse_mode: 'Markdown' }
        );
        showMainMenu(chatId);
      }
      return;
    }

    if (data.startsWith('view_')) {
      const productId = data.replace('view_', '');
      const product = await Product.findById(productId);
      
      if (product) {
        let details = `🔍 *Product Details*\n\n` +
          `🏷️ *Title:* ${product.title}\n` +
          `💰 *Price:* ${product.price} ETB\n` +
          `📂 *Category:* ${product.category}\n` +
          `📦 *Condition:* ${product.condition}\n` +
          `👤 *Seller:* @${product.sellerUsername || 'Student'}\n\n`;
        
        if (product.description) {
          details += `📝 *Description:*\n${product.description}\n\n`;
        }
        
        details += `🕒 *Posted:* ${new Date(product.createdAt).toLocaleDateString()}`;

        const actionKeyboard = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🛒 BUY NOW', callback_data: `buy_${product._id}` },
                { text: '📞 CONTACT SELLER', callback_data: `contact_${product._id}` }
              ]
            ]
          }
        };

        // Send first image with details
        await bot.sendPhoto(chatId, product.images[0], {
          caption: details,
          parse_mode: 'Markdown',
          reply_markup: actionKeyboard.reply_markup
        });

        await bot.answerCallbackQuery(callbackQuery.id, { text: '📦 Product details loaded' });
      } else {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Product not found' });
      }
      return;
    }

    if (data.startsWith('buy_')) {
      const productId = data.replace('buy_', '');
      const product = await Product.findById(productId);
      const buyer = callbackQuery.from;
      
      if (product && product.status === 'approved') {
        const seller = await User.findOne({ telegramId: product.sellerId });
        
        // Notify buyer
        await bot.sendMessage(chatId,
          `🛒 *Purchase Request Sent!*\n\n` +
          `📦 *Product:* ${product.title}\n` +
          `💰 *Price:* ${product.price} ETB\n` +
          `👤 *Seller:* @${product.sellerUsername}\n\n` +
          `I've notified the seller. They will contact you shortly.\n\n` +
          `💬 *Start Chat:* https://t.me/${product.sellerUsername}\n` +
          `⏰ *Expected response:* Within 24 hours`,
          { parse_mode: 'Markdown' }
        );

        // Notify seller
        await bot.sendMessage(product.sellerId,
          `🎉 *NEW PURCHASE REQUEST!*\n\n` +
          `📦 *Your Product:* ${product.title}\n` +
          `💰 *Price:* ${product.price} ETB\n` +
          `👤 *Buyer:* ${buyer.first_name} @${buyer.username}\n` +
          `📱 *Buyer ID:* ${buyer.id}\n\n` +
          `💬 *Chat with buyer:* https://t.me/${buyer.username}\n\n` +
          `📍 Arrange meetup on campus\n` +
          `💵 Discuss payment method`,
          { parse_mode: 'Markdown' }
        );

        await bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Seller notified!' });
      } else {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Product not available' });
      }
      return;
    }

    if (data.startsWith('contact_')) {
      const productId = data.replace('contact_', '');
      const product = await Product.findById(productId);
      
      if (product && product.status === 'approved') {
        await bot.sendMessage(chatId,
          `📞 *Seller Contact Information*\n\n` +
          `👤 *Seller:* @${product.sellerUsername}\n` +
          `📦 *Product:* ${product.title}\n` +
          `💰 *Price:* ${product.price} ETB\n\n` +
          `💬 *Direct Message:* https://t.me/${product.sellerUsername}\n\n` +
          `Send them a message to inquire about the product!`,
          { parse_mode: 'Markdown' }
        );

        await bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Contact info sent' });
      } else {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Product not available' });
      }
      return;
    }

    // Admin actions
    if (data.startsWith('approve_')) {
      if (!ADMIN_IDS.includes(userId)) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Admin access required' });
        return;
      }

      const productId = data.replace('approve_', '');
      const product = await Product.findById(productId);
      
      if (product && product.status === 'pending') {
        product.status = 'approved';
        product.approvedBy = userId;
        
        // Post to channel
        const messageId = await postToChannel(product);
        if (messageId) {
          product.channelMessageId = messageId;
        }
        
        await product.save();

        // Notify seller
        await bot.sendMessage(product.sellerId,
          `✅ *Your Product Has Been Approved!*\n\n` +
          `🏷️ *Product:* ${product.title}\n` +
          `💰 *Price:* ${product.price} ETB\n\n` +
          `Your product is now live in the channel! 🎉\n\n` +
          `View channel: ${CHANNEL_USERNAME}`,
          { parse_mode: 'Markdown' }
        );

        await bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Product approved and posted!' });
        await bot.editMessageText(`✅ Approved: ${product.title}`, {
          chat_id: message.chat.id,
          message_id: message.message_id
        });
      }
      return;
    }

    if (data.startsWith('reject_')) {
      if (!ADMIN_IDS.includes(userId)) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Admin access required' });
        return;
      }

      const productId = data.replace('reject_', '');
      const product = await Product.findById(productId);
      
      if (product && product.status === 'pending') {
        product.status = 'rejected';
        product.approvedBy = userId;
        await product.save();

        // Notify seller
        await bot.sendMessage(product.sellerId,
          `❌ *Product Rejected*\n\n` +
          `🏷️ *Product:* ${product.title}\n\n` +
          `Your product submission was rejected by admin.\n\n` +
          `Possible reasons:\n` +
          `• Poor quality images\n` +
          `• Inappropriate content\n` +
          `• Missing information\n\n` +
          `You can submit again with better details.`,
          { parse_mode: 'Markdown' }
        );

        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Product rejected' });
        await bot.editMessageText(`❌ Rejected: ${product.title}`, {
          chat_id: message.chat.id,
          message_id: message.message_id
        });
      }
      return;
    }

  } catch (error) {
    console.error('Error handling callback:', error);
    await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ An error occurred' });
  }
});

// Browse products command
bot.onText(/\/browse|🛍️ Browse Products/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const approvedProducts = await Product.find({ status: 'approved' })
      .sort({ createdAt: -1 })
      .limit(10);

    if (approvedProducts.length === 0) {
      bot.sendMessage(chatId, 
        `🛍️ *Browse Products*\n\n` +
        `No products available at the moment.\n\n` +
        `Be the first to list something! Use "➕ Add Product"`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    let message = `🛍️ *Recently Added Products*\n\n`;
    
    approvedProducts.forEach((product, index) => {
      message += `${index + 1}. *${product.title}* - ${product.price} ETB\n`;
      message += `   📂 ${product.category}\n`;
      message += `   👤 @${product.sellerUsername || 'Student'}\n\n`;
    });

    message += `View all products in our channel: ${CHANNEL_USERNAME}`;

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Error browsing products:', error);
    bot.sendMessage(chatId, '❌ An error occurred while loading products.');
  }
});

// My products command
bot.onText(/\/myproducts|📋 My Products/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  try {
    const myProducts = await Product.find({ sellerId: userId })
      .sort({ createdAt: -1 });

    if (myProducts.length === 0) {
      bot.sendMessage(chatId, 
        `📋 *My Products*\n\n` +
        `You haven't listed any products yet.\n\n` +
        `Use "➕ Add Product" to list your first item!`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    let message = `📋 *Your Products*\n\n`;
    
    myProducts.forEach((product, index) => {
      const statusIcon = product.status === 'approved' ? '✅' : 
                        product.status === 'pending' ? '⏳' : 
                        product.status === 'rejected' ? '❌' : '✅';
      
      message += `${index + 1}. ${statusIcon} *${product.title}*\n`;
      message += `   💰 ${product.price} ETB | 📂 ${product.category}\n`;
      message += `   🏷️ Status: ${product.status.charAt(0).toUpperCase() + product.status.slice(1)}\n\n`;
    });

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Error loading user products:', error);
    bot.sendMessage(chatId, '❌ An error occurred while loading your products.');
  }
});

// Help command
bot.onText(/\/help|ℹ️ Help/, async (msg) => {
  const chatId = msg.chat.id;
  
  bot.sendMessage(chatId,
    `ℹ️ *Jimma University Marketplace Help*\n\n` +
    `*How to Sell:*\n` +
    `1. Use "➕ Add Product"\n` +
    `2. Send product photos\n` +
    `3. Add title, price, and description\n` +
    `4. Wait for admin approval\n` +
    `5. Your product goes live in channel\n\n` +
    `*How to Buy:*\n` +
    `1. Browse products in ${CHANNEL_USERNAME}\n` +
    `2. Click "BUY NOW" or "CONTACT SELLER"\n` +
    `3. Arrange meetup with seller\n` +
    `4. Complete transaction on campus\n\n` +
    `*Safety Tips:*\n` +
    `• Meet in public campus areas\n` +
    `• Verify product condition\n` +
    `• Use cash transactions\n` +
    `• Report issues to admin\n\n` +
    `*Commands:*\n` +
    `/start - Start the bot\n` +
    `/addproduct - List new product\n` +
    `/browse - View products\n` +
    `/myproducts - Your listings\n` +
    `/help - This message\n\n` +
    `Need help? Contact admins.`,
    { parse_mode: 'Markdown' }
  );
});

// Error handling
bot.on('error', (error) => {
  console.error('❌ Bot error:', error);
});

bot.on('polling_error', (error) => {
  console.error('❌ Polling error:', error);
});

console.log('🎉 Marketplace bot is fully operational!');
