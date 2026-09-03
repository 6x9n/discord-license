(function () {
  'use strict';

  const SES_KEY = 'dmt.admin.secret';

  const el = {
    loginView: document.getElementById('loginView'),
    appView: document.getElementById('appView'),
    loginForm: document.getElementById('loginForm'),
    secret: document.getElementById('secret'),
    loginMsg: document.getElementById('loginMsg'),
    loginBtn: document.getElementById('loginBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    keysBody: document.getElementById('keysBody'),
    searchInput: document.getElementById('searchInput'),
    emptyMsg: document.getElementById('emptyMsg'),
    openCreateBtn: document.getElementById('openCreateBtn'),
    statTotal: document.getElementById('statTotal'),
    statActive: document.getElementById('statActive'),
    statRevoked: document.getElementById('statRevoked'),
    statTable: document.getElementById('statTable'),
    keyModal: document.getElementById('keyModal'),
    modalTitle: document.getElementById('modalTitle'),
    newKeyBox: document.getElementById('newKeyBox'),
    generatedKey: document.getElementById('generatedKey'),
    copyKeyBtn: document.getElementById('copyKeyBtn'),
    keyForm: document.getElementById('keyForm'),
    editId: document.getElementById('editId'),
    fLabel: document.getElementById('fLabel'),
    fExpires: document.getElementById('fExpires'),
    fMax: document.getElementById('fMax'),
    fRevoked: document.getElementById('fRevoked'),
    keyFormMsg: document.getElementById('keyFormMsg'),
    cancelModalBtn: document.getElementById('cancelModalBtn'),
    submitKeyBtn: document.getElementById('submitKeyBtn'),
    confirmModal: document.getElementById('confirmModal'),
    confirmText: document.getElementById('confirmText'),
    confirmMsg: document.getElementById('confirmMsg'),
    confirmCancel: document.getElementById('confirmCancel'),
    confirmOk: document.getElementById('confirmOk'),
    toastContainer: document.getElementById('toastContainer')
  };

  let keys = [];
  let pending = null;

  function getSecret() {
    return sessionStorage.getItem(SES_KEY) || '';
  }

  function toast(text) {
    if (!el.toastContainer) {
      return;
    }
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = text;
    el.toastContainer.appendChild(node);
    setTimeout(function () {
      node.remove();
    }, 3000);
  }

  function setLoginMsg(text, kind) {
    el.loginMsg.textContent = text || '';
    el.loginMsg.className = 'msg' + (kind ? ' msg-' + kind : '');
  }

  function setFormMsg(text, kind) {
    el.keyFormMsg.textContent = text || '';
    el.keyFormMsg.className = 'msg' + (kind ? ' msg-' + kind : '');
  }

  async function api(path, options) {
    const opts = options || {};
    const headers = Object.assign({
      'Content-Type': 'application/json'
    }, opts.headers || {});
    if (getSecret()) {
      headers['Authorization'] = 'Bearer ' + getSecret();
    }
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    });
    let data = {};
    try {
      data = await res.json();
    } catch (e) {}
    if (!res.ok) {
      throw new Error((data && (data.error || data.message)) || 'Request failed.');
    }
    return data;
  }

  function fmtDate(iso) {
    if (!iso) {
      return 'â€”';
    }
    const d = new Date(iso);
    return isNaN(d.getTime()) ? 'â€”' : d.toLocaleString();
  }

  function statusBadge(row) {
    if (row.revoked) {
      return '<span class="badge badge-revoked">Revoked</span>';
    }
    if (!row.expires_at) {
      return '<span class="badge badge-lifetime">Lifetime</span>';
    }
    const exp = new Date(row.expires_at).getTime();
    return exp > Date.now()
      ? '<span class="badge badge-ok">Active</span>'
      : '<span class="badge badge-revoked">Expired</span>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderTable() {
    const q = (el.searchInput.value || '').trim().toLowerCase();
    const filtered = keys.filter(function (k) {
      if (!q) {
        return true;
      }
      return (String(k.plain_key || '').toLowerCase().indexOf(q) !== -1) ||
        (String(k.key_hash || '').toLowerCase().indexOf(q) !== -1) ||
        (String(k.label || '').toLowerCase().indexOf(q) !== -1);
    });

    el.keysBody.innerHTML = '';
    filtered.forEach(function (k) {
      const tr = document.createElement('tr');
      const activations = (k.activationCount || 0);
      tr.innerHTML =
        '<td class="key-cell">' + esc(k.plain_key || k.key_hash) + '</td>' +
        '<td>' + esc(k.label || 'â€”') + '</td>' +
        '<td>' + esc(k.expires_at ? fmtDate(k.expires_at) : 'Lifetime') + '</td>' +
        '<td>' + esc(k.max_activations) + '</td>' +
        '<td>' + statusBadge(k) + '</td>' +
        '<td>' + esc(activations) + '</td>' +
        '<td>' + esc(k.last_validated_at ? fmtDate(k.last_validated_at) : 'â€”') + '</td>' +
        '<td>' + esc(k.created_at ? fmtDate(k.created_at) : 'â€”') + '</td>' +
        '<td><div class="row-actions">' +
        '<button class="btn btn-ghost mini-btn" data-act="edit" data-id="' + esc(k.id) + '">Edit</button>' +
        '<button class="btn btn-ghost mini-btn" data-act="clear" data-id="' + esc(k.id) + '">Clear Devs</button>' +
        '<button class="btn btn-danger mini-btn" data-act="delete" data-id="' + esc(k.id) + '">Delete</button>' +
        '</div></td>';
      tr.querySelector('[data-act="edit"]').addEventListener('click', function () { openEdit(k); });
      tr.querySelector('[data-act="clear"]').addEventListener('click', function () { confirmClear(k); });
      tr.querySelector('[data-act="delete"]').addEventListener('click', function () { confirmDelete(k); });
      el.keysBody.appendChild(tr);
    });

    el.emptyMsg.hidden = filtered.length !== 0;
    renderStats();
  }

  function renderStats() {
    const total = keys.length;
    let active = 0;
    let revoked = 0;
    let acts = 0;
    keys.forEach(function (k) {
      if (k.revoked) {
        revoked++;
      } else if (!k.expires_at || new Date(k.expires_at).getTime() > Date.now()) {
        active++;
      }
      acts += (k.activationCount || 0);
    });
    el.statTotal.textContent = total;
    el.statActive.textContent = active;
    el.statRevoked.textContent = revoked;
    el.statTable.textContent = acts;
  }

  async function loadKeys() {
    try {
      const res = await api('/api/admin/keys');
      keys = res.data || [];
      renderTable();
    } catch (err) {
      keys = [];
      renderTable();
    }
  }

  function showLogin() {
    el.appView.hidden = true;
    el.loginView.hidden = false;
    el.secret.focus();
  }

  function showApp() {
    el.loginView.hidden = true;
    el.appView.hidden = false;
    loadKeys();
  }

  function openCreate() {
    resetForm();
    el.modalTitle.textContent = 'New License Key';
    el.editId.value = '';
    el.newKeyBox.hidden = true;
    el.generatedKey.textContent = '';
    el.keyModal.hidden = false;
    el.fLabel.focus();
  }

  function openEdit(k) {
    resetForm();
    el.modalTitle.textContent = 'Edit License Key';
    el.editId.value = k.id;
    el.newKeyBox.hidden = true;
    el.fLabel.value = k.label || '';
    el.fExpires.value = k.expires_at || '';
    el.fMax.value = k.max_activations || 1;
    el.fRevoked.checked = !!k.revoked;
    el.keyModal.hidden = false;
  }

  function resetForm() {
    el.fLabel.value = '';
    el.fExpires.value = '';
    el.fMax.value = '1';
    el.fRevoked.checked = false;
    setFormMsg('');
  }

  function closeModal() {
    el.keyModal.hidden = true;
  }

  function showConfirm(text, onOk) {
    el.confirmText.textContent = text;
    el.confirmMsg.textContent = '';
    el.confirmMsg.className = 'msg';
    pending = onOk;
    el.confirmModal.hidden = false;
  }

  function closeConfirm() {
    el.confirmModal.hidden = true;
    pending = null;
  }

  function confirmDelete(k) {
    showConfirm('Delete license key ' + (k.plain_key || k.id) + '? This also clears its device activations.', async function () {
      await api('/api/admin/keys/' + encodeURIComponent(k.id), { method: 'DELETE' });
      toast('Key deleted.');
      closeConfirm();
      loadKeys();
    });
  }

  function confirmClear(k) {
    showConfirm('Clear all device activations for this key?', async function () {
      await api('/api/admin/keys/' + encodeURIComponent(k.id) + '/activations', { method: 'DELETE' });
      toast('Activations cleared.');
      closeConfirm();
      loadKeys();
    });
  }

  async function handleKeySubmit(e) {
    e.preventDefault();
    const id = el.editId.value;
    const body = {
      label: el.fLabel.value.trim() || 'Standard',
      expires_at: el.fExpires.value.trim() || null,
      max_activations: parseInt(el.fMax.value, 10) || 1,
      revoked: el.fRevoked.checked
    };
    el.submitKeyBtn.disabled = true;
    setFormMsg('Saving...', 'info');
    try {
      if (id) {
        await api('/api/admin/keys/' + encodeURIComponent(id), { method: 'PATCH', body: body });
        toast('Key updated.');
      } else {
        const res = await api('/api/admin/keys', { method: 'POST', body: body });
        if (res.data && res.data.key) {
          el.newKeyBox.hidden = false;
          el.generatedKey.textContent = res.data.key;
        }
        toast('Key created.');
      }
      setFormMsg('');
      loadKeys();
    } catch (err) {
      setFormMsg(err.message, 'error');
    } finally {
      el.submitKeyBtn.disabled = false;
    }
  }

  function init() {
    if (getSecret()) {
      showApp();
    } else {
      showLogin();
    }

    el.loginForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const secret = el.secret.value.trim();
      if (!secret) {
        setLoginMsg('Enter the admin secret.', 'error');
        return;
      }
      el.loginBtn.disabled = true;
      setLoginMsg('Signing in...', 'info');
      try {
        sessionStorage.setItem(SES_KEY, secret);
        await api('/api/admin/validate', {
          method: 'POST',
          body: { secret: secret }
        });
        setLoginMsg('');
        showApp();
      } catch (err) {
        sessionStorage.removeItem(SES_KEY);
        setLoginMsg(err.message || 'Access denied.', 'error');
      } finally {
        el.loginBtn.disabled = false;
      }
    });

    el.logoutBtn.addEventListener('click', function () {
      sessionStorage.removeItem(SES_KEY);
      showLogin();
    });

    el.openCreateBtn.addEventListener('click', openCreate);
    el.cancelModalBtn.addEventListener('click', closeModal);
    el.keyModal.addEventListener('click', function (e) {
      if (e.target === el.keyModal) {
        closeModal();
      }
    });
    el.keyForm.addEventListener('submit', handleKeySubmit);
    el.confirmCancel.addEventListener('click', closeConfirm);
    el.confirmOk.addEventListener('click', function () {
      if (pending) {
        Promise.resolve(pending()).catch(function (err) {
          el.confirmMsg.textContent = err.message || 'Action failed.';
          el.confirmMsg.className = 'msg msg-error';
        });
      }
    });
    el.copyKeyBtn.addEventListener('click', function () {
      const val = el.generatedKey.textContent;
      if (navigator.clipboard && val) {
        navigator.clipboard.writeText(val).then(function () {
          toast('Copied.');
        });
      }
    });
    el.searchInput.addEventListener('input', renderTable);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();