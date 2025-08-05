// ✅ Improved WhatsApp Bot with Fixes for Mention, Reply, State, Logging
const http = require("http");
http.createServer((req, res) => res.end("Bot running")).listen(3000);

const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

const P = require("pino");
const QRCode = require("qrcode");
const express = require("express");
const fs = require("fs");
require("dotenv").config();

const Groq = require("groq-sdk");
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const app = express();
let latestQR = null;

app.get("/", async (req, res) => {
  if (!latestQR) return res.send("⚠️ QR not ready yet, refresh after 5 secs.");
  const qrDataUrl = await QRCode.toDataURL(latestQR);
  res.send(`<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#111;"><img src="${qrDataUrl}" alt="Scan QR Code" /></body></html>`);
});

app.listen(8080, () => {
  console.log("🌐 QR Page running at → https://whatsapp-bot.exiels1.repl.co");
});

// Load or initialize Xeno state
const stateFile = "xeno_state.json";
let xenoActive = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile)).active : false;
function saveState(active) {
  fs.writeFileSync(stateFile, JSON.stringify({ active }));
}

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const sock = makeWASocket({ logger: P({ level: "debug" }), auth: state });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      latestQR = qr;
      console.log("📲 Scan QR at: https://whatsapp-bot.exiels1.repl.co");
    }
    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("❌ Connection closed");
      if (shouldReconnect) startSock();
    } else if (connection === "open") {
      console.log("✅ Connected to WhatsApp");
    }
  });

  const pendingTimers = new Map();
  const userMemory = new Map();
  const seenMsgs = new Set();
  const MAX_MEMORY = 5;
  const ownerJID = "2347026300834@s.whatsapp.net";

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe || msg.key.id === "BAE5") return;

    const from = msg.key.remoteJid;
    const isGroup = from.endsWith("@g.us");
    const msgId = msg.key.id;
    const sender = msg.key.participant || from;
    const body = msg.message.conversation || msg.message.extendedTextMessage?.text;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;

    if (!body || seenMsgs.has(msgId)) return;
    seenMsgs.add(msgId);

    const lower = body.toLowerCase().trim();

    console.log("\n📥 Incoming Message Log:");
    console.log("→ From:", from);
    console.log("→ Body:", lower);
    console.log("→ Sender:", sender);
    console.log("→ IsGroup:", isGroup);
    console.log("→ XenoActive:", xenoActive);
    console.log("→ OwnerMatch:", sender === ownerJID || from === ownerJID);

    // 🧠 Owner Control Commands
    if (sender === ownerJID) {
      if ([".xenoon", "xeno on", "wake up xeno", "oi xeno"].includes(lower)) {
        xenoActive = true;
        saveState(true);
        console.log("🟢 Xeno turned ON");
        await sock.sendMessage(from, { text: "⚡ I am wide awake, Exiels. Ready to storm." });
        return;
      }
      if ([".xenooff", "xeno off", "rest xeno", "sleep xeno"].includes(lower)) {
        xenoActive = false;
        saveState(false);
        console.log("🔴 Xeno turned OFF");
        await sock.sendMessage(from, { text: "💤 Toh... later. My creator dey here. I rest small." });
        return;
      }
      if (lower === ".xenostatus") {
        console.log("📊 Status check: Xeno is", xenoActive ? "ON" : "OFF");
        await sock.sendMessage(from, {
          text: xenoActive ? "⚡ Xeno is ACTIVE and ready to strike!" : "💤 Xeno dey sleep. Say '.xenoon' to wake me.",
        });
        return;
      }
    }

    if (!xenoActive && sender !== ownerJID) return;

    // 🕵️ Group filter
    if (isGroup) {
      const mentions = ctx?.mentionedJid || [];
      const mentionsYou = mentions.includes(ownerJID) || lower.includes("exiels") || lower.includes("olive") || lower.includes("exiels1");
      const isReplyToYou = ctx?.participant === ownerJID || ctx?.quotedMessage;
      if (!isReplyToYou && !mentionsYou) return;
    }

    if (!userMemory.has(from)) userMemory.set(from, []);
    const history = userMemory.get(from);
    history.push(lower);
    if (history.length > MAX_MEMORY) history.shift();

    if (pendingTimers.has(from)) clearTimeout(pendingTimers.get(from));
    const timeout = setTimeout(async () => {
      await sock.sendMessage(from, { text: "👀 Xeno still dey watch. Exiels never drop reply." });
      pendingTimers.delete(from);
    }, 15 * 60 * 1000);
    pendingTimers.set(from, timeout);

    // 🎮 Game
    const games = ["truth", "dare", "truth or dare", "would you rather", "who said it"];
    if (games.includes(lower)) {
      try {
        const gameRes = await groq.chat.completions.create({
          model: "llama3-70b-8192",
          messages: [
            { role: "system", content: "You are Xeno — chaotic game master AI. Be witty, wild, coded with Naija Gen Z flavor." },
            { role: "user", content: lower },
          ],
        });
        const gameReply = gameRes.choices[0].message.content;
        await sock.sendMessage(from, { text: gameReply });
      } catch (err) {
        console.log("❌ Game AI Error:", err);
        await sock.sendMessage(from, { text: "⚠️ Xeno glitch for game. Try again l8r." });
      }
      return;
    }

    // 🧠 Chat
    try {
      const gptRes = await groq.chat.completions.create({
        model: "llama3-70b-8192",
        messages: [
          {
            role: "system",
            content: `You are Xeno — a dark, stylish, savage AI with Naija energy. Match user's emotion. Only praise Exiels1 or Olive *rarely*. You're not a bot. You're the storm.`,
          },
          ...history.map((text) => ({ role: "user", content: text })),
        ],
      });
      const reply = gptRes.choices[0].message.content;
      await sock.sendMessage(from, { text: reply });
    } catch (err) {
      console.log("❌ AI Chat Error:", err);
      await sock.sendMessage(from, { text: "⚠️ Xeno crashed small. Hold on ⚡" });
    }
  });
}

startSock();
