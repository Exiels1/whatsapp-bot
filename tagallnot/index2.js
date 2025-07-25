import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'

const startSock = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('auth')
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe || !msg.key.remoteJid.endsWith('@g.us')) return

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text
    if (text?.toLowerCase() === 'tagall') {
      const groupMetadata = await sock.groupMetadata(msg.key.remoteJid)
      const participants = groupMetadata.participants.map(p => p.id)
      const mentions = participants

      await sock.sendMessage(msg.key.remoteJid, {
        text: '🔊 Tagging everyone:\n' + participants.map(p => `@${p.split('@')[0]}`).join(' '),
        mentions
      })
    }
  })

  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const code = (lastDisconnect?.error)?.output?.statusCode
      if (code !== DisconnectReason.loggedOut) startSock()
      else console.log('Logged out ❌')
    }
    console.log('Connection update:', connection)
  })
}

startSock()
