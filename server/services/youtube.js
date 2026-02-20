// YouTube service - validation helper
const fetch = require('node-fetch');

async function validateYouTubeVideo(videoId) {
    const url = `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    const res = await fetch(url, { timeout: 8000 });
    const data = await res.json();
    if (data.error || !data.title) return null;
    return { title: data.title, thumbnail: data.thumbnail_url };
}

module.exports = { validateYouTubeVideo };
