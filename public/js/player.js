/* player.js — Timeline sync, YT player, TTS playback, fades */

let currentStation = null;
let currentSegments = [];
let currentSegmentIndex = -1;
let ytPlayer = null;
let ttsAudio = null;
let playerVolume = 0.8;
let playerInterval = null;
let isPlaying = false;

// SAM TTS client-side generation (using AudioContext + simplified approach)
let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

async function startListening(station, segments, syncData) {
    stopListening();

    currentStation = station;
    currentSegments = segments;
    isPlaying = true;

    if (syncData && syncData.is_live) {
        currentSegmentIndex = syncData.segment_index;
        await playSegment(currentSegmentIndex, syncData.offset_ms / 1000);
    } else {
        // Not live or error — show offline
        showOfflinePlayer();
    }
}

function stopListening() {
    isPlaying = false;
    clearInterval(playerInterval);
    playerInterval = null;

    if (ytPlayer) {
        try { ytPlayer.stopVideo(); } catch(e) {}
    }
    if (ttsAudio) {
        ttsAudio.pause();
        ttsAudio = null;
    }

    currentStation = null;
    currentSegments = [];
    currentSegmentIndex = -1;
}

async function playSegment(index, offsetSec) {
    if (!isPlaying || index >= currentSegments.length) {
        if (currentStation && currentStation.loop) {
            index = 0;
            offsetSec = 0;
        } else {
            showOfflinePlayer();
            return;
        }
    }

    currentSegmentIndex = index;
    const seg = currentSegments[index];
    updateNowPlayingUI(seg, index);

    if (seg.type === 'youtube') {
        await playYouTubeSegment(seg, offsetSec);
    } else if (seg.type === 'tts') {
        await playTTSSegment(seg, offsetSec);
    }
}

function updateNowPlayingUI(seg, index) {
    const container = document.getElementById('popup-player');
    if (!container) return;

    const info = document.getElementById('now-playing-info');
    if (info) {
        const totalStr = currentSegments.length > 0
            ? `SEG ${index + 1}/${currentSegments.length}`
            : '';
        if (seg.type === 'youtube') {
            info.innerHTML = `<strong>▶ ${seg.youtube_title || seg.youtube_video_id}</strong> <span style="color:var(--primary-dim)">${totalStr}</span>`;
        } else {
            info.innerHTML = `<strong>📢 TTS BROADCAST</strong> <span style="color:var(--primary-dim)">${totalStr}</span>`;
        }
    }

    const ytContainer = document.getElementById('yt-embed-container');
    const ttsIndicator = document.getElementById('tts-indicator');

    if (seg.type === 'youtube') {
        if (ytContainer) ytContainer.style.display = '';
        if (ttsIndicator) ttsIndicator.style.display = 'none';
    } else {
        if (ytContainer) ytContainer.style.display = 'none';
        if (ttsIndicator) {
            ttsIndicator.style.display = '';
            ttsIndicator.innerHTML = '◈ SAM TTS BROADCASTING ◈<br><span style="font-size:0.65rem;color:var(--primary-dim)">' +
                (seg.tts_text || '').slice(0, 60) + (seg.tts_text && seg.tts_text.length > 60 ? '...' : '') + '</span>';
        }
    }
}

async function playYouTubeSegment(seg, offsetSec) {
    const container = document.getElementById('yt-player-div');
    if (!container) return;

    const startAt = (seg.start_offset_sec || 0) + offsetSec;

    if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
        ytPlayer.loadVideoById({ videoId: seg.youtube_video_id, startSeconds: startAt });
        ytPlayer.setVolume(playerVolume * 100);
        ytPlayer.playVideo();
    } else {
        // Create player
        ytPlayer = new YT.Player('yt-player-div', {
            videoId: seg.youtube_video_id,
            playerVars: {
                autoplay: 1,
                start: Math.floor(startAt),
                controls: 0,
                rel: 0,
                modestbranding: 1
            },
            events: {
                onReady: (e) => {
                    e.target.setVolume(playerVolume * 100);
                    e.target.seekTo(startAt, true);
                    e.target.playVideo();
                },
                onStateChange: (e) => {
                    // YT.PlayerState.ENDED = 0
                    if (e.data === 0) {
                        advanceSegment();
                    }
                },
                onError: () => {
                    advanceSegment();
                }
            }
        });
    }

    // Schedule advance based on duration
    const segDur = seg.duration_sec - offsetSec;
    if (playerInterval) clearInterval(playerInterval);
    playerInterval = setTimeout(() => {
        if (isPlaying) advanceSegment();
    }, segDur * 1000 + 500); // small buffer
}

async function playTTSSegment(seg, offsetSec) {
    // Generate TTS using sam-js if available, otherwise use Web Speech API fallback
    if (typeof SpeechSynthesisUtterance !== 'undefined' && window.speechSynthesis) {
        // Web Speech API fallback for TTS
        const utterance = new SpeechSynthesisUtterance(seg.tts_text || '');
        utterance.rate = 0.85;
        utterance.pitch = 0.7;
        utterance.volume = playerVolume;

        utterance.onend = () => {
            if (isPlaying) advanceSegment();
        };
        utterance.onerror = () => {
            if (isPlaying) advanceSegment();
        };

        // Handle offset — can't easily seek in speech synthesis
        // Just start from beginning
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    }

    // Schedule advance based on duration
    const segDur = seg.duration_sec - offsetSec;
    if (playerInterval) clearTimeout(playerInterval);
    playerInterval = setTimeout(() => {
        window.speechSynthesis && window.speechSynthesis.cancel();
        if (isPlaying) advanceSegment();
    }, Math.max(500, segDur * 1000));
}

function advanceSegment() {
    clearTimeout(playerInterval);
    clearInterval(playerInterval);
    const nextIndex = currentSegmentIndex + 1;
    if (nextIndex < currentSegments.length) {
        playSegment(nextIndex, 0);
    } else if (currentStation && currentStation.loop) {
        playSegment(0, 0);
    } else {
        isPlaying = false;
        showOfflinePlayer();
    }
}

function showOfflinePlayer() {
    const info = document.getElementById('now-playing-info');
    if (info) info.innerHTML = '<span style="color:var(--primary-dim)">STATION OFFLINE</span>';
    const ytContainer = document.getElementById('yt-embed-container');
    if (ytContainer) ytContainer.style.display = 'none';
    const ttsIndicator = document.getElementById('tts-indicator');
    if (ttsIndicator) ttsIndicator.style.display = 'none';
}

function setPlayerVolume(vol) {
    playerVolume = vol;
    if (ytPlayer && typeof ytPlayer.setVolume === 'function') {
        ytPlayer.setVolume(vol * 100);
    }
    if (ttsAudio) ttsAudio.volume = vol;
    if (window.speechSynthesis) {
        // Can't change mid-utterance reliably
    }
}

function buildPlayerUI(station) {
    return `
        <div id="popup-player">
            <div class="now-playing-info" id="now-playing-info">
                <span style="color:var(--primary-dim)">TUNING IN...</span>
            </div>
            <div id="yt-embed-container" style="display:none">
                <div id="yt-player-div"></div>
            </div>
            <div id="tts-indicator" class="tts-indicator" style="display:none">
                ◈ SAM TTS BROADCASTING ◈
            </div>
            <div class="progress-bar-outer">
                <div class="progress-bar-inner" id="player-progress"></div>
            </div>
            <div class="volume-row">
                <span>VOL</span>
                <input type="range" class="volume-slider" min="0" max="1" step="0.05" value="${playerVolume}"
                    oninput="setPlayerVolume(parseFloat(this.value))">
            </div>
            <button class="btn-terminal" style="width:100%;margin-top:4px" onclick="stopAndLeave()">■ STOP LISTENING</button>
        </div>
    `;
}

function stopAndLeave() {
    stopListening();
    if (window.chatSocket && currentStation) {
        window.chatSocket.emit('station:leave', currentStation.id);
    }
    showOfflinePlayer();
    // Re-render popup in "tuned out" mode
    if (window._currentPopupStation) {
        showStationPopup(window._currentPopupStation, window._currentPopupMarker);
    }
}

// Update progress bar periodically
setInterval(() => {
    if (!isPlaying || !currentStation || !currentStation.broadcast_start) return;
    const elapsed = Date.now() - new Date(currentStation.broadcast_start).getTime();
    const total = currentSegments.reduce((s, seg) => s + seg.duration_sec * 1000, 0);
    if (total <= 0) return;
    const pos = currentStation.loop ? (elapsed % total) : Math.min(elapsed, total);
    const pct = (pos / total) * 100;
    const bar = document.getElementById('player-progress');
    if (bar) bar.style.width = pct + '%';
}, 1000);
