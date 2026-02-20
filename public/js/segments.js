/* segments.js — Segment list UI, add/reorder/remove */

async function renderSegmentList(station, container, editable) {
    const segments = await apiFetch(`/api/stations/${station.id}/segments`);
    container.innerHTML = '';

    if (segments.length === 0) {
        container.innerHTML = '<div style="color:var(--primary-dim);font-size:0.72rem;padding:4px 0">No segments. Add below.</div>';
    }

    segments.forEach((seg, idx) => {
        const row = document.createElement('div');
        row.className = 'segment-item';
        row.dataset.id = seg.id;
        row.dataset.pos = idx;

        const typeLabel = seg.type === 'youtube' ? 'YT' : 'TTS';
        const title = seg.type === 'youtube' ? (seg.youtube_title || seg.youtube_video_id) : (seg.tts_text || '').slice(0, 40);

        row.innerHTML = `
            <span class="segment-pos">${idx + 1}.</span>
            <div class="segment-info">
                <span class="segment-type ${seg.type}">${typeLabel}</span>
                <span class="segment-title" title="${title}">${title}</span>
                <div class="segment-dur">${formatDuration(seg.duration_sec)}</div>
            </div>
        `;

        if (editable) {
            const ctrl = document.createElement('div');
            ctrl.className = 'segment-controls';
            if (idx > 0) {
                const upBtn = document.createElement('button');
                upBtn.className = 'seg-btn';
                upBtn.textContent = '▲';
                upBtn.title = 'Move up';
                upBtn.onclick = () => moveSegment(station.id, segments, idx, -1, container, editable);
                ctrl.appendChild(upBtn);
            }
            if (idx < segments.length - 1) {
                const downBtn = document.createElement('button');
                downBtn.className = 'seg-btn';
                downBtn.textContent = '▼';
                downBtn.title = 'Move down';
                downBtn.onclick = () => moveSegment(station.id, segments, idx, 1, container, editable);
                ctrl.appendChild(downBtn);
            }
            const delBtn = document.createElement('button');
            delBtn.className = 'seg-btn danger';
            delBtn.textContent = '✕';
            delBtn.title = 'Delete segment';
            delBtn.onclick = async () => {
                if (!confirm('Delete this segment?')) return;
                try {
                    await apiFetch(`/api/segments/${seg.id}`, { method: 'DELETE' });
                    await renderSegmentList(station, container, editable);
                } catch (e) {
                    alert(e.message);
                }
            };
            ctrl.appendChild(delBtn);
            row.appendChild(ctrl);
        }

        container.appendChild(row);
    });

    if (editable) {
        container.appendChild(buildAddSegmentForm(station, container));
    }

    return segments;
}

async function moveSegment(stationId, segments, fromIdx, delta, container, editable) {
    const toIdx = fromIdx + delta;
    if (toIdx < 0 || toIdx >= segments.length) return;
    const newOrder = segments.map(s => s.id);
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    try {
        await apiFetch(`/api/stations/${stationId}/segments/reorder`, {
            method: 'PUT',
            body: JSON.stringify({ order: newOrder })
        });
        const station = { id: stationId };
        await renderSegmentList(station, container, true);
    } catch (e) {
        alert(e.message);
    }
}

function buildAddSegmentForm(station, listContainer) {
    const form = document.createElement('div');
    form.className = 'add-segment-form';
    form.innerHTML = `
        <h4>+ ADD SEGMENT</h4>
        <div class="seg-type-tabs">
            <button class="tab-btn active" id="seg-tab-yt" onclick="switchSegTab('youtube', this)">YOUTUBE</button>
            <button class="tab-btn" id="seg-tab-tts" onclick="switchSegTab('tts', this)">TTS / SAM</button>
        </div>
        <div id="seg-form-youtube">
            <label class="field-label">YOUTUBE URL OR ID:</label>
            <input type="text" id="seg-yt-url" class="terminal-input" placeholder="https://youtube.com/watch?v=...">
            <label class="field-label">START OFFSET (sec):</label>
            <input type="number" id="seg-yt-start" class="terminal-input" placeholder="0" min="0" step="1" value="0">
            <label class="field-label">END OFFSET (sec, optional):</label>
            <input type="number" id="seg-yt-end" class="terminal-input" placeholder="leave blank for full video" min="0" step="1">
            <button class="btn-terminal btn-primary" onclick="validateAndAddYT(${station.id})">▶ VALIDATE & ADD</button>
            <div id="seg-yt-status" class="error-msg"></div>
        </div>
        <div id="seg-form-tts" style="display:none">
            <label class="field-label">TTS TEXT:</label>
            <textarea id="seg-tts-text" class="terminal-input" rows="3" placeholder="Type your announcement..."></textarea>
            <label class="field-label">DURATION (sec):</label>
            <input type="number" id="seg-tts-dur" class="terminal-input" placeholder="e.g. 5" min="0.5" step="0.5">
            <small class="hint-text">Approximate: ~3 words/sec. TTS generated client-side via SAM.js.</small>
            <button class="btn-terminal btn-primary" onclick="addTTSSegment(${station.id})">▶ ADD TTS SEGMENT</button>
            <div id="seg-tts-status" class="error-msg"></div>
        </div>
    `;
    return form;
}

function switchSegTab(type, btn) {
    document.querySelectorAll('.seg-type-tabs .tab-btn').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('seg-form-youtube').style.display = type === 'youtube' ? '' : 'none';
    document.getElementById('seg-form-tts').style.display = type === 'tts' ? '' : 'none';
}

async function validateAndAddYT(stationId) {
    const urlInput = document.getElementById('seg-yt-url').value.trim();
    const statusEl = document.getElementById('seg-yt-status');
    const startSec = parseFloat(document.getElementById('seg-yt-start').value) || 0;
    const endVal = document.getElementById('seg-yt-end').value;
    const endSec = endVal ? parseFloat(endVal) : null;

    statusEl.style.color = 'var(--primary-dim)';
    statusEl.textContent = 'VALIDATING...';

    const videoId = extractYouTubeId(urlInput);
    if (!videoId) {
        statusEl.style.color = 'var(--alert)';
        statusEl.textContent = 'Could not extract YouTube video ID';
        return;
    }

    try {
        const info = await apiFetch(`/api/youtube/validate?v=${videoId}`);
        statusEl.style.color = 'var(--live)';
        statusEl.textContent = `✓ ${info.title}`;

        // For YT, we'll get duration client-side using a temporary player
        // For now, ask user or estimate
        const dur = await getYTDuration(videoId, startSec, endSec);
        const effectiveDur = endSec ? (endSec - startSec) : (dur - startSec);

        await apiFetch(`/api/stations/${stationId}/segments`, {
            method: 'POST',
            body: JSON.stringify({
                type: 'youtube',
                youtube_video_id: videoId,
                youtube_title: info.title,
                start_offset_sec: startSec,
                end_offset_sec: endSec || null,
                duration_sec: Math.max(1, effectiveDur)
            })
        });

        statusEl.textContent = '✓ Segment added';
        // Refresh
        const listEl = document.getElementById('seg-edit-list');
        if (listEl) await renderSegmentList({ id: stationId }, listEl, true);
    } catch (e) {
        statusEl.style.color = 'var(--alert)';
        statusEl.textContent = e.message;
    }
}

// Get YT duration via temporary hidden player
function getYTDuration(videoId, startSec, endSec) {
    return new Promise((resolve) => {
        if (endSec && endSec > startSec) {
            resolve(endSec - startSec);
            return;
        }
        // Use a tiny hidden iframe to get duration
        const tempDiv = document.createElement('div');
        tempDiv.style.display = 'none';
        document.body.appendChild(tempDiv);

        const done = (dur) => {
            if (tempPlayer) { try { tempPlayer.destroy(); } catch(e){} }
            document.body.removeChild(tempDiv);
            resolve(dur);
        };

        let tempPlayer;
        const timeout = setTimeout(() => done(300), 10000); // fallback 5min

        try {
            tempPlayer = new YT.Player(tempDiv, {
                videoId,
                playerVars: { autoplay: 0 },
                events: {
                    onReady: (e) => {
                        clearTimeout(timeout);
                        const dur = e.target.getDuration();
                        done(dur > 0 ? dur - startSec : 300);
                    },
                    onError: () => {
                        clearTimeout(timeout);
                        done(300);
                    }
                }
            });
        } catch(e) {
            clearTimeout(timeout);
            resolve(300);
        }
    });
}

async function addTTSSegment(stationId) {
    const text = document.getElementById('seg-tts-text').value.trim();
    const durVal = document.getElementById('seg-tts-dur').value;
    const statusEl = document.getElementById('seg-tts-status');

    if (!text) {
        statusEl.style.color = 'var(--alert)';
        statusEl.textContent = 'Text is required';
        return;
    }

    const duration_sec = durVal ? parseFloat(durVal) : Math.max(1, Math.ceil(text.split(/\s+/).length / 3));

    try {
        await apiFetch(`/api/stations/${stationId}/segments`, {
            method: 'POST',
            body: JSON.stringify({
                type: 'tts',
                tts_text: text,
                duration_sec
            })
        });
        statusEl.style.color = 'var(--live)';
        statusEl.textContent = '✓ TTS segment added';
        document.getElementById('seg-tts-text').value = '';

        const listEl = document.getElementById('seg-edit-list');
        if (listEl) await renderSegmentList({ id: stationId }, listEl, true);
    } catch (e) {
        statusEl.style.color = 'var(--alert)';
        statusEl.textContent = e.message;
    }
}
