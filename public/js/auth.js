/* auth.js — Login/Register modal logic */

function showAuthModal() {
    document.getElementById('auth-modal').style.display = 'flex';
}

function hideAuthModal() {
    document.getElementById('auth-modal').style.display = 'none';
}

function switchAuthTab(tab) {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(t => {
        if (t.textContent.toLowerCase() === tab) t.classList.add('active');
    });
    document.getElementById('auth-form-login').style.display = tab === 'login' ? '' : 'none';
    document.getElementById('auth-form-register').style.display = tab === 'register' ? '' : 'none';
}

async function doLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    errEl.textContent = '';
    try {
        const data = await apiFetch('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        setAuth(data.token, data.username);
        hideAuthModal();
        onAuthChange();
    } catch (e) {
        errEl.textContent = e.message;
    }
}

async function doRegister() {
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const errEl = document.getElementById('register-error');
    errEl.textContent = '';
    try {
        const data = await apiFetch('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        setAuth(data.token, data.username);
        hideAuthModal();
        onAuthChange();
    } catch (e) {
        errEl.textContent = e.message;
    }
}

function doLogout() {
    clearAuth();
    onAuthChange();
}

function onAuthChange() {
    const username = getUsername();
    const token = getToken();
    const isLoggedIn = !!(username && token);

    document.getElementById('topbar-user').textContent = isLoggedIn ? `[${username}]` : '';
    document.getElementById('btn-login').style.display = isLoggedIn ? 'none' : '';
    document.getElementById('btn-logout').style.display = isLoggedIn ? '' : 'none';
    document.getElementById('btn-create-station').style.display = isLoggedIn ? '' : 'none';

    EventBus.emit('auth:change', { isLoggedIn, username });

    // Update chat socket auth
    if (window.chatSocket) {
        window.chatSocket.auth = { token: token || '' };
        window.chatSocket.disconnect().connect();
    }
}

// Enter key support
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('login-password').addEventListener('keydown', e => {
        if (e.key === 'Enter') doLogin();
    });
    document.getElementById('reg-password').addEventListener('keydown', e => {
        if (e.key === 'Enter') doRegister();
    });
});
