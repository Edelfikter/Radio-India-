const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');

const MAX_MESSAGES = 50;
const RATE_LIMIT_MS = 2000;

const chatHistory = [];
const lastMessageTime = new Map(); // userId -> timestamp

function setupSocket(io) {
    io.on('connection', (socket) => {
        // Send chat history on connect
        socket.emit('chat:history', chatHistory);

        // Auth from handshake
        let user = null;
        const token = socket.handshake.auth && socket.handshake.auth.token;
        if (token) {
            try {
                user = jwt.verify(token, JWT_SECRET);
            } catch (e) {
                // anonymous
            }
        }

        // Station room management
        socket.on('station:join', (stationId) => {
            socket.join(`station:${stationId}`);
            // Broadcast updated listener count
            const room = io.sockets.adapter.rooms.get(`station:${stationId}`);
            const count = room ? room.size : 0;
            io.to(`station:${stationId}`).emit('station:listeners', { stationId, count });
        });

        socket.on('station:leave', (stationId) => {
            socket.leave(`station:${stationId}`);
            const room = io.sockets.adapter.rooms.get(`station:${stationId}`);
            const count = room ? room.size : 0;
            io.to(`station:${stationId}`).emit('station:listeners', { stationId, count });
        });

        socket.on('disconnect', () => {
            // Update listener counts for all rooms this socket was in
            for (const roomName of socket.rooms) {
                if (roomName.startsWith('station:')) {
                    const stationId = roomName.split(':')[1];
                    const room = io.sockets.adapter.rooms.get(roomName);
                    const count = room ? room.size : 0;
                    io.to(roomName).emit('station:listeners', { stationId, count });
                }
            }
        });

        // Chat message
        socket.on('chat:message', (data) => {
            if (!user) {
                socket.emit('chat:error', { error: 'Must be logged in to send messages' });
                return;
            }

            const now = Date.now();
            const last = lastMessageTime.get(user.id) || 0;
            if (now - last < RATE_LIMIT_MS) {
                socket.emit('chat:error', { error: 'Rate limit: 1 message per 2 seconds' });
                return;
            }

            const text = typeof data === 'string' ? data : (data && data.text) || '';
            if (!text || !text.trim()) return;

            const msg = {
                username: user.username,
                text: text.trim().slice(0, 280),
                timestamp: new Date().toISOString()
            };

            lastMessageTime.set(user.id, now);
            chatHistory.push(msg);
            if (chatHistory.length > MAX_MESSAGES) chatHistory.shift();

            io.emit('chat:broadcast', msg);
        });
    });
}

module.exports = { setupSocket };
