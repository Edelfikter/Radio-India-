const express = require('express');
const fetch = require('node-fetch');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// GET /api/youtube/validate?v=VIDEO_ID
router.get('/validate', authMiddleware, async (req, res) => {
    const videoId = req.query.v;
    if (!videoId) return res.status(400).json({ error: 'Missing video id' });

    try {
        // Use noembed to get title and check embeddability
        const oembedUrl = `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
        const response = await fetch(oembedUrl, { timeout: 8000 });
        const data = await response.json();

        if (data.error || !data.title) {
            return res.status(400).json({ error: 'Video not found or not embeddable' });
        }

        // Try to get duration via youtube oembed (doesn't return duration)
        // Use ytdl-core or just return unknown duration — client will detect via YT API
        res.json({
            video_id: videoId,
            title: data.title,
            thumbnail: data.thumbnail_url || null,
            duration_sec: null // Client should get duration from YT IFrame API
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to validate video' });
    }
});

module.exports = router;
