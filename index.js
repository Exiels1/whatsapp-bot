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

    const lower = body.toLowerCase();

    if (lower === 'hi') {
      await sock.sendMessage(from, { text: 'Hey 👋,' });
    } else if (lower.includes('exiels')) {
      await sock.sendMessage(from, { text: 'Exiels dey run this world 🌩' });
    } else {
      await sock.sendMessage(from, { text: 'You said: ${body} 🤖' });
    }
  });
}

startSock();