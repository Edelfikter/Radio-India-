const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

// Make io available to routes
app.set('io', io);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Rate limiters
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    standardHeaders: true,
    legacyHeaders: false
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' }
});

// Apply rate limiting to all API routes
app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/stations', require('./routes/stations'));
app.use('/api/stations/:id/segments', require('./routes/segments'));
app.use('/api/stations/:id', require('./routes/broadcast'));
app.use('/api/youtube', require('./routes/youtube'));

// Top-level segment edit/delete (convenience routes)
const segmentsRouter = require('./routes/segments');
app.use('/api/segments', segmentsRouter);

// Global stats endpoint
const db = require('./db');
app.get('/api/stats', (req, res) => {
    const stations = db.prepare('SELECT COUNT(*) as total, SUM(is_live) as live FROM stations').get();
    const users = db.prepare('SELECT COUNT(*) as total FROM users').get();
    const listeners = io.sockets.sockets.size;
    res.json({
        stations_total: stations.total,
        stations_live: stations.live || 0,
        users_total: users.total,
        listeners_online: listeners,
        server_time: new Date().toISOString()
    });
});

// Serve static TTS audio
app.use('/assets/sam-audio', express.static(path.join(__dirname, '../public/assets/sam-audio')));

// Fallback to index.html for SPA
const staticLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false
});
app.get('*', staticLimiter, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Socket.io
const { setupSocket } = require('./chat/socket');
setupSocket(io);

server.listen(PORT, () => {
    console.log(`All India Public Radio server running on port ${PORT}`);
});
