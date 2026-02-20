/* app.js — Entry point, initializes everything */

let allStations = [];

async function init() {
    // Initialize map
    initMap();

    // Check auth state
    onAuthChange();

    // Load stations
    await refreshStations();

    // Init chat/socket
    initChat();

    // Status bar clock
    updateStatusBar();
    setInterval(updateStatusBar, 5000);
    setInterval(updateClock, 1000);
    updateClock();

    // Button handlers
    document.getElementById('btn-login').onclick = showAuthModal;
    document.getElementById('btn-logout').onclick = doLogout;
    document.getElementById('btn-create-station').onclick = showCreateStation;
}

async function refreshStations() {
    try {
        allStations = await apiFetch('/api/stations');
        renderStations(allStations);
    } catch (e) {
        console.error('Failed to load stations:', e);
    }
}

async function updateStatusBar() {
    try {
        const stats = await apiFetch('/api/stats');
        document.getElementById('status-stations').textContent = `STATIONS: ${stats.stations_total}`;
        document.getElementById('status-live').textContent = `LIVE: ${stats.stations_live}`;
        document.getElementById('status-listeners').textContent = `LISTENERS: ${stats.listeners_online}`;
    } catch (e) {
        // ignore
    }
}

function updateClock() {
    const el = document.getElementById('status-time');
    if (el) {
        const now = new Date();
        el.textContent = now.toUTCString().replace(' GMT', ' UTC');
    }
}

// YT IFrame API ready callback (called by YT API)
function onYouTubeIframeAPIReady() {
    window.ytApiReady = true;
}

// Init on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Periodically refresh station list to catch live status changes
setInterval(refreshStations, 30000);
