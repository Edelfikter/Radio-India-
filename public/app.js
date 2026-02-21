/* global L, io, YT */
'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const API = '';
const INDIA_BOUNDS = L.latLngBounds(L.latLng(6, 68), L.latLng(37, 98));
const INDIA_CENTER = [22, 82];
const DEFAULT_ZOOM  = 5;

// ── Modal helpers (must be declared early — used by map setup below) ───────────
const _closeHooks = {};
function openModal(id)  { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; _closeHooks[id]?.(); }
function closeModalHook(id, fn) { _closeHooks[id] = fn; }

// Close modal on backdrop click
document.querySelectorAll('.modal').forEach((m) => {
  m.addEventListener('click', (e) => { if (e.target === m) closeModal(m.id); });
});

// ── State ─────────────────────────────────────────────────────────────────────
let token = localStorage.getItem('token') || null;
let me    = JSON.parse(localStorage.getItem('me') || 'null');
let stations = [];
let markerMap = {};          // station id → L.Marker
let currentStationId = null; // station popup
let pickingCoords = false;
let ytPlayer = null;
let ytReady  = false;
let listeningTo = null;      // station id being listened to
let chatMinimized = false;
let socket = null;

// ── Map initialisation ────────────────────────────────────────────────────────
// Fix: Set imagePath so Leaflet finds locally-hosted marker images.
// This must be set before the map is created.
L.Icon.Default.imagePath = '/leaflet/images/';

// Fix: Override default icon URLs explicitly for reliable icon rendering
L.Icon.Default.mergeOptions({
  iconUrl:       '/leaflet/images/marker-icon.png',
  iconRetinaUrl: '/leaflet/images/marker-icon-2x.png',
  shadowUrl:     '/leaflet/images/marker-shadow.png',
});

const map = L.map('map', {
  center: INDIA_CENTER,
  zoom: DEFAULT_ZOOM,
  minZoom: 4,
  maxZoom: 12,
  maxBounds: INDIA_BOUNDS,
  maxBoundsViscosity: 0.7,
  preferCanvas: false,   // SVG renderer — more reliable tile compositing
  zoomControl: true,
}).on('load', () => {
  // Force a size invalidation after the map element is fully in DOM
  // Fixes the black-tile flash on first render.
  map.invalidateSize({ animate: false });
});

// ── Tile layer ────────────────────────────────────────────────────────────────
// Tiles are proxied through the local server (/tiles/{z}/{x}/{y}) to avoid
// external CDN connectivity issues and ensure consistent rendering.
const tileLayer = L.tileLayer(
  '/tiles/{z}/{x}/{y}',
  {
    attribution: '&copy; <a href="https://carto.com">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    maxZoom: 12,
    minZoom: 4,
    // Fix: keepBuffer prevents tiles from being discarded before replacements arrive,
    // eliminating the "black tile" flash during pan/zoom.
    keepBuffer: 4,
    // Fix: updateWhenZooming=false avoids redundant tile fetches mid-zoom
    // that can leave black holes when earlier requests haven't completed.
    updateWhenZooming: false,
  }
);

// Fix: attach error handler before addTo() so we catch any tile load failures.
tileLayer.on('tileerror', (e) => {
  // Silently ignore individual tile errors — the browser retries automatically.
  console.warn('Tile load error (will retry):', e.tile.src);
});

tileLayer.addTo(map);

// Fix: After adding the tile layer, trigger an explicit size check.
// Leaflet calculates tile coordinates using the container size, so this call
// ensures tiles are requested for the correct viewport from the start.
window.addEventListener('load', () => {
  map.invalidateSize({ animate: false });
});

// ── Map click (coord picker) ───────────────────────────────────────────────────
map.on('click', (e) => {
  if (!pickingCoords) return;
  document.getElementById('st-lat').value = e.latlng.lat.toFixed(4);
  document.getElementById('st-lng').value = e.latlng.lng.toFixed(4);
});

// ── Auth ──────────────────────────────────────────────────────────────────────
function updateAuthUI() {
  const loggedIn = !!token;
  document.getElementById('btn-login').style.display    = loggedIn ? 'none' : '';
  document.getElementById('btn-register').style.display = loggedIn ? 'none' : '';
  document.getElementById('btn-logout').style.display   = loggedIn ? '' : 'none';
  document.getElementById('btn-create-station').style.display = loggedIn ? '' : 'none';
  document.getElementById('username-display').textContent = loggedIn ? me?.username || '' : '';
}

async function doAuth(mode) {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const err = document.getElementById('auth-error');
  err.textContent = '';
  if (!username || !password) { err.textContent = 'Fill all fields'; return; }
  const res = await fetch(`${API}/api/auth/${mode}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) { err.textContent = data.error || 'Error'; return; }
  token = data.token;
  me    = { id: data.id, username: data.username };
  localStorage.setItem('token', token);
  localStorage.setItem('me', JSON.stringify(me));
  updateAuthUI();
  closeModal('auth-modal');
}

document.getElementById('btn-login').onclick    = () => openAuthModal('login');
document.getElementById('btn-register').onclick = () => openAuthModal('register');
document.getElementById('btn-logout').onclick   = () => {
  token = null; me = null;
  localStorage.removeItem('token'); localStorage.removeItem('me');
  updateAuthUI();
};

function openAuthModal(mode) {
  document.getElementById('auth-title').textContent = mode.toUpperCase();
  document.getElementById('auth-error').textContent = '';
  document.getElementById('auth-username').value = '';
  document.getElementById('auth-password').value = '';
  document.getElementById('auth-submit').textContent = mode.toUpperCase();
  document.getElementById('auth-submit').onclick = () => doAuth(mode);
  openModal('auth-modal');
}

document.getElementById('auth-username').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('auth-submit').click();
});
document.getElementById('auth-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('auth-submit').click();
});

// ── Stations ──────────────────────────────────────────────────────────────────
async function loadStations() {
  const res = await fetch(`${API}/api/stations`);
  stations = await res.json();
  renderMarkers();
  updateStats();
}

function renderMarkers() {
  // Remove old markers
  Object.values(markerMap).forEach((m) => m.remove());
  markerMap = {};

  stations.forEach((st) => {
    const div = document.createElement('div');
    div.className = `station-marker${st.is_live ? ' live' : ''}`;
    const icon = L.divIcon({ className: '', html: div.outerHTML, iconSize: [14, 14], iconAnchor: [7, 7] });
    const marker = L.marker([st.lat, st.lng], { icon }).addTo(map);
    marker.on('click', () => openStationPopup(st.id));
    markerMap[st.id] = marker;
  });
}

// ── Create station ─────────────────────────────────────────────────────────────
document.getElementById('btn-create-station').onclick = () => {
  pickingCoords = true;
  document.getElementById('st-name').value = '';
  document.getElementById('st-desc').value = '';
  document.getElementById('st-lat').value  = '';
  document.getElementById('st-lng').value  = '';
  document.getElementById('st-error').textContent = '';
  openModal('station-modal');
};

closeModalHook('station-modal', () => { pickingCoords = false; });

document.getElementById('st-submit').onclick = async () => {
  const name = document.getElementById('st-name').value.trim();
  const description = document.getElementById('st-desc').value.trim();
  const lat  = parseFloat(document.getElementById('st-lat').value);
  const lng  = parseFloat(document.getElementById('st-lng').value);
  const err  = document.getElementById('st-error');
  err.textContent = '';
  if (!name || isNaN(lat) || isNaN(lng)) { err.textContent = 'Fill all required fields'; return; }
  const res = await fetch(`${API}/api/stations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, description, lat, lng, loop: true }),
  });
  const data = await res.json();
  if (!res.ok) { err.textContent = data.error || 'Error'; return; }
  pickingCoords = false;
  closeModal('station-modal');
  await loadStations();
};

// ── Station popup ─────────────────────────────────────────────────────────────
async function openStationPopup(id) {
  currentStationId = id;
  const res = await fetch(`${API}/api/stations/${id}`);
  const st  = await res.json();
  const isOwner = me && st.user_id === me.id;  // need me.id — fix: store id on login

  const panel = document.getElementById('popup-panel');
  const body  = document.getElementById('popup-body');
  document.getElementById('popup-title').textContent = st.name.toUpperCase();

  let html = `<div style="color:var(--cyan-dim);font-size:11px;margin-bottom:4px">${st.username} — ${st.description || ''}</div>`;
  html += `<div style="font-size:11px;margin-bottom:8px">`;
  if (st.is_live) html += `<span class="live-badge">◉ ON AIR</span> `;
  html += `${st.segments.length} SEGMENT(S)</div>`;

  if (st.is_live && st.segments.length) {
    html += `<button class="crt-btn primary" onclick="tuneIn(${id})">▶ TUNE IN</button> `;
  }
  if (isOwner) {
    if (st.is_live) {
      html += `<button class="crt-btn" onclick="stopBroadcast(${id})">■ STOP BROADCAST</button>`;
    } else {
      html += `<button class="crt-btn primary" onclick="startBroadcast(${id})">◉ GO LIVE</button> `;
      html += `<button class="crt-btn" onclick="openEdit(${id})">EDIT PROGRAMMING</button>`;
    }
    html += `<br><button class="crt-btn" style="margin-top:6px;border-color:var(--red);color:var(--red)" onclick="deleteStation(${id})">DELETE STATION</button>`;
  }

  if (isOwner && !st.is_live) {
    html += `<hr style="border-color:var(--border);margin:8px 0"><div style="font-size:11px;letter-spacing:1px;color:var(--cyan-dim);margin-bottom:6px">PROGRAMMING</div>`;
    st.segments.forEach((seg) => {
      html += `<div class="seg-row"><span class="seg-type">${seg.type.toUpperCase()}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${seg.title || seg.tts_text || seg.video_id || '—'}</span><button class="seg-del" onclick="deleteSeg(${id},${seg.id})">✕</button></div>`;
    });
    html += `<div style="margin-top:8px;font-size:11px">
      <div style="display:flex;gap:4px;margin-bottom:4px">
        <select id="new-seg-type" class="crt-input" style="width:auto">
          <option value="youtube">YOUTUBE</option>
          <option value="tts">TTS</option>
        </select>
      </div>
      <input id="new-seg-url" class="crt-input" placeholder="YouTube URL or TTS text" style="margin-bottom:4px">
      <input id="new-seg-dur" class="crt-input" type="number" placeholder="Duration (seconds)" min="1">
      <button class="crt-btn primary" style="margin-top:4px" onclick="addSegment(${id})">+ ADD SEGMENT</button>
    </div>`;
  }

  body.innerHTML = html;

  // Position popup near marker
  const marker = markerMap[id];
  if (marker) {
    const pos = map.latLngToContainerPoint(marker.getLatLng());
    panel.style.left = `${pos.x + 20}px`;
    panel.style.top  = `${Math.max(50, pos.y - 60)}px`;
  }

  panel.style.display = 'block';
}

document.getElementById('popup-close').onclick = () => {
  document.getElementById('popup-panel').style.display = 'none';
  currentStationId = null;
};

async function startBroadcast(id) {
  const res = await fetch(`${API}/api/stations/${id}/live`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  });
  if (res.ok) { await loadStations(); openStationPopup(id); }
}

async function stopBroadcast(id) {
  const res = await fetch(`${API}/api/stations/${id}/stop`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  });
  if (res.ok) { await loadStations(); openStationPopup(id); }
}

async function deleteStation(id) {
  if (!confirm('Delete this station?')) return;
  const res = await fetch(`${API}/api/stations/${id}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
  });
  if (res.ok) { document.getElementById('popup-panel').style.display = 'none'; await loadStations(); }
  else {
    const d = await res.json();
    alert(d.error || 'Error');
  }
}

async function addSegment(stationId) {
  const type   = document.getElementById('new-seg-type').value;
  const rawUrl = document.getElementById('new-seg-url').value.trim();
  const durSec = parseFloat(document.getElementById('new-seg-dur').value) || 0;
  const duration_ms = Math.round(durSec * 1000);

  let body;
  if (type === 'youtube') {
    const res = await fetch(`${API}/api/youtube/validate?url=${encodeURIComponent(rawUrl)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Invalid video'); return; }
    body = { type: 'youtube', video_id: d.video_id, title: d.title, duration_ms };
  } else {
    body = { type: 'tts', tts_text: rawUrl, title: rawUrl.slice(0, 40), duration_ms };
  }

  const res = await fetch(`${API}/api/stations/${stationId}/segments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (res.ok) openStationPopup(stationId);
  else { const d = await res.json(); alert(d.error || 'Error'); }
}

async function deleteSeg(stationId, segId) {
  const res = await fetch(`${API}/api/stations/${stationId}/segments/${segId}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
  });
  if (res.ok) openStationPopup(stationId);
}

// ── YouTube player ────────────────────────────────────────────────────────────
window.onYouTubeIframeAPIReady = () => { ytReady = true; };

// Dynamically load YouTube IFrame API
(function loadYT() {
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
})();

async function tuneIn(stationId) {
  if (listeningTo === stationId) return;
  stopListening();
  listeningTo = stationId;
  socket.emit('chat:join_station', stationId);

  const res  = await fetch(`${API}/api/stations/${stationId}/now`);
  const now  = await res.json();
  if (!now.is_live || !now.segment) return;

  if (now.segment.type === 'youtube') {
    document.getElementById('yt-container').style.display = 'block';
    const startSec = Math.floor(now.segment.offset_ms / 1000);
    if (ytPlayer && ytReady) {
      ytPlayer.loadVideoById({ videoId: now.segment.video_id, startSeconds: startSec });
    } else {
      ytPlayer = new YT.Player('yt-player', {
        width: '320', height: '180',
        videoId: now.segment.video_id,
        playerVars: { start: startSec, autoplay: 1, controls: 1 },
        events: { onReady: (e) => e.target.playVideo() },
      });
    }
  } else if (now.segment.type === 'tts' && now.segment.tts_text) {
    const utt = new SpeechSynthesisUtterance(now.segment.tts_text);
    utt.rate  = 0.85;
    utt.pitch = 0.7;
    window.speechSynthesis.speak(utt);
  }
}

function stopListening() {
  if (ytPlayer && ytReady) { try { ytPlayer.stopVideo(); } catch {} }
  window.speechSynthesis?.cancel();
  document.getElementById('yt-container').style.display = 'none';
  listeningTo = null;
  socket.emit('chat:join_station', null);
}

// ── Stats ─────────────────────────────────────────────────────────────────────
async function updateStats() {
  const res  = await fetch(`${API}/api/stats`);
  const data = await res.json();
  document.getElementById('stat-live').textContent      = `LIVE: ${data.live_stations}`;
  document.getElementById('stat-total').textContent     = `STATIONS: ${data.total_stations}`;
  document.getElementById('stat-listeners').textContent = `LISTENERS: ${data.listeners}`;
}

function updateClock() {
  document.getElementById('stat-time').textContent = new Date().toUTCString().slice(17, 25) + ' UTC';
}
setInterval(updateClock, 1000);
updateClock();

// ── Socket.io ─────────────────────────────────────────────────────────────────
function connectSocket() {
  socket = io();
  socket.on('chat:history', (msgs) => {
    const box = document.getElementById('chat-messages');
    box.innerHTML = '';
    msgs.forEach(appendChatMsg);
    box.scrollTop = box.scrollHeight;
  });
  socket.on('chat:message', (msg) => {
    appendChatMsg(msg);
    document.getElementById('chat-messages').scrollTop = 1e9;
  });
  socket.on('station:update', () => { loadStations(); });
}

function appendChatMsg(msg) {
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<span class="user">${escHtml(msg.username)}</span>: <span class="text">${escHtml(msg.message)}</span>`;
  document.getElementById('chat-messages').appendChild(div);
}

document.getElementById('chat-send').onclick = sendChat;
document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});

function sendChat() {
  if (!token) { alert('Login to chat'); return; }
  const input = document.getElementById('chat-input');
  const msg   = input.value.trim();
  if (!msg) return;
  socket.emit('chat:message', { token, message: msg });
  input.value = '';
}

// ── Chat minimize / drag ──────────────────────────────────────────────────────
document.getElementById('chat-minimize').onclick = () => {
  chatMinimized = !chatMinimized;
  document.getElementById('chat-body').style.display = chatMinimized ? 'none' : '';
  document.getElementById('chat-minimize').textContent = chatMinimized ? '+' : '—';
};

(function makeDraggable() {
  const panel = document.getElementById('chat-panel');
  const header = document.getElementById('chat-header');
  let dragging = false, ox = 0, oy = 0;
  header.addEventListener('mousedown', (e) => {
    dragging = true;
    const r = panel.getBoundingClientRect();
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    panel.style.left   = `${e.clientX - ox}px`;
    panel.style.top    = `${e.clientY - oy}px`;
    panel.style.bottom = 'auto';
    panel.style.right  = 'auto';
  });
  document.addEventListener('mouseup', () => { dragging = false; });
})();

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Boot ──────────────────────────────────────────────────────────────────────
updateAuthUI();
connectSocket();
loadStations();
setInterval(loadStations, 30000);
setInterval(updateStats,  15000);

// Refresh auth state if token is stored (validate with /me)
if (token) {
  fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.json())
    .then((d) => {
      if (d.id) {
        me = { id: d.id, username: d.username };
        localStorage.setItem('me', JSON.stringify(me));
        updateAuthUI();
      } else {
        token = null; me = null;
        localStorage.removeItem('token'); localStorage.removeItem('me');
        updateAuthUI();
      }
    })
    .catch(() => {});
}
