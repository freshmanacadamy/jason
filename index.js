// =================== IMPORTS ===================
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const dotenv = require('dotenv');
const fs = require('fs');
const https = require('https');

// =================== CONFIG ===================
dotenv.config();
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = (process.env.ADMIN_IDS || "").split(",");
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) throw new Error('BOT_TOKEN missing from .env');

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();

// =================== STORAGE ===================
let users = new Map();
let products = new Map();

// Load saved data (if exists)
if (fs.existsSync('data.json')) {
  const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
  users = new Map(data.users || []);
  products = new Map(data.products || []);
  console.log("✅ Data loaded successfully.");
}

// Save all data
function saveData() {
  const data = {
    users: [...users],
    products: [...products],
  };
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}

// =================== UTILITIES ===================
function downloadImage(fileId, callback) {
  bot.getFile(fileId).then(file => {
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const fileName = `product_${Date.now()}.jpg`;
    const fileStream = fs.createWriteStream(fileName);
    https.get(fileUrl, (res) => {
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        callback(fileName);
      });
    });
  }).catch(err => console.error("Image download error:", err));
}

// =================== COMMANDS ===================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!users.has(userId)) {
    users.set(userId, { id: userId, name: msg.from.first_name });
    saveData();
  }

  const menu = {
    reply_markup: {
      keyboard: [
        ['🛍 Add Product', '📦 Browse Products'],
        ['💼 My Products', '❓ Help']
      ],
      resize_keyboard: true
    }
  };

  bot.sendMessage(chatId, `👋 Welcome ${msg.from.first_name}!\nUse the menu below to manage your marketplace.`, menu);
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  if (!users.has(userId)) return;

  // Add product flow
  if (text === '🛍 Add Product') {
    bot.sendMessage(chatId, '📸 Send the product photo:');
    users.get(userId).state = 'waiting_photo';
    return;
  }

  const userState = users.get(userId);

  if (userState?.state === 'waiting_photo' && msg.photo) {
    const photo = msg.photo[msg.photo.length - 1];
    bot.sendMessage(chatId, '📝 Send product title:');
    userState.state = 'waiting_title';
    userState.tempPhoto = photo.file_id;
    return;
  }

  if (userState?.state === 'waiting_title') {
    userState.state = 'waiting_price';
    userState.tempTitle = text;
    bot.sendMessage(chatId, '💰 Send product price:');
    return;
  }

  if (userState?.state === 'waiting_price') {
    userState.state = null;
    const price = text;
    bot.sendMessage(chatId, '⏳ Saving product...');

    downloadImage(userState.tempPhoto, (fileName) => {
      const id = Date.now().toString();
      const newProduct = {
        id,
        ownerId: userId,
        title: userState.tempTitle,
        price,
        image: fileName
      };
      products.set(id, newProduct);
      saveData();
      bot.sendMessage(chatId, `✅ Product added!\n📦 ${newProduct.title} - ${newProduct.price}`);
    });

    return;
  }

  // Browse Products
  if (text === '📦 Browse Products') {
    if (products.size === 0) return bot.sendMessage(chatId, 'No products available.');

    for (const [id, product] of products) {
      const caption = `📦 <b>${product.title}</b>\n💰 Price: ${product.price}`;
      const opts = {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '💬 Contact Seller', callback_data: `contact_${id}` }]]
        }
      };
      bot.sendPhoto(chatId, fs.createReadStream(product.image), opts);
    }
    return;
  }

  // My Products
  if (text === '💼 My Products') {
    const myProducts = [...products.values()].filter(p => p.ownerId === userId);
    if (myProducts.length === 0) return bot.sendMessage(chatId, 'You have no products.');

    for (const product of myProducts) {
      const caption = `📦 <b>${product.title}</b>\n💰 ${product.price}`;
      bot.sendPhoto(chatId, fs.createReadStream(product.image), { parse_mode: 'HTML', caption });
    }
    return;
  }

  // Help
  if (text === '❓ Help') {
    bot.sendMessage(chatId, '🤖 Use the menu:\n🛍 Add Product - Upload your item.\n📦 Browse Products - View others.\n💼 My Products - Manage yours.');
  }
});

// =================== CALLBACK HANDLERS ===================
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith('contact_')) {
    const productId = data.split('_')[1];
    const product = products.get(productId);
    if (!product) return bot.sendMessage(chatId, 'Product not found.');

    bot.sendMessage(chatId, `📞 Contact seller: [Click here](tg://user?id=${product.ownerId})`, { parse_mode: 'Markdown' });
  }
});

// =================== KEEP ALIVE SERVER ===================
app.get('/', (req, res) => res.send('✅ Telegram Marketplace Bot is running.'));
app.listen(PORT, () => console.log(`🌐 Server running on port ${PORT}`));

// Save data on exit
process.on('exit', saveData);
process.on('SIGINT', () => { saveData(); process.exit(); });
process.on('SIGTERM', () => { saveData(); process.exit(); });
