const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
require('dotenv').config();

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID; // @jumarket
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [];

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

app.get('/', (req, res) => {
  res.send('🤖 Jimma University Marketplace Bot is alive!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

console.log('✅ JU Marketplace Bot started!');

// ========== DATABASE (In-Memory) ========== //
const users = new Map();
const products = new Map();
const userStates = new Map();
let productIdCounter = 1;

// Categories for Jimma University
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

// ========== MAIN MENU ========== //
const showMainMenu = (chatId) => {
  const options = {
    reply_markup: {
      keyboard: [
        [{ text: '🛍️ Browse Products' }, { text: '➕ Sell Item' }],
        [{ text: '📋 My Products' }, { text: '📞 Contact Admin' }],
        [{ text: 'ℹ️ Help' }]
      ],
      resize_keyboard: true
    }
  };
  
  bot.sendMessage(chatId, 
    `🏪 *Jimma University Marketplace*\n\n` +
    `Welcome to JU Student Marketplace! 🎓\n\n` +
    `Choose an option below:`,
    { parse_mode: 'Markdown', ...options }
  );
};

// ========== START COMMAND ========== //
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username;
  
  // Register user
  if (!users.has(userId)) {
    users.set(userId, {
      telegramId: userId,
      username: username,
      firstName: msg.from.first_name,
      joinedAt: new Date(),
      department: '',
      year: ''
    });
  }
  
  await bot.sendMessage(chatId, 
    `🎓 *Welcome to Jimma University Marketplace!*\n\n` +
    `🏪 *Buy & Sell* within JU Community\n` +
    `📚 Books, Electronics, Clothes & more\n` +
    `🔒 Safe campus transactions\n` +
    `📢 All products posted in @jumarket\n\n` +
    `Start by browsing items or selling yours!`,
    { parse_mode: 'Markdown' }
  );
  
  showMainMenu(chatId);
});

// ========== BROWSE PRODUCTS ========== //
bot.onText(/\/browse|🛍️ Browse Products/, async (msg) => {
  const chatId = msg.chat.id;
  
  const approvedProducts = Array.from(products.values())
    .filter(product => product.status === 'approved')
    .slice(0, 10); // Show latest 10
  
  if (approvedProducts.length === 0) {
    await bot.sendMessage(chatId,
      `🛍️ *Browse Products*\n\n` +
      `No products available yet.\n\n` +
      `Be the first to list an item! 💫\n` +
      `Use "➕ Sell Item" to get started.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  await bot.sendMessage(chatId,
    `🛍️ *Available Products (${approvedProducts.length})*\n\n` +
    `Latest items from JU students:`,
    { parse_mode: 'Markdown' }
  );
  
  // Send each product
  for (const product of approvedProducts) {
    const seller = users.get(product.sellerId);
    
    const browseKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🛒 Buy Now', callback_data: `buy_${product.id}` },
            { text: '📞 Contact Seller', callback_data: `contact_${product.id}` }
          ],
          [
            { text: '👀 View Details', callback_data: `details_${product.id}` }
          ]
        ]
      }
    };
    
    try {
      await bot.sendPhoto(chatId, product.images[0], {
        caption: `🏷️ *${product.title}*\n\n` +
                 `💰 *Price:* ${product.price} ETB\n` +
                 `📦 *Category:* ${product.category}\n` +
                 `👤 *Seller:* ${seller?.firstName || 'JU Student'}\n` +
                 `${product.description ? `📝 *Description:* ${product.description}\n` : ''}` +
                 `\n📍 *Campus Meetup*`,
        parse_mode: 'Markdown',
        reply_markup: browseKeyboard.reply_markup
      });
    } catch (error) {
      // Fallback to text if image fails
      await bot.sendMessage(chatId,
        `🏷️ *${product.title}*\n\n` +
        `💰 *Price:* ${product.price} ETB\n` +
        `📦 *Category:* ${product.category}\n` +
        `👤 *Seller:* ${seller?.firstName || 'JU Student'}\n` +
        `${product.description ? `📝 *Description:* ${product.description}\n` : ''}`,
        { parse_mode: 'Markdown', reply_markup: browseKeyboard.reply_markup }
      );
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
  }
});

// ========== SELL ITEM ========== //
bot.onText(/\/sell|➕ Sell Item/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  userStates.set(userId, {
    state: 'awaiting_product_images',
    productData: {}
  });
  
  await bot.sendMessage(chatId,
    `🛍️ *Sell Your Item - Step 1/5*\n\n` +
    `📸 *Send Product Photos*\n\n` +
    `Please send 1-5 photos of your item.\n` +
    `You can send multiple images at once.`,
    { parse_mode: 'Markdown' }
  );
});

// Handle product photo uploads
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userState = userStates.get(userId);
  
  if (userState && userState.state === 'awaiting_product_images') {
    const photo = msg.photo[msg.photo.length - 1];
    
    if (!userState.productData.images) {
      userState.productData.images = [];
    }
    
    userState.productData.images.push(photo.file_id);
    userStates.set(userId, userState);
    
    // If first image, ask for more or continue
    if (userState.productData.images.length === 1) {
      await bot.sendMessage(chatId,
        `✅ *First photo received!*\n\n` +
        `You can send more photos (max 5) or type 'next' to continue.`,
        { parse_mode: 'Markdown' }
      );
    } else if (userState.productData.images.length >= 5) {
      userState.state = 'awaiting_product_title';
      userStates.set(userId, userState);
      
      await bot.sendMessage(chatId,
        `📸 *Photos uploaded (${userState.productData.images.length})*\n\n` +
        `🏷️ *Step 2/5 - Product Title*\n\n` +
        `Enter a clear title for your item:\n\n` +
        `Examples:\n` +
        `• "Calculus Textbook 3rd Edition"\n` +
        `• "iPhone 12 - 128GB - Like New"\n` +
        `• "Engineering Calculator FX-991ES"`,
        { parse_mode: 'Markdown' }
      );
    }
  }
});

// Handle text messages for product creation
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  const userState = userStates.get(userId);
  
  if (!text || text.startsWith('/')) return;
  
  if (userState) {
    try {
      switch (userState.state) {
        case 'awaiting_product_images':
          if (text.toLowerCase() === 'next' && userState.productData.images && userState.productData.images.length > 0) {
            userState.state = 'awaiting_product_title';
            userStates.set(userId, userState);
            
            await bot.sendMessage(chatId,
              `🏷️ *Step 2/5 - Product Title*\n\n` +
              `Enter a clear title for your item:`,
              { parse_mode: 'Markdown' }
            );
          }
          break;
          
        case 'awaiting_product_title':
          userState.productData.title = text;
          userState.state = 'awaiting_product_price';
          userStates.set(userId, userState);
          
          await bot.sendMessage(chatId,
            `💰 *Step 3/5 - Product Price*\n\n` +
            `Enter the price in ETB:\n\n` +
            `Example: 1500`,
            { parse_mode: 'Markdown' }
          );
          break;
          
        case 'awaiting_product_price':
          if (!isNaN(text) && parseInt(text) > 0) {
            userState.productData.price = parseInt(text);
            userState.state = 'awaiting_product_description';
            userStates.set(userId, userState);
            
            await bot.sendMessage(chatId,
              `📝 *Step 4/5 - Product Description*\n\n` +
              `Add a description (optional):\n\n` +
              `• Condition (New/Used)\n` +
              `• Features\n` +
              `• Reason for selling\n\n` +
              `Type /skip to skip description`,
              { parse_mode: 'Markdown' }
            );
          } else {
            await bot.sendMessage(chatId, '❌ Please enter a valid price (numbers only).');
          }
          break;
          
        case 'awaiting_product_description':
          if (text === '/skip') {
            userState.productData.description = '';
            await selectProductCategory(chatId, userId, userState);
          } else {
            userState.productData.description = text;
            await selectProductCategory(chatId, userId, userState);
          }
          break;
      }
    } catch (error) {
      console.error('Product creation error:', error);
      await bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
    }
  }
});

// Category selection
async function selectProductCategory(chatId, userId, userState) {
  const categoryKeyboard = {
    reply_markup: {
      inline_keyboard: [
        ...CATEGORIES.map(category => [
          { text: category, callback_data: `category_${category}` }
        ]),
        [
          { text: '🚫 Cancel', callback_data: 'cancel_product' }
        ]
      ]
    }
  };
  
  userState.state = 'awaiting_product_category';
  userStates.set(userId, userState);
  
  await bot.sendMessage(chatId,
    `📂 *Step 5/5 - Select Category*\n\n` +
    `Choose the category that best fits your item:`,
    { parse_mode: 'Markdown', ...categoryKeyboard }
  );
}

// ========== MY PRODUCTS ========== //
bot.onText(/\/myproducts|📋 My Products/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  const userProducts = Array.from(products.values())
    .filter(product => product.sellerId === userId);
  
  if (userProducts.length === 0) {
    await bot.sendMessage(chatId,
      `📋 *My Products*\n\n` +
      `You haven't listed any products yet.\n\n` +
      `Start selling with "➕ Sell Item"! 💫`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  let message = `📋 *Your Products (${userProducts.length})*\n\n`;
  
  userProducts.forEach((product, index) => {
    const statusIcon = 
      product.status === 'approved' ? '✅' :
      product.status === 'pending' ? '⏳' :
      product.status === 'sold' ? '💰' : '❌';
    
    message += `${index + 1}. ${statusIcon} *${product.title}*\n`;
    message += `   💰 ${product.price} ETB | ${product.category}\n`;
    message += `   🏷️ ${product.status.charAt(0).toUpperCase() + product.status.slice(1)}\n\n`;
  });
  
  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// ========== CALLBACK QUERIES ========== //
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;
  
  try {
    // Product category selection
    if (data.startsWith('category_')) {
      const category = data.replace('category_', '');
      const userState = userStates.get(userId);
      
      if (userState && userState.state === 'awaiting_product_category') {
        await completeProductCreation(chatId, userId, userState, category, callbackQuery.id);
      }
      return;
    }
    
    // Buy product
    if (data.startsWith('buy_')) {
      const productId = parseInt(data.replace('buy_', ''));
      await handleBuyProduct(chatId, userId, productId, callbackQuery.id);
      return;
    }
    
    // Contact seller
    if (data.startsWith('contact_')) {
      const productId = parseInt(data.replace('contact_', ''));
      await handleContactSeller(chatId, userId, productId, callbackQuery.id);
      return;
    }
    
    // View details
    if (data.startsWith('details_')) {
      const productId = parseInt(data.replace('details_', ''));
      await handleViewDetails(chatId, productId, callbackQuery.id);
      return;
    }
    
    // Cancel product creation
    if (data === 'cancel_product') {
      userStates.delete(userId);
      await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Product creation cancelled' });
      await bot.sendMessage(chatId, 'Product creation cancelled.');
      return;
    }
    
  } catch (error) {
    console.error('Callback error:', error);
    await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Error processing request' });
  }
});

// Complete product creation
async function completeProductCreation(chatId, userId, userState, category, callbackQueryId) {
  const user = users.get(userId);
  
  // Create product
  const product = {
    id: productIdCounter++,
    sellerId: userId,
    sellerUsername: user.username,
    title: userState.productData.title,
    description: userState.productData.description || '',
    price: userState.productData.price,
    category: category,
    images: userState.productData.images,
    status: 'pending', // Needs admin approval
    createdAt: new Date(),
    approvedBy: null
  };
  
  products.set(product.id, product);
  userStates.delete(userId);
  
  // Notify admins
  for (const adminId of ADMIN_IDS) {
    try {
      const approveKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Approve', callback_data: `approve_${product.id}` },
              { text: '❌ Reject', callback_data: `reject_${product.id}` }
            ]
          ]
        }
      };
      
      await bot.sendMessage(adminId,
        `🆕 *New Product for Approval*\n\n` +
        `🏷️ *Title:* ${product.title}\n` +
        `💰 *Price:* ${product.price} ETB\n` +
        `📂 *Category:* ${product.category}\n` +
        `👤 *Seller:* @${product.sellerUsername || 'JU Student'}\n` +
        `${product.description ? `📝 *Description:* ${product.description}\n` : ''}` +
        `\nPlease review and approve:`,
        { parse_mode: 'Markdown', ...approveKeyboard }
      );
    } catch (error) {
      console.error('Error notifying admin:', error);
    }
  }
  
  await bot.answerCallbackQuery(callbackQueryId, { 
    text: '✅ Product submitted for admin approval!' 
  });
  
  await bot.sendMessage(chatId,
    `✅ *Product Submitted Successfully!*\n\n` +
    `🏷️ *${product.title}*\n` +
    `💰 ${product.price} ETB | ${product.category}\n\n` +
    `⏳ *Status:* Waiting for admin approval\n\n` +
    `Your product will appear in @jumarket after approval.`,
    { parse_mode: 'Markdown' }
  );
  
  showMainMenu(chatId);
}

// Handle buy product
async function handleBuyProduct(chatId, userId, productId, callbackQueryId) {
  const product = products.get(productId);
  const buyer = users.get(userId);
  const seller = users.get(product.sellerId);
  
  if (!product || product.status !== 'approved') {
    await bot.answerCallbackQuery(callbackQueryId, { text: '❌ Product not available' });
    return;
  }
  
  // Notify buyer
  await bot.sendMessage(chatId,
    `🛒 *Purchase Request Sent!*\n\n` +
    `🏷️ *Product:* ${product.title}\n` +
    `💰 *Price:* ${product.price} ETB\n` +
    `👤 *Seller:* ${seller.firstName}\n\n` +
    `I've notified the seller about your interest!\n\n` +
    `💬 *Contact Seller:* @${seller.username || 'JU Student'}\n` +
    `📍 *Meetup:* Arrange campus location\n` +
    `💵 *Payment:* Cash recommended\n\n` +
    `The seller will contact you shortly!`,
    { parse_mode: 'Markdown' }
  );
  
  // Notify seller
  if (seller.telegramId) {
    await bot.sendMessage(seller.telegramId,
      `🎉 *NEW BUYER INTERESTED!*\n\n` +
      `🏷️ *Your Product:* ${product.title}\n` +
      `💰 *Price:* ${product.price} ETB\n` +
      `👤 *Buyer:* ${buyer.firstName} @${buyer.username}\n\n` +
      `💬 *Contact Buyer:* @${buyer.username}\n\n` +
      `Please arrange:\n` +
      `• Campus meetup location\n` +
      `• Payment method\n` +
      `• Product handover\n\n` +
      `Happy selling! 🎓`,
      { parse_mode: 'Markdown' }
    );
  }
  
  await bot.answerCallbackQuery(callbackQueryId, { 
    text: '✅ Seller notified! Check your messages.' 
  });
}

// Handle contact seller
async function handleContactSeller(chatId, userId, productId, callbackQueryId) {
  const product = products.get(productId);
  const seller = users.get(product.sellerId);
  
  if (!product || product.status !== 'approved') {
    await bot.answerCallbackQuery(callbackQueryId, { text: '❌ Product not available' });
    return;
  }
  
  await bot.sendMessage(chatId,
    `📞 *Seller Contact Information*\n\n` +
    `👤 *Seller:* ${seller.firstName}\n` +
    `🏷️ *Product:* ${product.title}\n` +
    `💰 *Price:* ${product.price} ETB\n\n` +
    `💬 *Direct Message:* @${seller.username || 'JU Student'}\n\n` +
    `Send them a message to inquire about the product!\n\n` +
    `📍 *Campus meetup recommended*`,
    { parse_mode: 'Markdown' }
  );
  
  await bot.answerCallbackQuery(callbackQueryId, { 
    text: '✅ Contact info sent' 
  });
}

// Handle view details
async function handleViewDetails(chatId, productId, callbackQueryId) {
  const product = products.get(productId);
  
  if (!product) {
    await bot.answerCallbackQuery(callbackQueryId, { text: '❌ Product not found' });
    return;
  }
  
  const seller = users.get(product.sellerId);
  
  await bot.sendMessage(chatId,
    `🔍 *Product Details*\n\n` +
    `🏷️ *Title:* ${product.title}\n` +
    `💰 *Price:* ${product.price} ETB\n` +
    `📂 *Category:* ${product.category}\n` +
    `👤 *Seller:* ${seller.firstName}\n` +
    `📅 *Posted:* ${product.createdAt.toLocaleDateString()}\n\n` +
    `${product.description ? `📝 *Description:*\n${product.description}\n\n` : ''}` +
    `📍 *Campus transaction recommended*`,
    { parse_mode: 'Markdown' }
  );
  
  await bot.answerCallbackQuery(callbackQueryId, { 
    text: '📦 Product details sent' 
  });
}

// ========== ADMIN APPROVAL SYSTEM ========== //
bot.on('callback_query', async (callbackQuery) => {
  const data = callbackQuery.data;
  
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
});

async function handleAdminApproval(productId, callbackQuery, approve) {
  const adminId = callbackQuery.from.id;
  const product = products.get(productId);
  
  if (!ADMIN_IDS.includes(adminId)) {
    await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Admin access required' });
    return;
  }
  
  if (!product) {
    await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Product not found' });
    return;
  }
  
  if (approve) {
    // Approve product
    product.status = 'approved';
    product.approvedBy = adminId;
    
    // Post to channel
    try {
      const seller = users.get(product.sellerId);
      
      const channelKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🛒 BUY NOW', callback_data: `buy_${product.id}` },
              { text: '📞 CONTACT SELLER', callback_data: `contact_${product.id}` }
            ]
          ]
        }
      };
      
      await bot.sendPhoto(CHANNEL_ID, product.images[0], {
        caption: `🏷️ *${product.title}*\n\n` +
                 `💰 *Price:* ${product.price} ETB\n` +
                 `📦 *Category:* ${product.category}\n` +
                 `👤 *Seller:* ${seller.firstName}\n` +
                 `${product.description ? `📝 *Description:* ${product.description}\n` : ''}` +
                 `\n📍 *Jimma University Campus*` +
                 `\n\n🛒 Buy via @${bot.options.username}`,
        parse_mode: 'Markdown',
        reply_markup: channelKeyboard.reply_markup
      });
      
    } catch (error) {
      console.error('Channel post error:', error);
    }
    
    // Notify seller
    await bot.sendMessage(product.sellerId,
      `✅ *Your Product Has Been Approved!*\n\n` +
      `🏷️ *${product.title}*\n` +
      `💰 ${product.price} ETB | ${product.category}\n\n` +
      `🎉 Your product is now live in @jumarket!\n\n` +
      `Buyers can now find and purchase your item.`,
      { parse_mode: 'Markdown' }
    );
    
    await bot.answerCallbackQuery(callbackQuery.id, { 
      text: '✅ Product approved and posted to channel!' 
    });
    
  } else {
    // Reject product
    product.status = 'rejected';
    product.approvedBy = adminId;
    
    // Notify seller
    await bot.sendMessage(product.sellerId,
      `❌ *Product Not Approved*\n\n` +
      `🏷️ *${product.title}*\n\n` +
      `Your product submission was not approved.\n\n` +
      `Possible reasons:\n` +
      `• Poor quality images\n` +
      `• Inappropriate content\n` +
      `• Missing information\n\n` +
      `You can submit again with better details.`,
      { parse_mode: 'Markdown' }
    );
    
    await bot.answerCallbackQuery(callbackQuery.id, { 
      text: '❌ Product rejected' 
    });
  }
}

// ========== HELP & CONTACT ========== //
bot.onText(/\/help|ℹ️ Help/, async (msg) => {
  const chatId = msg.chat.id;
  
  await bot.sendMessage(chatId,
    `ℹ️ *Jimma University Marketplace Help*\n\n` +
    `*How to Buy:*\n` +
    `1. Click "🛍️ Browse Products"\n` +
    `2. View available items\n` +
    `3. Click "🛒 Buy Now" or "📞 Contact Seller"\n` +
    `4. Arrange campus meetup\n\n` +
    `*How to Sell:*\n` +
    `1. Click "➕ Sell Item"\n` +
    `2. Send product photos\n` +
    `3. Add title, price, description\n` +
    `4. Wait for admin approval\n` +
    `5. Item appears in @jumarket\n\n` +
    `*Safety Tips:*\n` +
    `• Meet in public campus areas\n` +
    `• Verify items before paying\n` +
    `• Use cash transactions\n` +
    `• Bring friends if possible\n\n` +
    `*Need Help?* Contact admins via "📞 Contact Admin"`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/contact|📞 Contact Admin/, async (msg) => {
  const chatId = msg.chat.id;
  
  await bot.sendMessage(chatId,
    `📞 *Contact Administration*\n\n` +
    `For help with:\n` +
    `• Product approvals\n` +
    `• Account issues\n` +
    `• Safety concerns\n` +
    `• Suggestions\n\n` +
    `Please contact our admin team.\n\n` +
    `*JU Marketplace Team* 🎓`,
    { parse_mode: 'Markdown' }
  );
});

// ========== BOT STATUS ========== //
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  
  const totalProducts = products.size;
  const approvedProducts = Array.from(products.values()).filter(p => p.status === 'approved').length;
  const pendingProducts = Array.from(products.values()).filter(p => p.status === 'pending').length;
  const totalUsers = users.size;
  
  await bot.sendMessage(chatId,
    `📊 *Marketplace Status*\n\n` +
    `👥 Total Users: ${totalUsers}\n` +
    `🛍️ Total Products: ${totalProducts}\n` +
    `✅ Approved: ${approvedProducts}\n` +
    `⏳ Pending: ${pendingProducts}\n\n` +
    `🏪 *Jimma University Marketplace* 🎓`,
    { parse_mode: 'Markdown' }
  );
});

console.log('🎉 JU Marketplace Bot fully operational!');
