const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// GET /api/stations — list all
router.get('/', (req, res) => {
    const stations = db.prepare(`
        SELECT s.*, u.username as owner_name,
               (SELECT COUNT(*) FROM segments WHERE station_id = s.id) as segment_count
        FROM stations s
        JOIN users u ON s.owner_id = u.id
        ORDER BY s.created_at DESC
    `).all();
    res.json(stations);
});

// GET /api/stations/:id — station detail + segments
router.get('/:id', (req, res) => {
    const station = db.prepare(`
        SELECT s.*, u.username as owner_name
        FROM stations s
        JOIN users u ON s.owner_id = u.id
        WHERE s.id = ?
    `).get(req.params.id);
    if (!station) return res.status(404).json({ error: 'Station not found' });
    const segments = db.prepare('SELECT * FROM segments WHERE station_id = ? ORDER BY position').all(req.params.id);
    res.json({ ...station, segments });
});

// POST /api/stations — create
router.post('/', authMiddleware, (req, res) => {
    const { name, description, latitude, longitude, loop, fade_ms } = req.body;
    if (!name || latitude == null || longitude == null) {
        return res.status(400).json({ error: 'Name, latitude, longitude required' });
    }
    // Max 3 stations per user
    const count = db.prepare('SELECT COUNT(*) as c FROM stations WHERE owner_id = ?').get(req.user.id).c;
    if (count >= 3) {
        return res.status(403).json({ error: 'Maximum 3 stations per user' });
    }
    const stmt = db.prepare(`
        INSERT INTO stations (owner_id, name, description, latitude, longitude, loop, fade_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
        req.user.id, name, description || '', latitude, longitude,
        loop !== undefined ? (loop ? 1 : 0) : 1,
        fade_ms || 2000
    );
    const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(station);
});

// PUT /api/stations/:id — update
router.put('/:id', authMiddleware, (req, res) => {
    const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(req.params.id);
    if (!station) return res.status(404).json({ error: 'Station not found' });
    if (station.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your station' });
    if (station.is_live) return res.status(400).json({ error: 'Cannot edit a live station' });

    const { name, description, latitude, longitude, loop, fade_ms } = req.body;
    db.prepare(`
        UPDATE stations SET name=?, description=?, latitude=?, longitude=?, loop=?, fade_ms=?
        WHERE id=?
    `).run(
        name || station.name,
        description !== undefined ? description : station.description,
        latitude !== undefined ? latitude : station.latitude,
        longitude !== undefined ? longitude : station.longitude,
        loop !== undefined ? (loop ? 1 : 0) : station.loop,
        fade_ms !== undefined ? fade_ms : station.fade_ms,
        station.id
    );
    res.json(db.prepare('SELECT * FROM stations WHERE id = ?').get(station.id));
});

// DELETE /api/stations/:id
router.delete('/:id', authMiddleware, (req, res) => {
    const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(req.params.id);
    if (!station) return res.status(404).json({ error: 'Station not found' });
    if (station.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your station' });
    if (station.is_live) return res.status(400).json({ error: 'Cannot delete a live station' });
    db.prepare('DELETE FROM stations WHERE id = ?').run(station.id);
    res.json({ ok: true });
});

module.exports = router;
