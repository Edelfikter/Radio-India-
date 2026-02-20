/* utils.js — Shared helpers */

function formatDuration(sec) {
    const s = Math.round(sec);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${String(rem).padStart(2, '0')}`;
}

function extractYouTubeId(url) {
    if (!url) return null;
    // Handle youtu.be, youtube.com/watch, youtube.com/embed
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
        /^([A-Za-z0-9_-]{11})$/
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m) return m[1];
    }
    return null;
}

function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getToken() {
    return localStorage.getItem('aipr_token');
}

function getUsername() {
    return localStorage.getItem('aipr_username');
}

function setAuth(token, username) {
    localStorage.setItem('aipr_token', token);
    localStorage.setItem('aipr_username', username);
}

function clearAuth() {
    localStorage.removeItem('aipr_token');
    localStorage.removeItem('aipr_username');
}

async function apiFetch(url, opts = {}) {
    const token = getToken();
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

// Simple event bus
const EventBus = {
    _listeners: {},
    on(event, fn) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(fn);
    },
    emit(event, data) {
        (this._listeners[event] || []).forEach(fn => fn(data));
    }
};
