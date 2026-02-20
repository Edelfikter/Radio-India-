/* chat.js — socket.io chat client, draggable panel */

let chatSocket = null;
let chatMinimized = false;
let chatDragging = false;
let chatDragOffset = { x: 0, y: 0 };

function initChat() {
    const token = getToken();
    chatSocket = io({
        auth: { token: token || '' }
    });
    window.chatSocket = chatSocket;

    chatSocket.on('chat:history', (messages) => {
        const container = document.getElementById('chat-messages');
        container.innerHTML = '';
        messages.forEach(appendChatMessage);
    });

    chatSocket.on('chat:broadcast', appendChatMessage);

    chatSocket.on('chat:error', (data) => {
        const container = document.getElementById('chat-messages');
        const el = document.createElement('div');
        el.className = 'chat-msg system-msg';
        el.innerHTML = `<span class="chat-text">${data.error}</span>`;
        container.appendChild(el);
        container.scrollTop = container.scrollHeight;
    });

    chatSocket.on('station:listeners', ({ stationId, count }) => {
        // Update listener count display if viewing that station
        if (_currentPopupStation && _currentPopupStation.id == stationId) {
            const el = document.getElementById('chat-listener-count');
            if (el) el.textContent = `${count} listener${count !== 1 ? 's' : ''}`;
        }
        // Update status bar
        updateStatusBar();
    });

    chatSocket.on('station:update', (station) => {
        addOrUpdatePin(station);
        if (_currentPopupStation && _currentPopupStation.id === station.id) {
            _currentPopupStation = station;
            window._currentPopupStation = station;
            showStationPopup(station, _currentPopupMarker);
        }
        refreshStations();
    });

    // Draggable chat panel
    makeDraggable(document.getElementById('chat-panel'), document.getElementById('chat-header'));

    // Enter key sends message
    document.getElementById('chat-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') sendChat();
    });
}

function appendChatMessage(msg) {
    const container = document.getElementById('chat-messages');
    const el = document.createElement('div');
    el.className = 'chat-msg';
    const time = msg.timestamp ? formatTime(msg.timestamp) : '';
    el.innerHTML = `<span class="chat-time">${time}</span><span class="chat-user">${escapeHtml(msg.username)}:</span><span class="chat-text">${escapeHtml(msg.text)}</span>`;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
}

function sendChat() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    if (!chatSocket) return;

    chatSocket.emit('chat:message', { text });
    input.value = '';
}

function toggleChat() {
    const panel = document.getElementById('chat-panel');
    chatMinimized = !chatMinimized;
    panel.classList.toggle('minimized', chatMinimized);
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function makeDraggable(panel, handle) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    handle.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        isDragging = true;
        const rect = panel.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left = rect.left + 'px';
        panel.style.top = rect.top + 'px';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        panel.style.left = Math.max(0, startLeft + dx) + 'px';
        panel.style.top = Math.max(44, startTop + dy) + 'px';
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
}
