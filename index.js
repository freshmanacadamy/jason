/**
 * Jimma University Marketplace Bot - single-file implementation
 * Features:
 * - MongoDB (Mongoose) for Users, Products, Cart/Wishlist
 * - Multiple image upload (up to 5 file_ids)
 * - Admin approval + auto-post to channel with channel message tracking
 * - Channel join enforcement
 * - Webhook mode for Render (avoids polling conflicts)
 *
 * Usage:
 * - Set environment variables (see top of file)
 * - Deploy to Render as a Web Service (Start command: `node index.js`)
 *
 * NOTE: This implementation stores Telegram file_id(s) in MongoDB (recommended).
 * If you want to download and store actual files, we can add storage later.
 */

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(s => parseInt(s.trim())).filter(Boolean) : [];
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME || '@jumarket';
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL || process.env.RENDER_EXTERNAL_HOSTNAME && `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`;

// Basic checks
if (!BOT_TOKEN) {
  console.error('ERROR: BOT_TOKEN is required');
  process.exit(1);
}
if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI is required');
  process.exit(1);
}

const app = express();
app.use(express.json());

// ========== INITIALIZE TELEGRAM BOT ==========
// We'll create bot without polling and then set webhook (preferred).
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// ========== MONGOOSE SCHEMAS ==========
mongoose.set('strictQuery', true);
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// User schema
const userSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  username: String,
  firstName: String,
  lastName: String,
  department: String,
  year: String,
  joinedChannel: { type: Boolean, default: false },
  rating: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// Product schema
const productSchema = new mongoose.Schema({
  sellerId: { type: Number, required: true },
  title: { type: String, required: true },
  description: String,
  price: { type: Number, required: true },
  category: { type: String, default: 'Other' },
  images: [String], // array of Telegram file_ids
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'sold'], default: 'pending' },
  channelMessageIds: [Number], // message ids posted into channel (could be multiple for media group)
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date
});
const Product = mongoose.model('Product', productSchema);

// Cart / Wishlist schema (simple)
const cartSchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  items: [{ productId: mongoose.Schema.Types.ObjectId, qty: { type: Number, default: 1 } }],
  createdAt: { type: Date, default: Date.now }
});
const Cart = mongoose.model('Cart', cartSchema);

const wishlistSchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  productIds: [mongoose.Schema.Types.ObjectId]
});
const Wishlist = mongoose.model('Wishlist', wishlistSchema);

// ========== In-memory user states for flows (temporarily) ==========
const userStates = new Map();
// structure:
// userStates.set(telegramId, { stage: 'awaiting_images'|'awaiting_title'|'awaiting_price'|..., productDraft: { images: [], title, description, price, category } })

// ========== HELPERS ==========
async function ensureUserExists(from) {
  let u = await User.findOne({ telegramId: from.id });
  if (!u) {
    u = await User.create({
      telegramId: from.id,
      username: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
      joinedChannel: false
    });
  } else {
    // Update username + name on start
    let changed = false;
    if (u.username !== from.username) { u.username = from.username; changed = true; }
    if (u.firstName !== from.first_name) { u.firstName = from.first_name; changed = true; }
    if (u.lastName !== from.last_name) { u.lastName = from.last_name; changed = true; }
    if (changed) await u.save();
  }
  return u;
}

async function checkChannelMembership(telegramId) {
  try {
    const member = await bot.getChatMember(CHANNEL_USERNAME, telegramId);
    // statuses: "creator", "administrator", "member", "restricted", "left", "kicked"
    return ['creator', 'administrator', 'member', 'restricted'].includes(member.status);
  } catch (err) {
    // If channel is private or bot lacks access, treat as false
    console.warn('checkChannelMembership error:', err && err.response && err.response.body ? err.response.body : err.message);
    return false;
  }
}

function isAdmin(telegramId) {
  return ADMIN_IDS.includes(telegramId);
}

// format product short
function shortProductText(product) {
  return `🏷️ *${escapeMarkdown(product.title)}*\n💰 *Price:* ${product.price} ETB\n📂 *Category:* ${escapeMarkdown(product.category)}\n\n${product.description ? escapeMarkdown(product.description.substring(0, 200)) + (product.description.length>200 ? '...' : '') : ''}`;
}
function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

// ========== WEBHOOK SETUP ==========
/**
 * If WEBHOOK_URL is set or Render provided RENDER_EXTERNAL_HOSTNAME env, set webhook.
 * Else we will print a message and optionally fallback to polling (not recommended).
 */
async function setupWebhook() {
  if (WEBHOOK_URL) {
    const hookPath = `/bot${BOT_TOKEN}`;
    const fullUrl = `${WEBHOOK_URL}${hookPath}`;
    try {
      await bot.setWebHook(fullUrl);
      console.log('✅ Webhook set to', fullUrl);
      // Express endpoint:
      app.post(hookPath, (req, res) => {
        bot.processUpdate(req.body);
        res.sendStatus(200);
      });
      return true;
    } catch (err) {
      console.error('❌ Failed to set webhook:', err);
      return false;
    }
  } else {
    console.warn('⚠️ No WEBHOOK_URL / RENDER_EXTERNAL_HOSTNAME found. Webhook not configured. Use WEBHOOK_URL to set webhook in production (Render).');
    return false;
  }
}

// ========== ROUTES ==========
app.get('/', (req, res) => {
  res.send('🤖 Jimma University Marketplace Bot is running.');
});

app.get('/health', (req, res) => res.json({ ok: true }));

// ========== TELEGRAM BOT COMMANDS & HANDLERS ==========

// Start: register user, ensure channel joined, show menu
bot.onText(/\/start/, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const user = await ensureUserExists(msg.from);
    const isMember = await checkChannelMembership(msg.from.id);
    if (isMember && !user.joinedChannel) {
      user.joinedChannel = true;
      await user.save();
    }

    let welcome = `🎓 *Welcome to Jimma University Marketplace!* \n\n` +
      `Buy & sell within Jimma University.\n\n` +
      `🔔 *Important:* You must join ${CHANNEL_USERNAME} to post items.\n`;

    const menu = {
      reply_markup: {
        keyboard: [
          [{ text: '➕ Add Product' }, { text: '🛍️ Browse Products' }],
          [{ text: '📋 My Products' }, { text: '🛒 My Cart' }],
          [{ text: '❤️ Wishlist' }, { text: 'ℹ️ Help' }]
        ],
        resize_keyboard: true
      },
      parse_mode: 'Markdown'
    };

    // Add some admin stats if admin
    if (isAdmin(msg.from.id)) {
      const pendingCount = await Product.countDocuments({ status: 'pending' });
      welcome += `\n*Admin:* ${pendingCount} pending products to review.`;
    }

    await bot.sendMessage(chatId, welcome, { parse_mode: 'Markdown', ...menu.reply_markup ? { reply_markup: menu.reply_markup } : {} });
  } catch (err) {
    console.error('/start error', err);
  }
});

// Start product flow when user presses Add Product
bot.onText(/➕ Add Product|\/addproduct/i, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const user = await ensureUserExists(msg.from);
    const joined = await checkChannelMembership(msg.from.id);
    if (!joined) {
      await bot.sendMessage(chatId, `🚫 You must join ${CHANNEL_USERNAME} before adding products. Please join and then press /start again.`);
      return;
    }

    userStates.set(msg.from.id, { stage: 'awaiting_images', productDraft: { images: [], title: '', description: '', price: 0, category: '' } });
    await bot.sendMessage(chatId, '📸 *Add Product - Step 1/4*\nSend up to 5 product photos (send one at a time). When done, send /done.', { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('addproduct', err);
  }
});

// receive photos
bot.on('photo', async (msg) => {
  try {
    const chatId = msg.chat.id;
    const uid = msg.from.id;
    const state = userStates.get(uid);
    if (!state) return; // not in product flow
    if (state.stage !== 'awaiting_images') return;

    // take highest quality photo
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    const images = state.productDraft.images || [];

    if (images.length >= 5) {
      await bot.sendMessage(chatId, '⚠️ You already uploaded 5 images (max). Send /done to continue.');
      return;
    }
    images.push(fileId);
    state.productDraft.images = images;
    userStates.set(uid, state);
    await bot.sendMessage(chatId, `✅ Photo received (${images.length}/5). Send more or /done to continue.`);
  } catch (err) {
    console.error('photo handler', err);
  }
});

// done uploading images
bot.onText(/\/done/i, async (msg) => {
  try {
    const uid = msg.from.id;
    const chatId = msg.chat.id;
    const state = userStates.get(uid);
    if (!state || state.stage !== 'awaiting_images') {
      return;
    }
    if (!state.productDraft.images || state.productDraft.images.length === 0) {
      await bot.sendMessage(chatId, '⚠️ You must upload at least one photo. Send a photo now or cancel with /cancel.');
      return;
    }
    state.stage = 'awaiting_title';
    userStates.set(uid, state);
    await bot.sendMessage(chatId, '🏷️ *Step 2/4 - Product Title*\nSend the product title:', { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('/done handler', err);
  }
});

// cancel flow
bot.onText(/\/cancel/i, async (msg) => {
  userStates.delete(msg.from.id);
  await bot.sendMessage(msg.chat.id, '❌ Product creation cancelled.');
});

// titles, price, description, category flow handled via message text
bot.on('message', async (msg) => {
  try {
    // ignore messages that are commands or photos handled above
    if (!msg.text) return;
    const text = msg.text.trim();
    const uid = msg.from.id;
    const state = userStates.get(uid);

    // If no state, allow commands like Browse, My Products, Help, Admin commands
    if (!state) {
      // Simple menu handling
      if (/🛍️ Browse Products|\/browse/i.test(text)) {
        return await handleBrowse(msg);
      }
      if (/📋 My Products|\/myproducts/i.test(text)) {
        return await handleMyProducts(msg);
      }
      if (/ℹ️ Help|\/help/i.test(text)) {
        return await bot.sendMessage(msg.chat.id, helpText(), { parse_mode: 'Markdown' });
      }
      if (/🛒 My Cart|\/cart/i.test(text)) {
        return await handleCart(msg);
      }
      if (/❤️ Wishlist|\/wishlist/i.test(text)) {
        return await handleWishlist(msg);
      }
      // Admin commands
      if (/\/admin_pending/i.test(text) && isAdmin(uid)) {
        return await handleAdminPending(msg);
      }
      if (/\/verify/i.test(text)) {
        return await startVerification(msg);
      }
      // otherwise ignore
      return;
    }

    // --- Product creation flow ---
    if (state.stage === 'awaiting_title') {
      state.productDraft.title = text;
      state.stage = 'awaiting_price';
      userStates.set(uid, state);
      await bot.sendMessage(msg.chat.id, '💰 *Step 3/4 - Price*\nSend price in ETB (numbers only):', { parse_mode: 'Markdown' });
      return;
    }

    if (state.stage === 'awaiting_price') {
      const priceNum = parseFloat(text.replace(/,/g, ''));
      if (isNaN(priceNum) || priceNum <= 0) {
        await bot.sendMessage(msg.chat.id, '❌ Invalid price. Send a number (e.g., 1500).');
        return;
      }
      state.productDraft.price = Math.round(priceNum);
      state.stage = 'awaiting_description';
      userStates.set(uid, state);
      await bot.sendMessage(msg.chat.id, '✍️ *Step 4/4 - Description & Category*\nSend a short description (or type "skip"), then the category on the next message (e.g., Books, Electronics, Clothes, Furniture, Study Materials).', { parse_mode: 'Markdown' });
      return;
    }

    if (state.stage === 'awaiting_description') {
      const desc = text.toLowerCase() === 'skip' ? '' : text;
      state.productDraft.description = desc;
      state.stage = 'awaiting_category';
      userStates.set(uid, state);
      await bot.sendMessage(msg.chat.id, '📂 Send category (Books, Electronics, Clothes, Furniture, Study Materials, Other):');
      return;
    }

    if (state.stage === 'awaiting_category') {
      const category = text || 'Other';
      state.productDraft.category = category;
      // Save product as pending
      const draft = state.productDraft;
      const product = new Product({
        sellerId: uid,
        title: draft.title,
        description: draft.description,
        price: draft.price,
        category: draft.category,
        images: draft.images, // array of file_ids
        status: 'pending'
      });
      await product.save();
      userStates.delete(uid);

      // Notify user and admin(s)
      await bot.sendMessage(msg.chat.id, `✅ Product submitted for review. Title: *${escapeMarkdown(product.title)}*\nAn admin will approve it before it is posted to ${CHANNEL_USERNAME}.`, { parse_mode: 'Markdown' });

      // Notify admins with approve/reject buttons
      const adminKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Approve', callback_data: `admin_approve_${product._id}` }, { text: '❌ Reject', callback_data: `admin_reject_${product._id}` }]
          ]
        }
      };
      // send to each admin (if admins not reachable, ignore errors)
      for (const adminId of ADMIN_IDS) {
        try {
          await bot.sendMessage(adminId, `🆕 New product pending review:\n\n${shortProductText(product)}\n\nSeller: [tg://user?id=${product.sellerId}]`, { parse_mode: 'Markdown', ...adminKeyboard });
        } catch (err) {
          console.warn('Failed to notify admin', adminId, err.message || err);
        }
      }
      return;
    }
  } catch (err) {
    console.error('message flow error', err);
  }
});

// ========== ADMIN CALLBACKS: Approve / Reject ==========
bot.on('callback_query', async (callbackQuery) => {
  try {
    const data = callbackQuery.data;
    const fromId = callbackQuery.from.id;
    const message = callbackQuery.message;
    if (!data) { return; }

    // Admin approve
    if (data.startsWith('admin_approve_')) {
      if (!isAdmin(fromId)) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'You are not admin.' });
        return;
      }
      const productId = data.replace('admin_approve_', '');
      const product = await Product.findById(productId);
      if (!product) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Product not found.' });
        return;
      }
      product.status = 'approved';
      product.updatedAt = new Date();
      await product.save();

      // Post to channel
      const postedIds = await postProductToChannel(product);
      product.channelMessageIds = postedIds;
      await product.save();

      // Notify seller
      try {
        await bot.sendMessage(product.sellerId, `🎉 Your product "${product.title}" has been approved and posted to ${CHANNEL_USERNAME}!`);
      } catch (err) { console.warn('notify seller error', err.message || err); }

      await bot.answerCallbackQuery(callbackQuery.id, { text: 'Product approved and posted.' });
      // Edit admin panel message to show it's approved
      try {
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: message.chat.id, message_id: message.message_id });
        await bot.sendMessage(message.chat.id, `✅ Approved: ${product.title}`);
      } catch (err) { /* ignore */ }
      return;
    }

    // Admin reject
    if (data.startsWith('admin_reject_')) {
      if (!isAdmin(fromId)) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'You are not admin.' });
        return;
      }
      const productId = data.replace('admin_reject_', '');
      const product = await Product.findById(productId);
      if (!product) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Product not found.' });
        return;
      }
      product.status = 'rejected';
      product.updatedAt = new Date();
      await product.save();

      // Notify seller
      try {
        await bot.sendMessage(product.sellerId, `❌ Your product "${product.title}" was rejected by admin. Contact admin for details.`);
      } catch (err) { /* ignore */ }

      await bot.answerCallbackQuery(callbackQuery.id, { text: 'Product rejected.' });
      try {
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: message.chat.id, message_id: message.message_id });
        await bot.sendMessage(message.chat.id, `❌ Rejected: ${product.title}`);
      } catch (err) { /* ignore */ }
      return;
    }

    // Buyer interactions (from channel posts)
    if (data.startsWith('addtocart_')) {
      const productId = data.replace('addtocart_', '');
      const product = await Product.findById(productId);
      if (!product || product.status !== 'approved') {
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Product not available.' });
        return;
      }
      // Add to user's cart
      let cart = await Cart.findOne({ userId: fromId });
      if (!cart) cart = await Cart.create({ userId: fromId, items: [] });
      const existing = cart.items.find(i => i.productId.toString() === productId);
      if (existing) existing.qty += 1; else cart.items.push({ productId: product._id, qty: 1 });
      await cart.save();
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'Added to your cart.' });
      return;
    }

    if (data.startsWith('contactseller_')) {
      const productId = data.replace('contactseller_', '');
      const product = await Product.findById(productId);
      if (!product) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Product not found.' });
        return;
      }
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'Contacting seller...' });
      // send buyer -> seller message
      try {
        await bot.sendMessage(product.sellerId, `💬 A buyer (${callbackQuery.from.first_name} @${callbackQuery.from.username || 'no_username'}) is interested in your product: *${escapeMarkdown(product.title)}*.\nMessage them: tg://user?id=${callbackQuery.from.id}`, { parse_mode: 'Markdown' });
        await bot.sendMessage(callbackQuery.from.id, `✅ Seller has been notified. You can message them directly: tg://user?id=${product.sellerId}`);
      } catch (err) {
        console.warn('contact seller error', err.message || err);
      }
      return;
    }

  } catch (err) {
    console.error('callback_query handler error', err);
  }
});

// ========== UTILITY: Post product to channel ==========
async function postProductToChannel(product) {
  // product.images = array of file_ids
  // If multiple images >1, use sendMediaGroup
  // If single image, use sendPhoto and return [message_id]
  const postedIds = [];
  try {
    const caption = `🏷️ *${escapeMarkdown(product.title)}*\n\n💰 *Price:* ${product.price} ETB\n📂 *Category:* ${escapeMarkdown(product.category)}\n\n${product.description ? escapeMarkdown(product.description) + '\n\n' : ''}👤 Seller: [tg://user?id=${product.sellerId}]\n\n*Actions:*`;
    if (product.images && product.images.length > 1) {
      // media group - set caption on first item (Telegram only allows caption on one media)
      const media = product.images.map((fileId, idx) => ({
        type: 'photo',
        media: fileId,
        caption: idx === 0 ? caption : undefined,
        parse_mode: 'Markdown'
      }));
      // sendMediaGroup returns array of messages (one per item)
      const msgs = await bot.sendMediaGroup(CHANNEL_USERNAME, media);
      for (const m of msgs) {
        postedIds.push(m.message_id);
      }
      // Add inline keyboard (separate message) referencing product id
      const inline = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🛒 ADD TO CART', callback_data: `addtocart_${product._id}` }, { text: '💬 CONTACT SELLER', callback_data: `contactseller_${product._id}` }]
          ]
        }
      };
      const kmsg = await bot.sendMessage(CHANNEL_USERNAME, `Actions for: ${product.title}`, inline);
      postedIds.push(kmsg.message_id);
    } else if (product.images && product.images.length === 1) {
      const opts = {
        caption,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🛒 ADD TO CART', callback_data: `addtocart_${product._id}` }, { text: '💬 CONTACT SELLER', callback_data: `contactseller_${product._id}` }]] }
      };
      const sent = await bot.sendPhoto(CHANNEL_USERNAME, product.images[0], opts);
      postedIds.push(sent.message_id);
    } else {
      // no images -> text post
      const sent = await bot.sendMessage(CHANNEL_USERNAME, caption, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🛒 ADD TO CART', callback_data: `addtocart_${product._id}` }, { text: '💬 CONTACT SELLER', callback_data: `contactseller_${product._id}` }]] } });
      postedIds.push(sent.message_id);
    }
    return postedIds;
  } catch (err) {
    console.error('postProductToChannel error:', err && err.response && err.response.body ? err.response.body : err);
    return postedIds;
  }
}

// ========== BASIC BROWSE / SEARCH HANDLERS ==========
async function handleBrowse(msg) {
  try {
    const chatId = msg.chat.id;
    // show category keyboard
    const categories = ['Books', 'Electronics', 'Clothes', 'Furniture', 'Study Materials', 'Other'];
    const keyboard = {
      reply_markup: {
        keyboard: categories.map(c => [{ text: c }]),
        resize_keyboard: true,
        one_time_keyboard: true
      }
    };
    await bot.sendMessage(chatId, 'Select a category to browse or type a keyword to search:', keyboard);
    // Next messages will be handled by general message handler (we keep it simple).
  } catch (err) { console.error('handleBrowse', err); }
}

async function handleMyProducts(msg) {
  try {
    const chatId = msg.chat.id;
    const products = await Product.find({ sellerId: msg.from.id });
    if (!products.length) return bot.sendMessage(chatId, '📋 You have not listed any products.');

    for (const p of products) {
      const text = `🏷️ *${escapeMarkdown(p.title)}*\n💰 ${p.price} ETB\n📂 ${escapeMarkdown(p.category)}\nStatus: ${p.status}`;
      if (p.images && p.images.length) {
        try {
          await bot.sendPhoto(chatId, p.images[0], { caption: text, parse_mode: 'Markdown' });
        } catch (err) {
          await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        }
      } else {
        await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      }
    }
  } catch (err) { console.error('handleMyProducts', err); }
}

async function handleCart(msg) {
  try {
    const chatId = msg.chat.id;
    const cart = await Cart.findOne({ userId: msg.from.id }).populate('items.productId');
    if (!cart || cart.items.length === 0) return bot.sendMessage(chatId, '🛒 Your cart is empty.');

    let text = '🛒 Your Cart:\n\n';
    for (const item of cart.items) {
      const pid = item.productId;
      const prod = await Product.findById(pid);
      if (prod) {
        text += `• ${escapeMarkdown(prod.title)} — ${prod.price} ETB x ${item.qty}\n`;
      }
    }
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) { console.error('handleCart', err); }
}

async function handleWishlist(msg) {
  try {
    const chatId = msg.chat.id;
    const wl = await Wishlist.findOne({ userId: msg.from.id });
    if (!wl || wl.productIds.length === 0) return bot.sendMessage(chatId, '❤️ Your wishlist is empty.');
    let text = '❤️ Wishlist:\n\n';
    for (const pid of wl.productIds) {
      const prod = await Product.findById(pid);
      if (prod) text += `• ${escapeMarkdown(prod.title)} — ${prod.price} ETB\n`;
    }
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) { console.error('handleWishlist', err); }
}

// Admin: list pending products
async function handleAdminPending(msg) {
  try {
    const chatId = msg.chat.id;
    const pending = await Product.find({ status: 'pending' });
    if (!pending.length) return bot.sendMessage(chatId, 'No pending products at the moment.');
    for (const p of pending) {
      const t = shortProductText(p);
      const inline = { reply_markup: { inline_keyboard: [[{ text: '✅ Approve', callback_data: `admin_approve_${p._id}` }, { text: '❌ Reject', callback_data: `admin_reject_${p._id}` }]] } };
      if (p.images && p.images.length) {
        try {
          await bot.sendPhoto(chatId, p.images[0], { caption: t, parse_mode: 'Markdown', ...inline });
        } catch (err) {
          await bot.sendMessage(chatId, `${t}`, { parse_mode: 'Markdown', ...inline });
        }
      } else {
        await bot.sendMessage(chatId, `${t}`, { parse_mode: 'Markdown', ...inline });
      }
    }
  } catch (err) { console.error('handleAdminPending', err); }
}

// Minimal verify flow
async function startVerification(msg) {
  const uid = msg.from.id;
  userStates.set(uid, { stage: 'verify_department' });
  await bot.sendMessage(msg.chat.id, '📚 Verification — Send your department (e.g., Civil Eng, CSE, Biology):');
}
bot.onText(/.*/, async (msg) => {
  // small additional handler for verification steps
  const uid = msg.from.id;
  const state = userStates.get(uid);
  if (!state) return;
  try {
    if (state.stage === 'verify_department') {
      const dept = msg.text.trim();
      state.department = dept;
      state.stage = 'verify_year';
      userStates.set(uid, state);
      await bot.sendMessage(msg.chat.id, '🗓️ Now send your year of study (e.g., 1, 2, 3, 4):');
      return;
    }
    if (state.stage === 'verify_year') {
      const year = msg.text.trim();
      // update user
      const u = await User.findOne({ telegramId: uid });
      if (u) {
        u.department = state.department;
        u.year = year;
        await u.save();
      }
      userStates.delete(uid);
      await bot.sendMessage(msg.chat.id, '✅ Verification saved. Thank you!');
      return;
    }
  } catch (err) {
    console.error('verify flow error', err);
  }
});

// ========== HELPER TEXT ==========
function helpText() {
  return `ℹ️ *Jimma University Marketplace Help*\n\n` +
    `*How to Sell:*\n` +
    `1. Click "➕ Add Product" or send /addproduct\n` +
    `2. Upload 1-5 photos, send /done\n` +
    `3. Send title, price, description, category\n` +
    `4. Admin will review and approve post to ${CHANNEL_USERNAME}\n\n` +
    `*How to Buy:*\n` +
    `1. Browse channel ${CHANNEL_USERNAME} or use Browse in bot\n` +
    `2. Use "ADD TO CART" in channel post or contact seller\n\n` +
    `*Need Help?* Contact an admin.`;
}

// ========== STARTUP ==========
(async () => {
  // set up webhook if possible; otherwise we log a warning
  const ok = await setupWebhook();
  if (!ok) {
    console.warn('⚠️ Webhook not configured. Consider setting WEBHOOK_URL or RENDER_EXTERNAL_HOSTNAME. Exiting to avoid polling conflicts.');
    // we deliberately exit so you don't accidentally run polling and get 409 errors (as seen earlier).
    // If you *really* want polling (local dev), remove this exit and enable polling:
    // bot.startPolling();
    process.exit(0);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Express server listening on port ${PORT}`);
    console.log('🎉 Bot initialized (webhook mode). Ready to receive updates.');
  });
})();

// ========== Graceful shutdown ==========
process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  process.exit(0);
});
