// WhatsApp bot modules
const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const { Boom } = require("@hapi/boom");
const P = require("pino");
const fs = require("fs");
const QRCode = require("qrcode");
const express = require("express");

const app = express();
let latestQR = null;

// ✅ Use Replit-compatible port
const PORT = process.env.PORT || 3000;

// Web route to show QR in browser
app.get("/", async (req, res) => {
  if (!latestQR)
    return res.send("⚠️ QR not ready yet, please refresh in a few seconds.");
  const qrDataUrl = await QRCode.toDataURL(latestQR);
  res.send(`
    <html>
      <body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#111;">
        <img src="${qrDataUrl}" alt="Scan QR Code" />
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`🌐 QR Page running at → https://whatsapp-bot.exiels1.repl.co`);
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
      console.log("📲 Visit this URL to scan your WhatsApp QR:");
      console.log("👉 https://whatsapp-bot.exiels1.repl.co");
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;
      console.log("❌ Connection closed");
      if (shouldReconnect) {
        startSock();
      }
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

    const lower = body.toLowerCase().trim();

    switch (lower) {
      case "hi":
      case "hello":
        await sock.sendMessage(from, {
          text: 'Hey 👋, I’m Xeno. Type "menu" to see what I can do.',
        });
        break;

      case "menu":
        await sock.sendMessage(from, {
          text: `📋 *Menu*:
1. hi – Greet the bot
2. about exiels – Learn about the creator
3. help – Get usage instructions`,
        });
        break;

      case "about exiels":
        await sock.sendMessage(from, {
          text: `👤 *Exiels1*: The mind behind this bot. Dark visionary. Tech rebel. Building stormy brilliance in code.`,
        });
        break;

      case "help":
        await sock.sendMessage(from, {
          text: `🛠️ *How to Use This Bot*:
- Type "menu" to see available commands
- Type "hi" to greet
- Type "about exiels" to learn more
That's it. Keep it clean.`,
        });
        break;

      default:
        console.log(`Ignored: "${body}" from ${from}`);
        break;
    }
  });
}

startSock();
