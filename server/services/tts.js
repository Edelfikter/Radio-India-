// TTS service - client-side SAM.js generation is used in the MVP
// This module provides server-side helpers for TTS if needed

const path = require('path');
const fs = require('fs');

const AUDIO_DIR = path.join(__dirname, '../../public/assets/sam-audio');

// Ensure audio directory exists
if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

/**
 * For the MVP, TTS is generated client-side using sam-js.
 * This service handles caching of pre-rendered audio files
 * if server-side rendering is added later.
 */

function getAudioPath(filename) {
    return path.join(AUDIO_DIR, filename);
}

function audioExists(filename) {
    return fs.existsSync(getAudioPath(filename));
}

module.exports = { getAudioPath, audioExists, AUDIO_DIR };
