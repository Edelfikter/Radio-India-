/* station.js — Station popup, create/edit/delete UI */

let _currentPopupStation = null;
let _currentPopupMarker = null;
let _tuningIn = false;

function showStationPopup(station, marker) {
    _currentPopupStation = station;
    _currentPopupMarker = marker;
    window._currentPopupStation = station;
    window._currentPopupMarker = marker;

    const popup = document.getElementById('station-popup');
    const title = document.getElementById('station-popup-title');
    const body = document.getElementById('station-popup-body');

    title.innerHTML = station.name + (station.is_live ? ' <span class="live-badge">● LIVE</span>' : ' <span style="color:var(--primary-dim);font-size:0.65rem">OFFLINE</span>');

    // Position popup near pin
    positionPopupNearMarker(popup, marker);

    body.innerHTML = buildStationBody(station);
    popup.style.display = '';

    // Fetch fresh station data
    apiFetch(`/api/stations/${station.id}`).then(s => {
        _currentPopupStation = s;
        window._currentPopupStation = s;
        title.innerHTML = s.name + (s.is_live ? ' <span class="live-badge">● LIVE</span>' : ' <span style="color:var(--primary-dim);font-size:0.65rem">OFFLINE</span>');
        body.innerHTML = buildStationBody(s);
    }).catch(() => {});
}

function positionPopupNearMarker(popup, marker) {
    if (!marker || !map) {
        popup.style.left = '50%';
        popup.style.top = '50%';
        popup.style.transform = 'translate(-50%, -50%)';
        return;
    }

    const point = map.latLngToContainerPoint(marker.getLatLng());
    const mapEl = document.getElementById('map');
    const mapRect = mapEl.getBoundingClientRect();

    let left = mapRect.left + point.x + 20;
    let top = mapRect.top + point.y - 80;

    // Keep in viewport
    const popupW = 340;
    const popupH = 500;
    if (left + popupW > window.innerWidth - 10) left = mapRect.left + point.x - popupW - 20;
    if (top < 50) top = 50;
    if (top + popupH > window.innerHeight - 40) top = window.innerHeight - popupH - 40;

    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
    popup.style.transform = '';
}

function buildStationBody(station) {
    const username = getUsername();
    const isOwner = username && station.owner_name === username;

    let html = `
        <div class="station-desc">${station.description || '<span style="color:var(--primary-dim)">No description.</span>'}</div>
        <div class="station-meta">
            <span>👤 ${station.owner_name}</span>
            <span>📍 ${Number(station.latitude).toFixed(2)}, ${Number(station.longitude).toFixed(2)}</span>
        </div>
    `;

    if (station.is_live) {
        html += `<div style="color:var(--live);font-size:0.72rem;margin-bottom:8px">● BROADCASTING LIVE</div>`;
        html += buildPlayerUI(station);
        html += `<button class="btn-terminal btn-primary" onclick="tuneIn(${station.id})" style="margin-top:6px">▶ TUNE IN</button>`;
    } else {
        html += `<div style="color:var(--primary-dim);font-size:0.72rem;margin-bottom:8px">○ STATION OFFLINE</div>`;
    }

    if (isOwner) {
        html += `<div class="station-actions" style="margin-top:8px">`;
        if (!station.is_live) {
            html += `<button class="btn-terminal" onclick="goLive(${station.id})">▶ GO LIVE</button>`;
            html += `<button class="btn-terminal" onclick="showEditSegments(${station.id})">EDIT PROGRAMMING</button>`;
            html += `<button class="btn-terminal" onclick="showEditStation(${station.id})">EDIT INFO</button>`;
            html += `<button class="btn-terminal" style="border-color:var(--alert);color:var(--alert)" onclick="deleteStation(${station.id})">DELETE</button>`;
        } else {
            html += `<button class="btn-terminal" style="border-color:var(--alert);color:var(--alert)" onclick="stopBroadcast(${station.id})">■ STOP BROADCAST</button>`;
        }
        html += `</div>`;
    }

    return html;
}

async function tuneIn(stationId) {
    if (_tuningIn) return;
    _tuningIn = true;
    try {
        const [station, syncData] = await Promise.all([
            apiFetch(`/api/stations/${stationId}`),
            apiFetch(`/api/stations/${stationId}/now`)
        ]);
        _currentPopupStation = station;
        currentStation = station;

        if (window.chatSocket) {
            window.chatSocket.emit('station:join', stationId);
        }

        await startListening(station, station.segments || [], syncData);

        // Re-render body to show player active state
        const body = document.getElementById('station-popup-body');
        if (body) body.innerHTML = buildStationBody(station);
        updateNowPlayingUI(station.segments[syncData.segment_index] || station.segments[0], syncData.segment_index || 0);
    } catch (e) {
        alert('Failed to tune in: ' + e.message);
    } finally {
        _tuningIn = false;
    }
}

async function goLive(stationId) {
    try {
        const station = await apiFetch(`/api/stations/${stationId}/live`, { method: 'POST' });
        addOrUpdatePin(station);
        showStationPopup(station, _currentPopupMarker);
        refreshStations();
    } catch (e) {
        alert(e.message);
    }
}

async function stopBroadcast(stationId) {
    try {
        stopListening();
        const station = await apiFetch(`/api/stations/${stationId}/stop`, { method: 'POST' });
        addOrUpdatePin(station);
        showStationPopup(station, _currentPopupMarker);
        refreshStations();
    } catch (e) {
        alert(e.message);
    }
}

async function deleteStation(stationId) {
    if (!confirm('Delete this station? This cannot be undone.')) return;
    try {
        await apiFetch(`/api/stations/${stationId}`, { method: 'DELETE' });
        closeStationPopup();
        removePin(stationId);
        refreshStations();
    } catch (e) {
        alert(e.message);
    }
}

function showEditSegments(stationId) {
    const body = document.getElementById('station-popup-body');
    body.innerHTML = `
        <button class="btn-terminal" style="margin-bottom:8px" onclick="showStationPopup(_currentPopupStation, _currentPopupMarker)">← BACK</button>
        <div class="segment-list" id="seg-edit-list"></div>
    `;
    renderSegmentList({ id: stationId }, document.getElementById('seg-edit-list'), true);
}

function showEditStation(stationId) {
    const s = _currentPopupStation;
    const body = document.getElementById('station-popup-body');
    body.innerHTML = `
        <button class="btn-terminal" style="margin-bottom:8px" onclick="showStationPopup(_currentPopupStation, _currentPopupMarker)">← BACK</button>
        <div class="edit-station-form">
            <label class="field-label">NAME:</label>
            <input id="edit-name" class="terminal-input" value="${s.name}">
            <label class="field-label">DESCRIPTION:</label>
            <textarea id="edit-desc" class="terminal-input" rows="2">${s.description || ''}</textarea>
            <label class="field-label">LATITUDE:</label>
            <input id="edit-lat" class="terminal-input" type="number" step="any" value="${s.latitude}">
            <label class="field-label">LONGITUDE:</label>
            <input id="edit-lng" class="terminal-input" type="number" step="any" value="${s.longitude}">
            <label class="field-label">LOOP:</label>
            <select id="edit-loop" class="terminal-input">
                <option value="1" ${s.loop ? 'selected' : ''}>YES</option>
                <option value="0" ${!s.loop ? 'selected' : ''}>NO</option>
            </select>
            <button class="btn-terminal btn-primary" onclick="saveEditStation(${stationId})">▶ SAVE CHANGES</button>
            <div id="edit-station-err" class="error-msg"></div>
        </div>
    `;
}

async function saveEditStation(stationId) {
    const name = document.getElementById('edit-name').value.trim();
    const desc = document.getElementById('edit-desc').value;
    const lat = parseFloat(document.getElementById('edit-lat').value);
    const lng = parseFloat(document.getElementById('edit-lng').value);
    const loop = parseInt(document.getElementById('edit-loop').value);
    const errEl = document.getElementById('edit-station-err');

    try {
        const station = await apiFetch(`/api/stations/${stationId}`, {
            method: 'PUT',
            body: JSON.stringify({ name, description: desc, latitude: lat, longitude: lng, loop })
        });
        _currentPopupStation = station;
        window._currentPopupStation = station;
        addOrUpdatePin(station);
        showStationPopup(station, _currentPopupMarker);
    } catch (e) {
        errEl.textContent = e.message;
    }
}

function closeStationPopup() {
    document.getElementById('station-popup').style.display = 'none';
    stopListening();
}

// Create station
let pickingCoordsForCreate = false;

function showCreateStation() {
    document.getElementById('create-station-modal').style.display = 'flex';
    document.getElementById('create-station-error').textContent = '';
}

// Hook up map click for coordinate picking
function enableCoordPicker() {
    startPickingCoords((lat, lng) => {
        document.getElementById('cs-lat').value = lat.toFixed(5);
        document.getElementById('cs-lng').value = lng.toFixed(5);
        document.getElementById('create-station-modal').style.display = 'flex';
    });
    document.getElementById('create-station-modal').style.display = 'none';
}

async function createStation() {
    const name = document.getElementById('cs-name').value.trim();
    const desc = document.getElementById('cs-desc').value;
    const lat = parseFloat(document.getElementById('cs-lat').value);
    const lng = parseFloat(document.getElementById('cs-lng').value);
    const loop = parseInt(document.getElementById('cs-loop').value);
    const errEl = document.getElementById('create-station-error');

    if (!name || isNaN(lat) || isNaN(lng)) {
        errEl.textContent = 'Name, latitude, and longitude are required';
        return;
    }

    try {
        const station = await apiFetch('/api/stations', {
            method: 'POST',
            body: JSON.stringify({ name, description: desc, latitude: lat, longitude: lng, loop })
        });
        document.getElementById('create-station-modal').style.display = 'none';
        addOrUpdatePin(station);
        showStationPopup(station, stationMarkers[station.id]);
        refreshStations();
    } catch (e) {
        errEl.textContent = e.message;
    }
}
