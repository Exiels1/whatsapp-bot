import makeWASocket from '@whiskeysockets/baileys';
import {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';

import * as fs from 'fs';
import * as path from 'path';
import P from 'pino';

const startSock = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    printQRInTerminal: true,
    auth: state,
    logger: P({ level: 'silent' })
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log('Disconnected. Reason:', reason);
      if (reason !== DisconnectReason.loggedOut) {
        startSock(); // reconnect
      }
    } else if (connection === 'open') {
      console.log('✅ Connected to WhatsApp as', sock.user.name);
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text;

    if (messageContent?.toLowerCase() === 'tagall') {
      const metadata = await sock.groupMetadata(sender);
      const participants = metadata.participants.map(p => p.id);
      const mentions = participants;

      const tagMsg = participants.map(p => `@${p.split('@')[0]}`).join(' ');
      await sock.sendMessage(sender, { text: tagMsg, mentions });
    }
  });
};

startSock();
