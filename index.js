const { makeWASocket, useMultiFileAuthState, downloadMediaMessage , DisconnectReason} = require("@whiskeysockets/baileys");
const TelegramBot = require("node-telegram-bot-api");
const moment = require("moment-timezone"); // Install with npm install moment
const fs = require("fs");
const path = require("path");

// Replace with your Telegram bot token and chat ID
const TELEGRAM_BOT_TOKEN = "";
const TELEGRAM_CHANNEL_ID  = ""; // Это чтобы бот в группу сообщения отправлял
const TELEGRAM_CHAT_ID  = ""; // А это чтобы в личку

// Initialize Telegram bot
const telegramBot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

telegramBot.on('message', (msg) => {
    const chatId = msg.chat.id;

    // send a message to the chat acknowledging receipt of their message
    telegramBot.sendMessage(chatId, 'Your Chat Id' + chatId);
});

async function startWhatsApp() {
    // Load authentication state (saves login session)
    const { state, saveCreds } = await useMultiFileAuthState("auth");

    // Create a WhatsApp connection
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // Display QR code in terminal
    });

    // Save credentials when updated
    sock.ev.on("creds.update", saveCreds);

    // Listen for new messages
    sock.ev.on("messages.upsert", async ({ messages }) => {
        try {
            const msg = messages[0];

            if (!msg.key.fromMe) { // Ignore self messages
                const senderId = msg.key.remoteJid;
                const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || msg.message?.documentMessage?.caption;

                const pushName = msg.pushName

                console.log(`\n📩 New message from ${senderId}: ${messageText}`);

                // Format timestamp
                const timestamp = moment.unix(msg.messageTimestamp).tz("Asia/Yekaterinburg").format("YYYY-MM-DD HH:mm:ss");

                if (senderId === "") // тут можно указать логику для проверки того, кто отправил
                    await sendMessageToTelegram(TELEGRAM_CHANNEL_ID, `${messageText}\n\nВремя отправки: ${timestamp}`, msg);
                else
                    await sendMessageToTelegram(TELEGRAM_CHAT_ID, `${messageText}\n\nBy ${pushName}\nTime: ${timestamp}`, msg);
            }
        }
        catch (error){
            await telegramBot.sendMessage(TELEGRAM_CHAT_ID, error, { parse_mode: "Markdown" });
        }
    });

    // Fetch and print group list after connecting
    sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
        try {
            if (connection === 'close') {
                // reconnect if not logged out
                if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                    startWhatsApp()
                } else {
                    console.log('Connection closed. You are logged out.')
                    process.exit(1);
                }
            }

            if (connection === "open") {
                console.log("✅ Connected to WhatsApp!");

                const chats = await sock.groupFetchAllParticipating();
                console.log("Your WhatsApp Groups:");
                Object.values(chats).forEach((group) => {
                    console.log(`📌 ${group.subject} (ID: ${group.id})`);
                });
            }
        }
        catch (error){
            await telegramBot.sendMessage(TELEGRAM_CHAT_ID, error, { parse_mode: "Markdown" });
        }
    });
}

async function sendMessageToTelegram(chatId, textMessage, msg) {
    try {
        await telegramBot.sendMessage(chatId, textMessage, { parse_mode: "Markdown" });
        console.log(`✅ Message sent to Telegram chat ${chatId}`);

        const mediaTypes = ["imageMessage", "videoMessage", "audioMessage", "documentMessage", "stickerMessage"];
        for (let type of mediaTypes) {
            if (msg.message[type]) {
                try {
                    const buffer = await downloadMediaMessage(msg, "buffer", {});
                    const fileName = `media_${Date.now()}.${getFileExtension(type)}`;
                    const filePath = path.join(__dirname, fileName);

                    fs.writeFileSync(filePath, buffer);
                    console.log(`📂 Media saved: ${filePath}`);

                    // Send media to Telegram
                    if (type === "imageMessage") {
                        await telegramBot.sendPhoto(chatId, filePath);
                    } else if (type === "videoMessage") {
                        await telegramBot.sendVideo(chatId, filePath);
                    } else if (type === "audioMessage") {
                        await telegramBot.sendAudio(chatId, filePath);
                    } else if (type === "stickerMessage") {
                        await telegramBot.sendSticker(chatId, filePath);
                    } else {
                        await telegramBot.sendDocument(chatId, filePath);
                    }

                    // Delete the file after sending
                    setTimeout(() => fs.unlinkSync(filePath), 5000);
                } catch (error) {
                    await telegramBot.sendMessage(TELEGRAM_CHAT_ID, error, { parse_mode: "Markdown" });
                    console.error("⚠️ Failed to process media:", error);
                }
            }
        }
    } catch (error) {
        console.error(`❌ Failed to send message to Telegram:`, error);
    }
}

// Utility function to get file extensions based on type
function getFileExtension(type) {
    switch (type) {
        case "imageMessage": return "jpg";
        case "videoMessage": return "mp4";
        case "audioMessage": return "mp3";
        case "documentMessage": return "pdf";
        case "stickerMessage": return "webp";
        default: return "bin";
    }
}

// Start the bot
startWhatsApp();
