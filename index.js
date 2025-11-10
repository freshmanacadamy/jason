const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const app = express();

// Express routes
app.get("/", (req, res) => {
    res.send("🤖 Bot is alive and running!");
});

app.get("/health", (req, res) => {
    res.json({ status: "healthy", server: "Telegram Bot" });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
});

// Telegram Bot - Replace with your actual token
const token = process.env.BOT_TOKEN || "8417570687:AAHmzvJ3SBDdRCiVVWY23po2oTdMDttxDzM"; // Fixed token format

const bot = new TelegramBot(token, { polling: true });

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const userInput = msg.text;
    const msg_id = msg.message_id;

    console.log(`📨 Received message: ${userInput} from ${chatId}`);

    // Echo the message back
    await bot.sendMessage(chatId, `You said: ${userInput}`, {
        reply_to_message_id: msg_id
    });
});

// Bot event handlers
bot.on("polling_error", (error) => {
    console.log(`❌ Polling error: ${error}`);
});

console.log("✅ Telegram Bot started successfully!");
