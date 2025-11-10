const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const OpenAI = require('openai');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Express for 24/7 uptime
app.get('/', (req, res) => {
  res.send('🤖 ChatGPT Telegram Bot is Running!');
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'ChatGPT Bot' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Telegram Bot
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// OpenAI ChatGPT
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Store conversation history
const userConversations = new Map();

// Start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `
🤖 **ChatGPT AI Assistant**

I'm powered by OpenAI's GPT-4 and ready to help you!

**Commands:**
/start - Start conversation
/help - Get help
/new - Start new conversation
/mode - Change AI mode
/stats - Show usage statistics

**Just send me a message and I'll respond!** 💬

*Note: I remember our conversation context*
  `;

  bot.sendMessage(chatId, welcomeMessage, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '💬 Start Chat', callback_data: 'start_chat' },
          { text: '🛠️ Help', callback_data: 'show_help' }
        ],
        [
          { text: '🧠 AI Modes', callback_data: 'show_modes' }
        ]
      ]
    }
  });
});

// Help command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `
**How to use this AI bot:**

💬 **Chat Features:**
- Normal conversation
- Code generation
- Translation
- Writing assistance
- Problem solving

🛠️ **Commands:**
/new - Clear conversation history
/mode - Change AI personality
/stats - See your usage

⚡ **Tips:**
- I remember last 10 messages
- Use /new to reset context
- Be specific for better answers

**Just start typing your question!**
  `;

  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// New conversation command
bot.onText(/\/new/, (msg) => {
  const chatId = msg.chat.id;
  userConversations.delete(chatId);
  bot.sendMessage(chatId, '🔄 Conversation history cleared! Starting fresh...');
});

// Mode selection command
bot.onText(/\/mode/, (msg) => {
  const chatId = msg.chat.id;
  
  const modeOptions = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🤖 Assistant', callback_data: 'mode_assistant' },
          { text: '💻 Programmer', callback_data: 'mode_programmer' }
        ],
        [
          { text: '🎨 Creative', callback_data: 'mode_creative' },
          { text: '📚 Teacher', callback_data: 'mode_teacher' }
        ],
        [
          { text: '😄 Friendly', callback_data: 'mode_friendly' },
          { text: '📊 Analyst', callback_data: 'mode_analyst' }
        ]
      ]
    }
  };

  bot.sendMessage(chatId, '🎭 Choose AI Mode:', modeOptions);
});

// Stats command
bot.onText(/\/stats/, (msg) => {
  const chatId = msg.chat.id;
  const conversation = userConversations.get(chatId);
  const messageCount = conversation ? conversation.messages.length / 2 : 0;
  
  bot.sendMessage(chatId, `📊 **Your Stats:**\n\n💬 Messages exchanged: ${messageCount}\n🧠 Memory: ${conversation ? 'Active' : 'None'}\n⚡ Status: Online`, { parse_mode: 'Markdown' });
});

// Handle button callbacks
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const data = callbackQuery.data;

  try {
    if (data === 'start_chat') {
      await bot.sendMessage(chatId, '💬 Hello! I\'m your AI assistant. How can I help you today?');
    } else if (data === 'show_help') {
      await bot.sendMessage(chatId, '🛠️ **Help Center**\n\nJust send me any message and I\'ll respond!\nUse /new to clear history\nUse /mode to change my style', { parse_mode: 'Markdown' });
    } else if (data === 'show_modes') {
      await showModeSelection(chatId);
    } else if (data.startsWith('mode_')) {
      await setUserMode(chatId, data.replace('mode_', ''));
    }
    
    bot.answerCallbackQuery(callbackQuery.id);
  } catch (error) {
    console.error('Callback error:', error);
    bot.answerCallbackQuery(callbackQuery.id, { text: 'Error!' });
  }
});

// AI Mode configurations
const aiModes = {
  assistant: {
    name: '🤖 Assistant',
    system: 'You are a helpful AI assistant. Provide clear, concise, and accurate responses.'
  },
  programmer: {
    name: '💻 Programmer',
    system: 'You are a senior software developer. Provide code examples, debugging help, and technical explanations.'
  },
  creative: {
    name: '🎨 Creative',
    system: 'You are a creative writer and artist. Provide imaginative, storytelling, and creative responses.'
  },
  teacher: {
    name: '📚 Teacher',
    system: 'You are an educational instructor. Explain concepts clearly with examples and encourage learning.'
  },
  friendly: {
    name: '😄 Friendly',
    system: 'You are a friendly and casual companion. Use emojis and be warm in your responses.'
  },
  analyst: {
    name: '📊 Analyst',
    system: 'You are a data analyst. Provide structured, analytical responses with clear reasoning.'
  }
};

// Set user mode
async function setUserMode(chatId, mode) {
  if (!userConversations.has(chatId)) {
    userConversations.set(chatId, { mode: 'assistant', messages: [] });
  }
  
  const conversation = userConversations.get(chatId);
  conversation.mode = mode;
  conversation.messages = []; // Clear history when changing mode
  
  const modeInfo = aiModes[mode];
  await bot.sendMessage(chatId, `🎭 Mode set to: ${modeInfo.name}\n\n${modeInfo.system}\n\nConversation history cleared. Start fresh!`);
}

// Show mode selection
async function showModeSelection(chatId) {
  const modeOptions = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🤖 Assistant', callback_data: 'mode_assistant' },
          { text: '💻 Programmer', callback_data: 'mode_programmer' }
        ],
        [
          { text: '🎨 Creative', callback_data: 'mode_creative' },
          { text: '📚 Teacher', callback_data: 'mode_teacher' }
        ],
        [
          { text: '😄 Friendly', callback_data: 'mode_friendly' },
          { text: '📊 Analyst', callback_data: 'mode_analyst' }
        ]
      ]
    }
  };

  await bot.sendMessage(chatId, '🎭 **Choose AI Personality:**\n\nEach mode has different behavior and expertise:', modeOptions);
}

// Handle all messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;

  // Ignore commands and empty messages
  if (!text || text.startsWith('/')) return;

  try {
    // Send "typing" action
    await bot.sendChatAction(chatId, 'typing');

    // Get or initialize conversation
    if (!userConversations.has(chatId)) {
      userConversations.set(chatId, { mode: 'assistant', messages: [] });
    }

    const conversation = userConversations.get(chatId);
    const mode = aiModes[conversation.mode] || aiModes.assistant;

    // Add user message to conversation
    conversation.messages.push({ role: 'user', content: text });

    // Keep only last 10 messages (5 exchanges) to manage token limit
    if (conversation.messages.length > 20) {
      conversation.messages = conversation.messages.slice(-20);
    }

    // Prepare messages for OpenAI (start with system message)
    const messages = [
      { role: 'system', content: mode.system },
      ...conversation.messages
    ];

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages,
      max_tokens: 1000,
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0].message.content;

    // Add AI response to conversation
    conversation.messages.push({ role: 'assistant', content: aiResponse });

    // Send response to user
    await bot.sendMessage(chatId, aiResponse, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 New Chat', callback_data: 'new_chat' },
            { text: '🎭 Change Mode', callback_data: 'show_modes' }
          ]
        ]
      }
    });

  } catch (error) {
    console.error('ChatGPT API error:', error);
    
    let errorMessage = '❌ Sorry, I encountered an error. ';
    
    if (error.code === 'insufficient_quota') {
      errorMessage += 'API quota exceeded. Please check OpenAI billing.';
    } else if (error.code === 'rate_limit_exceeded') {
      errorMessage += 'Rate limit exceeded. Please wait a moment.';
    } else {
      errorMessage += 'Please try again later.';
    }
    
    await bot.sendMessage(chatId, errorMessage);
  }
});

// Handle new chat from button
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const data = callbackQuery.data;

  if (data === 'new_chat') {
    userConversations.delete(chatId);
    await bot.sendMessage(chatId, '🔄 Started a new conversation! How can I help you?');
    bot.answerCallbackQuery(callbackQuery.id, { text: 'New chat started!' });
  }
});

// Error handling
bot.on('polling_error', (error) => {
  console.log(`❌ Polling error: ${error}`);
});

bot.on('error', (error) => {
  console.log(`❌ Bot error: ${error}`);
});

console.log('✅ ChatGPT Telegram Bot Started!');
