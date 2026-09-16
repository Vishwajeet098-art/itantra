require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const webpush = require('web-push');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// ── Dirs ───────────────────────────────────────────────────────────────────────
const AUDIO_DIR = path.join(__dirname, 'uploads', 'audio');
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

// ── Web Push ───────────────────────────────────────────────────────────────────
webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:admin@itantra.local',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// ── Multer ─────────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AUDIO_DIR),
  filename: (_req, _file, cb) => cb(null, `${uuidv4()}.webm`),
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) cb(null, true);
    else cb(new Error('Audio files only'));
  },
});

// ── App ────────────────────────────────────────────────────────────────────────
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 20000,
  pingInterval: 10000,
});

app.use(cors());
app.use(express.json());

// ── In-memory stores ──────────────────────────────────────────────────────────
const { loadDB, saveDB } = require('./persistence');

// ── Shared Production Database ───────────────────────────────────────────────
const db = loadDB();
const users = db.users;
const phoneIndex = db.phoneIndex;
const rooms = db.rooms;
const pushSubs = db.pushSubs;
const sosEvents = db.sosEvents;

// Wrapper to save on changes
const persist = () => saveDB({ users, phoneIndex, rooms, pushSubs, sosEvents });

// ── Helpers ────────────────────────────────────────────────────────────────────
function normalizePhone(p) {
  return (p || '').replace(/\D/g, '');
}
function generateCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join('');
}
function getHost(req) {
  const h = req.headers['x-forwarded-host'] || req.headers.host || '10.203.71.75:3001';
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${h}`;
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: 'ok' });
});

// ── User registration ──────────────────────────────────────────────────────────
app.post('/api/users/register', (req, res) => {
  const { phone, displayName } = req.body;
  const norm = normalizePhone(phone);
  if (!norm || norm.length < 10) return res.status(400).json({ error: 'Invalid phone number.' });
  if (!displayName?.trim()) return res.status(400).json({ error: 'Display name required.' });

  let userId = phoneIndex[norm];
  if (!userId) {
    userId = uuidv4();
    phoneIndex[norm] = userId;
    users[userId] = { userId, displayName: displayName.trim(), createdAt: Date.now() };
    console.log(`[User] Registered: ${displayName} (${userId})`);
  } else {
    // Update name if re-registering
    users[userId].displayName = displayName.trim();
  }
  res.json({ userId, displayName: users[userId].displayName });
});

// ── User search (returns name + userId, NEVER the phone number) ───────────────
app.get('/api/users/search', (req, res) => {
  const norm = normalizePhone(req.query.phone);
  if (!norm || norm.length < 10) return res.status(400).json({ error: 'Invalid phone.' });
  const userId = phoneIndex[norm];
  if (!userId) return res.status(404).json({ error: 'No user found with that number. Ask them to register on iTantra first.' });
  const u = users[userId];
  res.json({ userId: u.userId, displayName: u.displayName }); // phone never returned
});

// ── Create private room between two users ─────────────────────────────────────
app.post('/api/rooms/create', (req, res) => {
  const { userId, peerId } = req.body;
  if (!users[userId] || !users[peerId]) return res.status(400).json({ error: 'Invalid user IDs.' });
  let code;
  do { code = generateCode(); } while (rooms[code]);
  rooms[code] = {
    members: new Set([userId, peerId]),
    sockets: {},
    createdAt: Date.now(),
    messages: [],
  };
  console.log(`[Room] ${code} created for ${users[userId].displayName} ↔ ${users[peerId].displayName}`);
  res.json({ code, peerName: users[peerId].displayName });
});

// ── Voice upload (auth: must be room member) ───────────────────────────────────
app.post('/api/voice/upload', upload.single('audio'), async (req, res) => {
  try {
    const { roomCode, userId, duration } = req.body;
    const room = rooms[roomCode];
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (!room.members.has(userId)) return res.status(403).json({ error: 'Not a member of this room.' });
    if (!req.file) return res.status(400).json({ error: 'No audio file received.' });

    const msgId = uuidv4();
    const audioUrl = `${getHost(req)}/audio/${req.file.filename}?room=${roomCode}&uid=${userId}`;
    const msg = {
      id: msgId,
      type: 'voice',
      senderId: userId,
      senderName: users[userId]?.displayName || 'Unknown',
      audioFilename: req.file.filename,
      audioUrl,
      duration: parseFloat(duration) || 0,
      timestamp: new Date().toISOString(),
    };
    room.messages.push(msg);
    console.log(`[Voice] ${msg.senderName} in room ${roomCode}: ${req.file.filename}`);

    // Deliver via socket to peer(s) in room
    for (const [memberId, sockId] of Object.entries(room.sockets)) {
      if (memberId !== userId && sockId) {
        io.to(sockId).emit('receive_voice', msg);
      }
    }

    // Push notification if peer is offline
    for (const memberId of room.members) {
      if (memberId !== userId && !room.sockets[memberId]) {
        const subs = pushSubs[memberId] || [];
        const payload = JSON.stringify({
          type: 'VOICE_MESSAGE',
          senderName: msg.senderName,
          roomCode,
          audioUrl,
          url: `/room?code=${roomCode}`,
        });
        for (const { subscription } of subs) {
          webpush.sendNotification(subscription, payload).catch(e =>
            console.error('[Push]', e.message)
          );
        }
      }
    }

    res.json({ success: true, msgId, audioUrl });
  } catch (err) {
    console.error('[Voice Upload Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Serve audio with room membership check ─────────────────────────────────────
app.get('/audio/:filename', (req, res) => {
  const { room: roomCode, uid: userId } = req.query;
  const room = rooms[roomCode];
  if (!room || !room.members.has(userId)) {
    return res.status(403).json({ error: 'Access denied. Must be a room member.' });
  }
  const filePath = path.join(AUDIO_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found.' });
  res.sendFile(filePath);
});

// ── VAPID public key ───────────────────────────────────────────────────────────
app.get('/api/vapid-public-key', (_req, res) =>
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY })
);

// ── Push subscribe / unsubscribe ───────────────────────────────────────────────
app.post('/api/push/subscribe', (req, res) => {
  const { subscription, userId } = req.body;
  if (!subscription || !userId) return res.status(400).json({ error: 'Missing fields.' });
  if (!pushSubs[userId]) pushSubs[userId] = [];
  const exists = pushSubs[userId].some(s => s.subscription.endpoint === subscription.endpoint);
  if (!exists) pushSubs[userId].push({ subscription });
  console.log(`[Push] Subscribed userId=${userId}`);
  res.json({ success: true });
});

app.post('/api/push/unsubscribe', (req, res) => {
  const { userId, endpoint } = req.body;
  if (pushSubs[userId]) {
    pushSubs[userId] = pushSubs[userId].filter(s => s.subscription.endpoint !== endpoint);
  }
  res.json({ success: true });
});

// ── Translation ────────────────────────────────────────────────────────────────
app.post('/api/translate', async (req, res) => {
  try {
    const { text, sourceLang, targetLang } = req.body;
    if (!text || !targetLang) return res.status(400).json({ error: 'Missing fields.' });
    const source = sourceLang ? sourceLang.split('-')[0] : 'auto';
    const target = targetLang.split('-')[0];
    const { translate } = await import('google-translate-api-x');
    const result = await translate(text, { from: source, to: target });
    res.json({ translatedText: result.text });
  } catch (e) {
    res.status(500).json({ error: 'Translation failed.' });
  }
});

// ── SOS (text/location) ────────────────────────────────────────────────────────
app.post('/api/sos', (req, res) => {
  const { userId, contactName, contactEmail, contactPhone, location, message } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId.' });
  const ev = { id: Date.now().toString(), userId, contactName, contactEmail, contactPhone,
    location: location || null, message: message || 'SOS', timestamp: new Date().toISOString(), status: 'received' };
  sosEvents.push(ev);
  console.log(`[SOS]`, ev);
  res.json({ success: true, eventId: ev.id });
});

app.post('/api/sos/cancel', (req, res) => {
  const ev = sosEvents.find(e => e.id === req.body.eventId);
  if (ev) ev.status = 'cancelled';
  res.json({ success: true });
});

// ── SOS Voice upload ───────────────────────────────────────────────────────────
app.post('/api/sos/voice', upload.single('audio'), async (req, res) => {
  try {
    const { senderId, senderName, contactId, contactName, location, message } = req.body;
    if (!req.file || !contactId) return res.status(400).json({ error: 'Missing audio or contactId.' });
    const audioUrl = `${getHost(req)}/audio-sos/${req.file.filename}`;

    // For SOS audio, serve without room check
    const ev = { id: uuidv4(), senderId, senderName, contactId, contactName,
      audioUrl, location: location ? JSON.parse(location) : null, message: message || 'SOS voice',
      timestamp: new Date().toISOString(), status: 'received' };
    sosEvents.push(ev);

    const subs = pushSubs[contactId] || [];
    let pushSent = 0;
    const payload = JSON.stringify({ type: 'SOS_VOICE', senderName, audioUrl, eventId: ev.id, url: '/sos' });
    await Promise.all(subs.map(async ({ subscription }) => {
      try { await webpush.sendNotification(subscription, payload); pushSent++; } catch {}
    }));
    res.json({ success: true, eventId: ev.id, audioUrl, pushSent, note: subs.length === 0
      ? 'No push subscriptions for this contact yet.'
      : `Push sent to ${pushSent}/${subs.length} devices.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve SOS audio without auth (contact-based, not room-based)
app.use('/audio-sos', express.static(AUDIO_DIR));

// ── Health ─────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', users: Object.keys(users).length, rooms: Object.keys(rooms).length })
);

// ── Socket.IO ──────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] ${socket.id}`);

  // Join room as authenticated user
  socket.on('join_room', ({ code, userId }) => {
    const room = rooms[code];
    if (!room) { socket.emit('join_error', { message: `Room "${code}" not found.` }); return; }
    if (!room.members.has(userId)) { socket.emit('join_error', { message: 'Not a member of this room.' }); return; }
    if (!users[userId]) { socket.emit('join_error', { message: 'User not registered.' }); return; }

    socket.join(code);
    socket.data.userId = userId;
    socket.data.room = code;
    room.sockets[userId] = socket.id;

    socket.emit('room_joined', {
      code,
      displayName: users[userId].displayName,
      history: room.messages.slice(-50), // last 50 messages
    });

    // Notify peer
    for (const [mid, sid] of Object.entries(room.sockets)) {
      if (mid !== userId && sid) io.to(sid).emit('peer_online', { displayName: users[userId].displayName });
    }
    console.log(`[Room ${code}] ${users[userId].displayName} joined`);
  });

  // Text message (with translation)
  socket.on('send_message', async ({ text, sourceLang, targetLang }) => {
    const code = socket.data.room;
    const userId = socket.data.userId;
    const room = rooms[code];
    if (!room || !userId) return;

    const msg = {
      id: uuidv4(),
      type: 'text',
      senderId: userId,
      senderName: users[userId]?.displayName || 'User',
      original: text,
      translated: text,
      sourceLang,
      targetLang,
      timestamp: new Date().toISOString(),
    };

    try {
      if (sourceLang !== targetLang) {
        const { translate } = await import('google-translate-api-x');
        const result = await translate(text, { from: sourceLang.split('-')[0], to: targetLang.split('-')[0] });
        msg.translated = result.text;
      }
    } catch {}

    room.messages.push(msg);

    // Echo confirmed to sender
    socket.emit('message_confirmed', msg);

    // Deliver to peer(s)
    for (const [mid, sid] of Object.entries(room.sockets)) {
      if (mid !== userId && sid) io.to(sid).emit('receive_message', msg);
    }

    // Push to offline peers
    for (const memberId of room.members) {
      if (memberId !== userId && !room.sockets[memberId]) {
        const subs = pushSubs[memberId] || [];
        const payload = JSON.stringify({
          type: 'TEXT_MESSAGE',
          senderName: msg.senderName,
          body: text.substring(0, 80),
          roomCode: code,
          url: `/room?code=${code}`,
        });
        for (const { subscription } of subs) {
          webpush.sendNotification(subscription, payload).catch(() => {});
        }
      }
    }
  });

  socket.on('send_sos', ({ location }) => {
    const code = socket.data.room;
    const userId = socket.data.userId;
    const room = rooms[code];
    if (!room || !userId) return;

    const ev = { id: uuidv4(), senderId: userId, senderName: users[userId]?.displayName || 'User', location, timestamp: new Date().toISOString() };
    sosEvents.push(ev);
    console.log(`[SOS Room ${code}] from ${ev.senderName}`);

    // Deliver to peers
    for (const [mid, sid] of Object.entries(room.sockets)) {
      if (mid !== userId && sid) io.to(sid).emit('receive_sos', ev);
    }
  });

  socket.on('disconnect', () => {
    const code = socket.data.room;
    const userId = socket.data.userId;
    if (!code || !rooms[code] || !userId) return;
    rooms[code].sockets[userId] = null;
    for (const [mid, sid] of Object.entries(rooms[code].sockets)) {
      if (mid !== userId && sid) {
        io.to(sid).emit('peer_offline', { displayName: users[userId]?.displayName });
      }
    }
    console.log(`[Room ${code}] ${users[userId]?.displayName} disconnected`);
  });

  socket.on('leave_room', () => socket.disconnect(true));
});

// Cleanup stale rooms
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of Object.entries(rooms)) {
    if (now - room.createdAt > 2 * 60 * 60 * 1000) {
      // Delete audio files
      for (const m of room.messages) {
        if (m.audioFilename) {
          const fp = path.join(AUDIO_DIR, m.audioFilename);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        }
      }
      delete rooms[code];
      console.log(`[Room] Expired: ${code}`);
    }
  }
}, 30 * 60 * 1000);

// Continuous DB persistence
setInterval(persist, 2000);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   http://10.203.71.75:${PORT}\n`);
});
