const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Express for 24/7 uptime
app.get('/', (req, res) => {
  res.send('🎥 YouTube Downloader Bot is Running!');
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'YouTube Downloader' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Telegram Bot
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Store user download requests
const userRequests = {};

// Start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `
🎥 **YouTube Video Downloader**

Send me a YouTube URL and I'll download it for you!

**Supported formats:**
📹 Video (MP4)
🎵 Audio (MP3)

**Commands:**
/start - Show this message
/help - Get help
/formats - Show available formats

**Just send a YouTube link!** 🎯
  `;

  bot.sendMessage(chatId, welcomeMessage, {
    parse_mode: 'Markdown'
  });
});

// Help command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `
**How to use:**
1. Copy YouTube video URL
2. Send it to this bot
3. Choose format (Video/Audio)
4. Download your file!

**Example URLs:**
https://www.youtube.com/watch?v=VIDEO_ID
https://youtu.be/VIDEO_ID
https://www.youtube.com/shorts/VIDEO_ID

**Limits:**
• Max video length: 30 minutes
• File size limit: 50MB (Telegram limit)
  `;

  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// Handle YouTube URLs
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Skip if it's a command
  if (text?.startsWith('/')) return;

  // Check if message contains YouTube URL
  const youtubeUrl = extractYouTubeUrl(text);
  
  if (youtubeUrl) {
    try {
      await handleYouTubeUrl(chatId, youtubeUrl, msg.message_id);
    } catch (error) {
      console.error('URL handling error:', error);
      bot.sendMessage(chatId, '❌ Error processing YouTube URL. Please try again.');
    }
  }
});

// Extract YouTube URL from message
function extractYouTubeUrl(text) {
  const youtubeRegex = /(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
  const match = text.match(youtubeRegex);
  return match ? match[0] : null;
}

// Handle YouTube URL
async function handleYouTubeUrl(chatId, url, messageId) {
  try {
    // Validate YouTube URL
    if (!ytdl.validateURL(url)) {
      return bot.sendMessage(chatId, '❌ Invalid YouTube URL. Please send a valid YouTube link.');
    }

    // Get video info
    const info = await ytdl.getInfo(url);
    const videoDetails = info.videoDetails;
    
    // Check video duration (30 minutes limit)
    const duration = parseInt(videoDetails.lengthSeconds);
    if (duration > 1800) { // 30 minutes
      return bot.sendMessage(chatId, '❌ Video is too long (max 30 minutes).');
    }

    // Show format selection buttons
    const title = videoDetails.title;
    const thumbnail = videoDetails.thumbnails[0].url;

    const options = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📹 Download Video (MP4)', callback_data: `video_${url}` },
            { text: '🎵 Download Audio (MP3)', callback_data: `audio_${url}` }
          ],
          [
            { text: '📊 Video Info', callback_data: `info_${url}` }
          ]
        ]
      }
    };

    // Send video info with buttons
    const message = `
🎬 **${title}**

📊 **Info:**
⏱️ Duration: ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}
👀 Views: ${parseInt(videoDetails.viewCount).toLocaleString()}
📅 Published: ${new Date(videoDetails.publishDate).toLocaleDateString()}

Choose download format:
    `;

    // Send thumbnail if available
    if (thumbnail) {
      await bot.sendPhoto(chatId, thumbnail, {
        caption: message,
        parse_mode: 'Markdown',
        reply_markup: options.reply_markup
      });
    } else {
      await bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: options.reply_markup
      });
    }

  } catch (error) {
    console.error('Video info error:', error);
    bot.sendMessage(chatId, '❌ Error getting video information. Please try another video.');
  }
}

// Handle button callbacks
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const data = callbackQuery.data;

  try {
    if (data.startsWith('video_')) {
      const url = data.replace('video_', '');
      await downloadVideo(chatId, url, 'video');
    } else if (data.startsWith('audio_')) {
      const url = data.replace('audio_', '');
      await downloadVideo(chatId, url, 'audio');
    } else if (data.startsWith('info_')) {
      const url = data.replace('info_', '');
      await showVideoInfo(chatId, url);
    }
    
    bot.answerCallbackQuery(callbackQuery.id);
  } catch (error) {
    console.error('Callback error:', error);
    bot.answerCallbackQuery(callbackQuery.id, { text: 'Download error!' });
  }
});

// Download video function
async function downloadVideo(chatId, url, format) {
  try {
    // Send "processing" message
    const processingMsg = await bot.sendMessage(chatId, '⏳ Processing your download...');

    const info = await ytdl.getInfo(url);
    const title = info.videoDetails.title;
    const safeTitle = title.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 50);
    
    const filename = `${safeTitle}.${format === 'video' ? 'mp4' : 'mp3'}`;
    const filepath = `/tmp/${filename}`;

    if (format === 'video') {
      // Download video
      const video = ytdl(url, { quality: 'highest' });
      
      video.pipe(fs.createWriteStream(filepath))
        .on('finish', async () => {
          await bot.sendVideo(chatId, filepath, {
            caption: `📹 ${title}`
          });
          await bot.deleteMessage(chatId, processingMsg.message_id);
          
          // Clean up file
          fs.unlinkSync(filepath);
        })
        .on('error', async (error) => {
          console.error('Video download error:', error);
          await bot.editMessageText('❌ Error downloading video.', {
            chat_id: chatId,
            message_id: processingMsg.message_id
          });
        });

    } else if (format === 'audio') {
      // Download audio
      const audio = ytdl(url, { quality: 'highestaudio' });
      
      ffmpeg(audio)
        .audioBitrate(128)
        .save(filepath)
        .on('end', async () => {
          await bot.sendAudio(chatId, filepath, {
            title: title,
            performer: 'YouTube'
          });
          await bot.deleteMessage(chatId, processingMsg.message_id);
          
          // Clean up file
          fs.unlinkSync(filepath);
        })
        .on('error', async (error) => {
          console.error('Audio download error:', error);
          await bot.editMessageText('❌ Error downloading audio.', {
            chat_id: chatId,
            message_id: processingMsg.message_id
          });
        });
    }

  } catch (error) {
    console.error('Download error:', error);
    bot.sendMessage(chatId, '❌ Download failed. Please try again.');
  }
}

// Show video info
async function showVideoInfo(chatId, url) {
  try {
    const info = await ytdl.getInfo(url);
    const videoDetails = info.videoDetails;
    
    const message = `
📊 **Video Information**

🎬 **Title:** ${videoDetails.title}
👤 **Author:** ${videoDetails.author.name}
⏱️ **Duration:** ${Math.floor(videoDetails.lengthSeconds / 60)}:${(videoDetails.lengthSeconds % 60).toString().padStart(2, '0')}
👀 **Views:** ${parseInt(videoDetails.viewCount).toLocaleString()}
📅 **Published:** ${new Date(videoDetails.publishDate).toLocaleDateString()}
📝 **Description:** ${videoDetails.description.substring(0, 200)}...
    `;

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Info error:', error);
    bot.sendMessage(chatId, '❌ Error getting video information.');
  }
}

// Error handling
bot.on('polling_error', (error) => {
  console.log(`❌ Polling error: ${error}`);
});

bot.on('error', (error) => {
  console.log(`❌ Bot error: ${error}`);
});

console.log('✅ YouTube Downloader Bot Started!');
