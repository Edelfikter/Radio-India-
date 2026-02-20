const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

// POST /api/stations/:id/live
router.post('/live', authMiddleware, (req, res) => {
    const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(req.params.id);
    if (!station) return res.status(404).json({ error: 'Station not found' });
    if (station.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your station' });

    const segCount = db.prepare('SELECT COUNT(*) as c FROM segments WHERE station_id = ?').get(req.params.id).c;
    if (segCount === 0) return res.status(400).json({ error: 'Station needs at least one segment to go live' });

    const now = new Date().toISOString();
    db.prepare('UPDATE stations SET is_live = 1, broadcast_start = ? WHERE id = ?').run(now, station.id);

    const updated = db.prepare('SELECT * FROM stations WHERE id = ?').get(station.id);
    // Notify via socket if io is attached
    if (req.app.get('io')) {
        req.app.get('io').emit('station:update', updated);
    }
    res.json(updated);
});

// POST /api/stations/:id/stop
router.post('/stop', authMiddleware, (req, res) => {
    const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(req.params.id);
    if (!station) return res.status(404).json({ error: 'Station not found' });
    if (station.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your station' });

    db.prepare('UPDATE stations SET is_live = 0, broadcast_start = NULL WHERE id = ?').run(station.id);

    const updated = db.prepare('SELECT * FROM stations WHERE id = ?').get(station.id);
    if (req.app.get('io')) {
        req.app.get('io').emit('station:update', updated);
    }
    res.json(updated);
});

// GET /api/stations/:id/now
router.get('/now', (req, res) => {
    const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(req.params.id);
    if (!station) return res.status(404).json({ error: 'Station not found' });
    if (!station.is_live || !station.broadcast_start) {
        return res.json({ is_live: false });
    }

    const segments = db.prepare('SELECT * FROM segments WHERE station_id = ? ORDER BY position').all(req.params.id);
    if (segments.length === 0) return res.json({ is_live: false });

    const totalMs = segments.reduce((sum, s) => sum + s.duration_sec * 1000, 0);
    const elapsedMs = Date.now() - new Date(station.broadcast_start).getTime();
    const positionMs = station.loop ? (elapsedMs % totalMs) : Math.min(elapsedMs, totalMs);

    let acc = 0;
    let segmentIndex = 0;
    let offsetMs = 0;

    for (let i = 0; i < segments.length; i++) {
        const dur = segments[i].duration_sec * 1000;
        if (positionMs < acc + dur) {
            segmentIndex = i;
            offsetMs = positionMs - acc;
            break;
        }
        acc += dur;
        if (i === segments.length - 1) {
            segmentIndex = i;
            offsetMs = positionMs - acc;
        }
    }

    res.json({
        is_live: true,
        segment_index: segmentIndex,
        offset_ms: Math.max(0, offsetMs),
        position_ms: positionMs,
        total_ms: totalMs,
        segment: segments[segmentIndex]
    });
});

module.exports = router;
