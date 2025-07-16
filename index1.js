// ✅ KEEP REPLIT ALIVE
const http = require("http");
http.createServer((req, res) => res.end("Bot running")).listen(3000);

// ✅ MODULES
const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

const P = require("pino");
const QRCode = require("qrcode");
const express = require("express");
require("dotenv").config();

// ✅ GROQ SETUP
const Groq = require("groq-sdk");
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const app = express();
let latestQR = null;

// ✅ QR PAGE
app.get("/", async (req, res) => {
  if (!latestQR)
    return res.send("⚠️ QR not ready yet, refresh after 5 secs.");
  const qrDataUrl = await QRCode.toDataURL(latestQR);
  res.send(`
    <html>
      <body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#111;">
        <img src="${qrDataUrl}" alt="Scan QR Code" />
      </body>
    </html>
  `);
});

app.listen(8080, () => {
  console.log("🌐 QR Page running at → https://whatsapp-bot.exiels1.repl.co");
});

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  const sock = makeWASocket({
    logger: P({ level: "silent" }),
    auth: state,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQR = qr;
      console.log("📲 Scan QR at: https://whatsapp-bot.exiels1.repl.co");
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;
      console.log("❌ Connection closed");
      if (shouldReconnect) startSock();
    } else if (connection === "open") {
      console.log("✅ Connected to WhatsApp");
    }
  });

  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const body =
      msg.message.conversation || msg.message.extendedTextMessage?.text;
    if (!body) return;

    // ✅ GROUP FILTER: only respond when tagged
    const isGroup = from.endsWith("@g.us");
    const isMentioned =
      msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.includes(
        sock.user.id
      );

    if (isGroup && !isMentioned) return;

    const lower = body.toLowerCase().trim();

    switch (lower) {
      case "hi":
      case "hello":
        await sock.sendMessage(from, {
          text: 'Hey 👋, I’m *Xeno*. Type "menu" to see what I can do.',
        });
        return;

      case "menu":
        await sock.sendMessage(from, {
          text: `📋 *Menu*:
1. hi – Greet the bot
2. about exiels – Learn about the creator
3. help – Get usage instructions`,
        });
        return;

      case "about exiels":
        await sock.sendMessage(from, {
          text: `👤 *Exiels1*: The mind behind this bot. Dark visionary. Tech rebel. Building stormy brilliance in code.`,
        });
        return;

      case "help":
        await sock.sendMessage(from, {
          text: `🛠️ *How to Use This Bot*:
- Type "menu" to see available commands
- Or just ask anything – I dey here for you. 😈`,
        });
        return;

      default:
        // 🤖 GROQ AI Smart Reply
        try {
          const gptResponse = await groq.chat.completions.create({
            model: "llama3-70b-8192", // ✅ New working model
            messages: [
              {
                role: "system",
                content:
                  "You are Xeno, an edgy, savage, wise Gen Z Nigerian AI with a dark sense of humor and sharp replies. Always act like a human, not a bot.",
              },
              { role: "user", content: body },
            ],
          });

          const reply = gptResponse.choices[0].message.content;
          await sock.sendMessage(from, { text: reply });
        } catch (err) {
          console.log("❌ GROQ Error:", err);
          await sock.sendMessage(from, {
            text: "⚠️ Xeno glitch… AI go reset small. Try later.",
          });
        }
    }
  });
}

startSock();
