(function () {
  const els = {
    adminView: document.getElementById('adminView'),
    licenseScreen: document.getElementById('licenseScreen'),
    appScreen: document.getElementById('appScreen'),
    loginModal: document.getElementById('adminLoginModal'),
    passwordInput: document.getElementById('adminPasswordInput'),
    loginBtn: document.getElementById('adminLoginBtn'),
    loginMsg: document.getElementById('adminLoginMsg'),
    panel: document.getElementById('adminPanel'),
    status: document.getElementById('adminStatus'),
    logoutBtn: document.getElementById('adminLogoutBtn'),
    duration: document.getElementById('adminDuration'),
    noteInput: document.getElementById('adminNoteInput'),
    genBtn: document.getElementById('adminGenBtn'),
    copyBox: document.getElementById('adminCopyBox'),
    copyText: document.getElementById('adminCopyText'),
    searchInput: document.getElementById('adminSearchInput'),
    keysBody: document.getElementById('adminKeysBody'),
    emptyMsg: document.getElementById('adminEmptyMsg')
  };

  const TOKEN_KEY = 'dmt.admin.token';
  const EXTEND_DAYS = 30;

  let keys = [];

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function token() {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  }

  function isAuthed() {
    return !!token();
  }

  function setBusy(btn, busy) {
    if (window.appSetBusy) {
      window.appSetBusy(btn, busy);
      return;
    }
    btn.classList.toggle('loading', busy);
    btn.disabled = busy;
  }

  function toast(message, kind) {
    if (window.appToast) {
      window.appToast(message, kind);
      return;
    }
    if (message) {
      elToast(message, kind);
    }
  }

  function elToast(message, kind) {
    const container = document.getElementById('toastContainer');
    if (!container) {
      return;
    }
    const node = document.createElement('div');
    node.className = 'toast ' + kind;
    node.innerHTML = '<div class="toast-text"></div><div class="toast-bar"></div>';
    node.querySelector('.toast-text').textContent = message;
    container.appendChild(node);
    requestAnimationFrame(function () {
      node.classList.add('showing');
    });
    setTimeout(function () {
      node.classList.add('out');
    }, 3950);
    setTimeout(function () {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }, 4350);
  }

  function fmtDate(ms, isLifetime) {
    if (isLifetime) {
      return 'Lifetime';
    }
    return new Date(ms).toISOString().replace('T', ' ').slice(0, 16);
  }

  function isAdminRoute() {
    const hash = window.location.hash;
    return hash === '#admin' || /^\/admin\/?$/.test(window.location.pathname);
  }

  function goto(name) {
    els.licenseScreen.classList.toggle('active', name === 'license');
    els.appScreen.classList.toggle('active', name === 'app');
    els.adminView.classList.toggle('active', name === 'admin');
  }

  function setLoginMsg(text, isError) {
    els.loginMsg.textContent = text;
    els.loginMsg.className = 'msg' + (isError ? ' error' : '');
  }

  async function api(path, method, body) {
    const headers = { 'Content-Type': 'application/json' };
    const t = token();
    if (t) {
      headers.Authorization = 'Bearer ' + t;
    }
    const res = await fetch(path, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    });
    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      data = {};
    }
    if (!res.ok) {
      if (res.status === 401) {
        sessionStorage.removeItem(TOKEN_KEY);
        showLogin();
      }
      throw new Error(data.message || ('Request failed (' + res.status + ').'));
    }
    return data;
  }

  function showLogin() {
    els.panel.hidden = true;
    els.loginModal.classList.add('active');
  }

  function showPanel() {
    els.loginModal.classList.remove('active');
    els.panel.hidden = false;
    loadKeys();
  }

  async function doLogin() {
    const password = els.passwordInput.value;
    if (!password) {
      setLoginMsg('Enter the admin password.', true);
      toast('Enter the admin password.', 'error');
      return;
    }
    setBusy(els.loginBtn, true);
    setLoginMsg('Signing in...', false);
    try {
      const data = await api('/api/admin/login', 'POST', { password: password });
      sessionStorage.setItem(TOKEN_KEY, data.token);
      els.passwordInput.value = '';
      setLoginMsg('', false);
      showPanel();
      toast('Signed in to the admin dashboard.', 'success');
    } catch (e) {
      setLoginMsg(e.message, true);
      toast(e.message, 'error');
    } finally {
      setBusy(els.loginBtn, false);
    }
  }

  async function doGenerate() {
    const durationDays = Number(els.duration.value);
    const note = els.noteInput.value.trim();
    setBusy(els.genBtn, true);
    try {
      const data = await api('/api/admin/keys', 'POST', { durationDays: durationDays, note: note });
      els.copyText.textContent = data.key.key;
      els.copyBox.hidden = false;
      toast('Key generated. Click the key box to copy it.', 'success');
      await loadKeys();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(els.genBtn, false);
    }
  }

  async function loadKeys() {
    els.status.textContent = 'Loading...';
    try {
      const data = await api('/api/admin/keys', 'GET');
      keys = data.keys || [];
      const count = keys.length;
      els.status.textContent = count ? count + ' key' + (count === 1 ? '' : 's') : 'No keys';
      els.status.classList.toggle('badge-warn', count === 0);
      renderRows();
    } catch (e) {
      els.status.textContent = 'Offline';
      toast(e.message, 'error');
    }
  }

  function applyFilter() {
    const q = (els.searchInput.value || '').trim().toLowerCase();
    if (!q) {
      return keys;
    }
    return keys.filter(function (k) {
      return String(k.key).toLowerCase().indexOf(q) !== -1 ||
        String(k.note || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  function renderRows() {
    const list = applyFilter();
    els.keysBody.innerHTML = '';
    els.emptyMsg.textContent = '';
    if (!list.length) {
      els.emptyMsg.textContent = keys.length ? 'No keys match your search.' : 'No keys yet. Generate your first key above.';
      return;
    }
    list.forEach(function (k) {
      const revoked = k.status === 'revoked';
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="cell-key"><code>' + escapeHtml(k.key) + '</code></td>' +
        '<td>' + escapeHtml(k.plan || '—') + '</td>' +
        '<td class="cell-date">' + fmtDate(k.createdAt, false) + '</td>' +
        '<td class="cell-date">' + (revoked ? '—' : fmtDate(k.expiresAt, !k.durationDays)) + '</td>' +
        '<td><span class="status ' + (revoked ? 'status-revoked' : 'status-active') + '">' + (revoked ? 'Revoked' : 'Active') + '</span></td>' +
        '<td class="cell-actions">' +
        '<button class="adminRevokeBtn btn btn-ghost btn-small" data-key="' + escapeHtml(k.key) + '"' + (revoked ? ' disabled' : '') + '>Revoke</button>' +
        '<button class="adminExtendBtn btn btn-ghost btn-small" data-key="' + escapeHtml(k.key) + '"' + (revoked ? ' disabled' : '') + '>+30d</button>' +
        '<button class="adminDeleteBtn btn btn-danger btn-small" data-key="' + escapeHtml(k.key) + '">Delete</button>' +
        '</td>';
      els.keysBody.appendChild(tr);
    });
  }

  async function doRevoke(keyVal) {
    try {
      await api('/api/admin/keys', 'PATCH', { key: keyVal, action: 'revoke' });
      toast('Key revoked.', 'info');
      await loadKeys();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function doExtend(keyVal) {
    try {
      const data = await api('/api/admin/keys', 'PATCH', { key: keyVal, action: 'extend', days: EXTEND_DAYS });
      toast('Key extended by ' + EXTEND_DAYS + ' days.', 'success');
      await loadKeys();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function doDelete(keyVal) {
    try {
      await api('/api/admin/keys', 'DELETE', { key: keyVal });
      toast('Key deleted.', 'info');
      await loadKeys();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch (e) {
      /* noop */
    }
    document.body.removeChild(ta);
  }

  function bind() {
    els.loginBtn.addEventListener('click', doLogin);
    els.passwordInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        doLogin();
      }
    });
    els.genBtn.addEventListener('click', doGenerate);
    els.copyBox.addEventListener('click', function () {
      const text = els.copyText.textContent;
      if (!text || text === '—') {
        return;
      }
      const done = function () {
        toast('Key copied to clipboard.', 'success');
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () {
          fallbackCopy(text);
          done();
        });
      } else {
        fallbackCopy(text);
        done();
      }
    });
    els.searchInput.addEventListener('input', renderRows);
    els.logoutBtn.addEventListener('click', function () {
      sessionStorage.removeItem(TOKEN_KEY);
      els.passwordInput.value = '';
      showLogin();
      toast('Signed out.', 'info');
    });
    els.keysBody.addEventListener('click', function (e) {
      const revokeBtn = e.target.closest('.adminRevokeBtn');
      const extendBtn = e.target.closest('.adminExtendBtn');
      const deleteBtn = e.target.closest('.adminDeleteBtn');
      if (revokeBtn) {
        doRevoke(revokeBtn.getAttribute('data-key'));
      } else if (extendBtn) {
        doExtend(extendBtn.getAttribute('data-key'));
      } else if (deleteBtn) {
        doDelete(deleteBtn.getAttribute('data-key'));
      }
    });
  }

  function boot() {
    bind();
    if (isAdminRoute()) {
      goto('admin');
      if (isAuthed()) {
        showPanel();
      } else {
        showLogin();
      }
    }
  }

  window.addEventListener('hashchange', function () {
    if (isAdminRoute()) {
      goto('admin');
      if (isAuthed()) {
        showPanel();
      } else {
        showLogin();
      }
    } else {
      goto('license');
    }
  });

  boot();
})();