'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const path = require('path');
const https = require('https');

const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET environment variable must be set in production');
    process.exit(1);
  }
  console.warn('WARNING: Using default JWT secret. Set JWT_SECRET env var for production.');
  return 'radio-india-dev-secret-do-not-use-in-prod';
})();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

app.use('/api/', generalLimiter);
app.use('/api/auth/', authLimiter);

// ─── Auth helpers ─────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── Auth routes ──────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  if (username.length < 3 || username.length > 32) return res.status(400).json({ error: 'username must be 3–32 chars' });
  if (password.length < 6) return res.status(400).json({ error: 'password must be ≥6 chars' });
  const hash = await bcrypt.hash(password, 10);
  try {
    const row = db.prepare('INSERT INTO users (username, password_hash) VALUES (?,?) RETURNING id, username').get(username, hash);
    const token = jwt.sign({ id: row.id, username: row.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, id: row.id, username: row.username });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username taken' });
    throw e;
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, id: user.id, username: user.username });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username });
});

// ─── Station routes ───────────────────────────────────────────────────────────
app.get('/api/stations', (req, res) => {
  const stations = db.prepare(`
    SELECT s.*, u.username,
      (SELECT COUNT(*) FROM segments WHERE station_id = s.id) AS segment_count
    FROM stations s JOIN users u ON s.user_id = u.id
    ORDER BY s.created_at DESC
  `).all();
  res.json(stations);
});

app.post('/api/stations', requireAuth, (req, res) => {
  const { name, description, lat, lng, loop, fade_ms } = req.body || {};
  if (!name || lat == null || lng == null) return res.status(400).json({ error: 'name, lat, lng required' });
  const count = db.prepare('SELECT COUNT(*) as n FROM stations WHERE user_id = ?').get(req.user.id).n;
  if (count >= 3) return res.status(403).json({ error: 'Max 3 stations per user' });
  const row = db.prepare(
    'INSERT INTO stations (user_id, name, description, lat, lng, loop, fade_ms) VALUES (?,?,?,?,?,?,?) RETURNING *'
  ).get(req.user.id, name, description || '', lat, lng, loop ? 1 : 0, fade_ms || 0);
  res.status(201).json(row);
});

app.get('/api/stations/:id', (req, res) => {
  const station = db.prepare('SELECT s.*, u.username FROM stations s JOIN users u ON s.user_id = u.id WHERE s.id = ?').get(req.params.id);
  if (!station) return res.status(404).json({ error: 'Not found' });
  const segments = db.prepare('SELECT * FROM segments WHERE station_id = ? ORDER BY position').all(req.params.id);
  res.json({ ...station, segments });
});

app.patch('/api/stations/:id', requireAuth, (req, res) => {
  const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(req.params.id);
  if (!station) return res.status(404).json({ error: 'Not found' });
  if (station.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  if (station.is_live) return res.status(409).json({ error: 'Stop broadcast first' });
  const { name, description, lat, lng, loop, fade_ms } = req.body || {};
  db.prepare('UPDATE stations SET name=COALESCE(?,name), description=COALESCE(?,description), lat=COALESCE(?,lat), lng=COALESCE(?,lng), loop=COALESCE(?,loop), fade_ms=COALESCE(?,fade_ms) WHERE id=?')
    .run(name, description, lat, lng, loop != null ? (loop ? 1 : 0) : null, fade_ms, req.params.id);
  res.json(db.prepare('SELECT * FROM stations WHERE id = ?').get(req.params.id));
});

app.delete('/api/stations/:id', requireAuth, (req, res) => {
  const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(req.params.id);
  if (!station) return res.status(404).json({ error: 'Not found' });
  if (station.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  if (station.is_live) return res.status(409).json({ error: 'Stop broadcast first' });
  db.prepare('DELETE FROM stations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Broadcast control ────────────────────────────────────────────────────────
app.post('/api/stations/:id/live', requireAuth, (req, res) => {
  const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(req.params.id);
  if (!station) return res.status(404).json({ error: 'Not found' });
  if (station.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  const segs = db.prepare('SELECT * FROM segments WHERE station_id = ? ORDER BY position').all(req.params.id);
  if (!segs.length) return res.status(409).json({ error: 'No segments' });
  const now = Date.now();
  db.prepare('UPDATE stations SET is_live=1, broadcast_start=? WHERE id=?').run(now, req.params.id);
  io.emit('station:update', { id: Number(req.params.id), is_live: 1 });
  res.json({ ok: true, broadcast_start: now });
});

app.post('/api/stations/:id/stop', requireAuth, (req, res) => {
  const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(req.params.id);
  if (!station) return res.status(404).json({ error: 'Not found' });
  if (station.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('UPDATE stations SET is_live=0, broadcast_start=NULL WHERE id=?').run(req.params.id);
  io.emit('station:update', { id: Number(req.params.id), is_live: 0 });
  res.json({ ok: true });
});

app.get('/api/stations/:id/now', (req, res) => {
  const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(req.params.id);
  if (!station) return res.status(404).json({ error: 'Not found' });
  if (!station.is_live) return res.json({ is_live: false });
  const segs = db.prepare('SELECT * FROM segments WHERE station_id = ? ORDER BY position').all(req.params.id);
  const total_ms = segs.reduce((s, g) => s + g.duration_ms, 0);
  if (!total_ms) return res.json({ is_live: true, position_ms: 0, segment: null });
  const elapsed = Date.now() - station.broadcast_start;
  const position_ms = station.loop ? elapsed % total_ms : Math.min(elapsed, total_ms);
  let acc = 0;
  let current = null;
  for (const seg of segs) {
    if (position_ms < acc + seg.duration_ms) {
      current = { ...seg, offset_ms: position_ms - acc };
      break;
    }
    acc += seg.duration_ms;
  }
  res.json({ is_live: true, position_ms, total_ms, segment: current });
});

// ─── Segment routes ───────────────────────────────────────────────────────────
app.post('/api/stations/:id/segments', requireAuth, (req, res) => {
  const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(req.params.id);
  if (!station) return res.status(404).json({ error: 'Not found' });
  if (station.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  if (station.is_live) return res.status(409).json({ error: 'Stop broadcast first' });
  const { type, video_id, title, duration_ms, start_ms, end_ms, tts_text, fade_in_ms, fade_out_ms } = req.body || {};
  if (!type) return res.status(400).json({ error: 'type required' });
  const maxPos = db.prepare('SELECT COALESCE(MAX(position)+1,0) as p FROM segments WHERE station_id=?').get(req.params.id).p;
  const seg = db.prepare(
    'INSERT INTO segments (station_id, position, type, video_id, title, duration_ms, start_ms, end_ms, tts_text, fade_in_ms, fade_out_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING *'
  ).get(req.params.id, maxPos, type, video_id || null, title || '', duration_ms || 0, start_ms || 0, end_ms || null, tts_text || null, fade_in_ms || 0, fade_out_ms || 0);
  res.status(201).json(seg);
});

app.delete('/api/stations/:sid/segments/:id', requireAuth, (req, res) => {
  const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(req.params.sid);
  if (!station) return res.status(404).json({ error: 'Not found' });
  if (station.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  if (station.is_live) return res.status(409).json({ error: 'Stop broadcast first' });
  db.prepare('DELETE FROM segments WHERE id = ? AND station_id = ?').run(req.params.id, req.params.sid);
  res.json({ ok: true });
});

app.put('/api/stations/:sid/segments/reorder', requireAuth, (req, res) => {
  const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(req.params.sid);
  if (!station) return res.status(404).json({ error: 'Not found' });
  if (station.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  if (station.is_live) return res.status(409).json({ error: 'Stop broadcast first' });
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order[] required' });
  const update = db.prepare('UPDATE segments SET position=? WHERE id=? AND station_id=?');
  const tx = db.transaction((ids) => ids.forEach((id, i) => update.run(i, id, req.params.sid)));
  tx(order);
  res.json({ ok: true });
});

// ─── YouTube validation proxy ─────────────────────────────────────────────────
app.get('/api/youtube/validate', requireAuth, (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });
  const match = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (!match) return res.status(400).json({ error: 'Invalid YouTube URL' });
  const videoId = match[1];
  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  https.get(oembedUrl, (r) => {
    let data = '';
    r.on('data', (c) => { data += c; });
    r.on('end', () => {
      if (r.statusCode !== 200) return res.status(400).json({ error: 'Video not embeddable or not found' });
      try {
        const info = JSON.parse(data);
        res.json({ video_id: videoId, title: info.title });
      } catch {
        res.status(500).json({ error: 'Parse error' });
      }
    });
  }).on('error', () => res.status(502).json({ error: 'Could not reach YouTube' }));
});

// ─── Tile proxy ───────────────────────────────────────────────────────────────
// Proxies CartoDB Dark Matter tiles through the local server.
// This avoids CDN connectivity issues and firewalled environments.
// Falls back to a local dark tile image when the upstream is unreachable.
const CARTO_SUBDOMAINS = ['a', 'b', 'c', 'd'];
const DARK_TILE_PATH   = path.join(__dirname, 'public', 'dark-tile.png');
let tileRoundRobin = 0;

app.get('/tiles/:z/:x/:y', (req, res) => {
  const { z, x, y } = req.params;
  // Basic validation to prevent SSRF
  const zi = parseInt(z, 10);
  const xi = parseInt(x, 10);
  const yi = parseInt(y, 10);
  if (isNaN(zi) || isNaN(xi) || isNaN(yi) || zi < 0 || zi > 20 || xi < 0 || yi < 0) {
    return res.status(400).send('Bad tile coords');
  }
  const sub = CARTO_SUBDOMAINS[tileRoundRobin % CARTO_SUBDOMAINS.length];
  tileRoundRobin++;
  const tileUrl = `https://cartodb-basemaps-${sub}.global.ssl.fastly.net/dark_nolabels/${zi}/${xi}/${yi}.png`;

  const sendFallback = () => {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(DARK_TILE_PATH);
  };

  https.get(tileUrl, { headers: { 'User-Agent': 'AllIndiaPublicRadio/1.0' } }, (upstream) => {
    if (upstream.statusCode !== 200) {
      upstream.resume(); // drain response
      return sendFallback();
    }
    res.setHeader('Content-Type', upstream.headers['content-type'] || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    upstream.pipe(res);
  }).on('error', sendFallback);
});


app.get('/api/stats', (req, res) => {
  const live = db.prepare('SELECT COUNT(*) as n FROM stations WHERE is_live=1').get().n;
  const total = db.prepare('SELECT COUNT(*) as n FROM stations').get().n;
  res.json({ live_stations: live, total_stations: total, listeners: io.engine.clientsCount });
});

// ─── Socket.io chat ───────────────────────────────────────────────────────────
const HISTORY_LIMIT = 50;
const MSG_COOLDOWN_MS = 2000;
const lastMsg = new Map();

// Load history
const chatHistory = db.prepare('SELECT username, message, created_at FROM chat_messages ORDER BY id DESC LIMIT ?').all(HISTORY_LIMIT).reverse();

io.on('connection', (socket) => {
  socket.emit('chat:history', chatHistory);

  socket.on('chat:join_station', (stationId) => {
    socket.rooms.forEach((r) => { if (r !== socket.id) socket.leave(r); });
    if (stationId) socket.join(`station:${stationId}`);
    io.to(`station:${stationId}`).emit('station:listeners', io.sockets.adapter.rooms.get(`station:${stationId}`)?.size || 0);
  });

  socket.on('chat:message', (data) => {
    const { token, message } = data || {};
    let user;
    try { user = jwt.verify(token, JWT_SECRET); } catch { return; }
    const now = Date.now();
    if (lastMsg.has(user.id) && now - lastMsg.get(user.id) < MSG_COOLDOWN_MS) return;
    const msg = String(message || '').trim().slice(0, 280);
    if (!msg) return;
    lastMsg.set(user.id, now);
    const entry = { username: user.username, message: msg, created_at: Math.floor(now / 1000) };
    db.prepare('INSERT INTO chat_messages (username, message) VALUES (?,?)').run(entry.username, entry.message);
    chatHistory.push(entry);
    if (chatHistory.length > HISTORY_LIMIT) chatHistory.shift();
    io.emit('chat:message', entry);
  });

  socket.on('disconnect', () => {
    socket.rooms.forEach((r) => {
      if (r.startsWith('station:')) {
        const count = io.sockets.adapter.rooms.get(r)?.size || 0;
        io.to(r).emit('station:listeners', count);
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`All India Public Radio running on http://localhost:${PORT}`);
});
