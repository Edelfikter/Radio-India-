const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

// GET /api/stations/:id/segments
router.get('/', (req, res) => {
    const segments = db.prepare('SELECT * FROM segments WHERE station_id = ? ORDER BY position').all(req.params.id);
    res.json(segments);
});

// POST /api/stations/:id/segments
router.post('/', authMiddleware, (req, res) => {
    const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(req.params.id);
    if (!station) return res.status(404).json({ error: 'Station not found' });
    if (station.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your station' });
    if (station.is_live) return res.status(400).json({ error: 'Cannot edit live station' });

    const { type, youtube_video_id, youtube_title, start_offset_sec, end_offset_sec,
            tts_text, tts_audio_url, duration_sec, fade_in_ms, fade_out_ms } = req.body;

    if (!type || !['youtube', 'tts'].includes(type)) {
        return res.status(400).json({ error: 'type must be youtube or tts' });
    }
    if (duration_sec == null || duration_sec <= 0) {
        return res.status(400).json({ error: 'duration_sec required and must be positive' });
    }

    // Get next position
    const maxPos = db.prepare('SELECT MAX(position) as m FROM segments WHERE station_id = ?').get(req.params.id);
    const position = (maxPos.m !== null ? maxPos.m : -1) + 1;

    const stmt = db.prepare(`
        INSERT INTO segments (station_id, position, type, youtube_video_id, youtube_title,
            start_offset_sec, end_offset_sec, tts_text, tts_audio_url, duration_sec, fade_in_ms, fade_out_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
        req.params.id, position, type,
        youtube_video_id || null, youtube_title || null,
        start_offset_sec || 0, end_offset_sec || null,
        tts_text || null, tts_audio_url || null,
        duration_sec, fade_in_ms || 0, fade_out_ms || 0
    );
    res.status(201).json(db.prepare('SELECT * FROM segments WHERE id = ?').get(result.lastInsertRowid));
});

// PUT /api/segments/:segId
router.put('/:segId', authMiddleware, (req, res) => {
    const segment = db.prepare('SELECT * FROM segments WHERE id = ?').get(req.params.segId);
    if (!segment) return res.status(404).json({ error: 'Segment not found' });

    const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(segment.station_id);
    if (station.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your station' });
    if (station.is_live) return res.status(400).json({ error: 'Cannot edit live station' });

    const { youtube_video_id, youtube_title, start_offset_sec, end_offset_sec,
            tts_text, tts_audio_url, duration_sec, fade_in_ms, fade_out_ms } = req.body;

    db.prepare(`
        UPDATE segments SET
            youtube_video_id=?, youtube_title=?, start_offset_sec=?, end_offset_sec=?,
            tts_text=?, tts_audio_url=?, duration_sec=?, fade_in_ms=?, fade_out_ms=?
        WHERE id=?
    `).run(
        youtube_video_id !== undefined ? youtube_video_id : segment.youtube_video_id,
        youtube_title !== undefined ? youtube_title : segment.youtube_title,
        start_offset_sec !== undefined ? start_offset_sec : segment.start_offset_sec,
        end_offset_sec !== undefined ? end_offset_sec : segment.end_offset_sec,
        tts_text !== undefined ? tts_text : segment.tts_text,
        tts_audio_url !== undefined ? tts_audio_url : segment.tts_audio_url,
        duration_sec !== undefined ? duration_sec : segment.duration_sec,
        fade_in_ms !== undefined ? fade_in_ms : segment.fade_in_ms,
        fade_out_ms !== undefined ? fade_out_ms : segment.fade_out_ms,
        segment.id
    );
    res.json(db.prepare('SELECT * FROM segments WHERE id = ?').get(segment.id));
});

// DELETE /api/segments/:segId
router.delete('/:segId', authMiddleware, (req, res) => {
    const segment = db.prepare('SELECT * FROM segments WHERE id = ?').get(req.params.segId);
    if (!segment) return res.status(404).json({ error: 'Segment not found' });

    const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(segment.station_id);
    if (station.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your station' });
    if (station.is_live) return res.status(400).json({ error: 'Cannot edit live station' });

    db.prepare('DELETE FROM segments WHERE id = ?').run(segment.id);

    // Re-normalize positions
    const remaining = db.prepare('SELECT id FROM segments WHERE station_id = ? ORDER BY position').all(segment.station_id);
    remaining.forEach((s, i) => {
        db.prepare('UPDATE segments SET position = ? WHERE id = ?').run(i, s.id);
    });

    res.json({ ok: true });
});

// PUT /api/stations/:id/segments/reorder
router.put('/reorder', authMiddleware, (req, res) => {
    const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(req.params.id);
    if (!station) return res.status(404).json({ error: 'Station not found' });
    if (station.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your station' });
    if (station.is_live) return res.status(400).json({ error: 'Cannot edit live station' });

    const { order } = req.body; // array of segment IDs in new order
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of segment IDs' });

    const updatePos = db.prepare('UPDATE segments SET position = ? WHERE id = ? AND station_id = ?');
    const reorderAll = db.transaction((ids) => {
        ids.forEach((id, idx) => updatePos.run(idx, id, req.params.id));
    });
    reorderAll(order);

    res.json(db.prepare('SELECT * FROM segments WHERE station_id = ? ORDER BY position').all(req.params.id));
});

module.exports = router;
