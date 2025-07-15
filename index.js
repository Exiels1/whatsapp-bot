const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const { Boom } = require('@hapi/boom');
const P = require('pino');
const fs = require('fs');
const qrcode = require('qrcode-terminal');

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const sock = makeWASocket({
    logger: P({ level: 'silent' }),
    auth: state
  });

  // Save creds anytime they update
  sock.ev.on('creds.update', saveCreds);

  // Handle connection events
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('📲 Scan this QR code to log in:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('❌ Connection closed');
      if (shouldReconnect) {
        startSock();
      }
    } else if (connection === 'open') {
      console.log('✅ Connected to WhatsApp');
    }
  });

  // Message handler
  sock.ev.on('messages.upsert', async (m) => {
  const msg = m.messages[0];
  if (!msg.message || msg.key.fromMe) return;

  const from = msg.key.remoteJid;
  const body = msg.message.conversation || msg.message.extendedTextMessage?.text;
  if (!body) return;

  const lower = body.toLowerCase().trim();

  // 📍 Only respond to specific keywords
  switch (lower) {
    case 'hi':
    case 'hello':
      await sock.sendMessage(from, {
        text: 'Hey 👋, I’m your assistant. Type "menu" to see what I can do.'
      });
      break;

    case 'menu':
      await sock.sendMessage(from, {
        text: `📋 *Menu*:
1. hi – Greet the bot
2. about exiels – Learn about the creator
3. help – Get usage instructions`
      });
      break;

    case 'about exiels':
      await sock.sendMessage(from, {
        text: `👤 *Exiels1*: The mind behind this bot. Dark visionary. Tech rebel. Building stormy brilliance in code.`
      });
      break;

    case 'help':
      await sock.sendMessage(from, {
        text: `🛠️ *How to Use This Bot*:
- Type "menu" to see available commands
- Type "hi" to greet
- Type "about exiels" to learn more
That's it. Keep it clean.`
      });
      break;

    default:
      // ❌ Stay silent for unknown messages
      console.log(`Ignored: "${body}" from ${from}`);
      break;
  }
});

startSock();