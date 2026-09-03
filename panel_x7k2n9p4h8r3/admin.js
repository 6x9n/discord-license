(function () {
  'use strict';

  const SES_KEY = 'dmt.admin.secret';

  const el = (function () {
    function g(id) {
      return document.getElementById(id);
    }
    return {
      loginView: g('loginView'),
      appView: g('appView'),
      loginForm: g('loginForm'),
      secret: g('secret'),
      loginMsg: g('loginMsg'),
      loginBtn: g('loginBtn'),
      logoutBtn: g('logoutBtn'),
      overviewView: g('overviewView'),
      keysView: g('keysView'),
      overviewClock: g('overviewClock'),
      keysBody: g('keysBody'),
      searchInput: g('searchInput'),
      resultCount: g('resultCount'),
      emptyMsg: g('emptyMsg'),
      openCreateBtn: g('openCreateBtn'),
      statTotal: g('statTotal'),
      statActive: g('statActive'),
      statRevoked: g('statRevoked'),
      statTable: g('statTable'),
      keyModal: g('keyModal'),
      modalTitle: g('modalTitle'),
      newKeyBox: g('newKeyBox'),
      generatedKey: g('generatedKey'),
      copyKeyBtn: g('copyKeyBtn'),
      keyForm: g('keyForm'),
      editId: g('editId'),
      fPreset: g('fPreset'),
      applyPresetBtn: g('applyPresetBtn'),
      fOwner: g('fOwner'),
      fLabel: g('fLabel'),
      fDays: g('fDays'),
      fMax: g('fMax'),
      fNotes: g('fNotes'),
      fRevoked: g('fRevoked'),
      keyFormMsg: g('keyFormMsg'),
      cancelModalBtn: g('cancelModalBtn'),
      submitKeyBtn: g('submitKeyBtn'),
      confirmModal: g('confirmModal'),
      confirmText: g('confirmText'),
      confirmMsg: g('confirmMsg'),
      confirmCancel: g('confirmCancel'),
      confirmOk: g('confirmOk'),
      toastContainer: g('toastContainer')
    };
  })();

  let keys = [];
  let pending = null;

  // Predefined plan presets: name, default account limit, default instructions.
  // 'custom' leaves plan/accounts/notes free for the admin to define.
  const PLANS = {
    trial: {
      name: 'Trial',
      maxAccounts: 1,
      durationHint: 7,
      notes: 'Welcome to the Trial plan!\n\nWhat you get:\n\u2022 Test the Discord tool with limited access.\n\u2022 1 account allowed on this key.\n\u2022 Full feature review before upgrading.\n\nHow to start:\n\u2022 Open the tool and paste your license key to activate.\n\u2022 Load the account and try the dashboard.\n\nNeed more? Contact the owner on Telegram to upgrade to Standard, Pro or Vip.'
    },
    standard: {
      name: 'Standard',
      maxAccounts: 1,
      durationHint: 30,
      notes: 'Welcome to the Standard plan!\n\nWhat you get:\n\u2022 1 account allowed on this key.\n\u2022 Core dashboard features and saved accounts.\n\u2022 Standard support.\n\nHow to start:\n\u2022 Open the tool and paste your license key to activate.\n\u2022 Your account usage shows in the activation screen.\n\nNeed help? Contact the owner on Telegram: https://t.me/mythicxd'
    },
    pro: {
      name: 'Pro',
      maxAccounts: 3,
      durationHint: 30,
      notes: 'Welcome to the Pro plan!\n\nWhat you get:\n\u2022 Up to 3 accounts on this key.\n\u2022 All dashboard features and automations.\n\u2022 Priority support.\n\nHow to start:\n\u2022 Activate with your key, then switch between up to 3 accounts.\n\u2022 Watch your usage in the activation confirmation.\n\nLimit reached? Use a higher plan (Vip) or contact the owner.'
    },
    vip: {
      name: 'Vip',
      maxAccounts: 10,
      durationHint: 90,
      notes: 'Welcome to the Vip plan!\n\nWhat you get:\n\u2022 Up to 10 accounts on this key.\n\u2022 Everything in Pro plus fully unlocked limits.\n\u2022 Direct support from the owner.\n\nHow to start:\n\u2022 Activate with your key and manage up to 10 accounts.\n\u2022 Your activation screen shows live usage.\n\nQuestions? Contact the owner on Telegram: https://t.me/mythicxd'
    },
    custom: {
      name: '',
      maxAccounts: null,
      durationHint: null,
      notes: ''
    }
  };

  function getSecret() {
    return sessionStorage.getItem(SES_KEY) || '';
  }

  function toast(text, kind) {
    if (!el.toastContainer) {
      return;
    }
    const node = document.createElement('div');
    node.className = 'toast' + (kind ? ' toast-' + kind : '');
    node.textContent = text;
    el.toastContainer.appendChild(node);
    setTimeout(function () {
      node.remove();
    }, 3200);
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
      return '—';
    }
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function daysLeft(iso) {
    if (!iso) {
      return null;
    }
    const ms = Date.parse(iso);
    if (isNaN(ms)) {
      return null;
    }
    if (ms <= Date.now()) {
      return 0;
    }
    return Math.max(0, Math.ceil((ms - Date.now()) / 86400000));
  }

  function statusBadge(k) {
    if (k.revoked) {
      return '<span class="badge badge-revoked">Revoked</span>';
    }
    if (!k.expires_at) {
      return '<span class="badge badge-lifetime">Lifetime</span>';
    }
    const exp = new Date(k.expires_at).getTime();
    const dl = daysLeft(k.expires_at);
    if (exp <= Date.now()) {
      return '<span class="badge badge-revoked">Expired</span>';
    }
    if (dl <= 3) {
      return '<span class="badge badge-warn">' + dl + 'd left</span>';
    }
    return '<span class="badge badge-ok">Active</span>';
  }

  function activationBadge(k) {
    const used = (k.activationCount || 0);
    const max = (k.max_activations || 1);
    if (used >= max) {
      return '<span class="badge badge-ok">Activated</span>';
    }
    if (used > 0) {
      return '<span class="badge badge-warn">Partial</span>';
    }
    return '<span class="badge badge-muted">Unused</span>';
  }

  function usageText(k) {
    const used = (k.activationCount || 0);
    const max = (k.max_activations || 1);
    const left = Math.max(0, max - used);
    return used + ' of ' + max + ' used' + (left > 0 ? ' &mdash; ' + left + ' left' : ' &mdash; full');
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
        (String(k.owner || '').toLowerCase().indexOf(q) !== -1) ||
        (String(k.label || '').toLowerCase().indexOf(q) !== -1);
    });

    el.keysBody.innerHTML = '';
    filtered.forEach(function (k) {
      const tr = document.createElement('tr');
      const activations = (k.activationCount || 0);
      const maxAccounts = (k.max_activations || 1);
      const duration = k.expires_at ? (daysLeft(k.expires_at) === null ? '—' : ((k.revoked ? '<span class="muted-text">' : '') + daysLeft(k.expires_at) + 'd' + (k.revoked ? '</span>' : ''))) : '<span class="badge badge-lifetime">Lifetime</span>';
      const usedWidth = Math.min(100, Math.round((activations / maxAccounts) * 100));
      tr.innerHTML =
        '<td class="key-cell">' + esc(k.plain_key || k.key_hash) + '</td>' +
        '<td>' + (esc(k.owner || '—')) + '</td>' +
        '<td>' + esc(k.label || '—') + '</td>' +
        '<td>' + duration + '</td>' +
        '<td>' + activationBadge(k) + '</td>' +
        '<td>' +
          '<div class="acc-bar"><div class="acc-fill" style="width:' + usedWidth + '%"></div></div>' +
          '<span class="acc-count">' + usageText(k) + '</span>' +
        '</td>' +
        '<td>' + statusBadge(k) + '</td>' +
        '<td>' + esc(k.last_validated_at ? fmtDate(k.last_validated_at) : '—') + '</td>' +
        '<td>' + esc(k.created_at ? fmtDate(k.created_at) : '—') + '</td>' +
        '<td><div class="row-actions">' +
        '<button class="btn btn-ghost mini-btn" data-act="edit" data-id="' + esc(k.id) + '">Edit</button>' +
        '<button class="btn btn-ghost mini-btn" data-act="clear" data-id="' + esc(k.id) + '">Reset</button>' +
        '<button class="btn btn-danger mini-btn" data-act="delete" data-id="' + esc(k.id) + '">Delete</button>' +
        '</div></td>';
      tr.querySelector('[data-act="edit"]').addEventListener('click', function () { openEdit(k); });
      tr.querySelector('[data-act="clear"]').addEventListener('click', function () { confirmClear(k); });
      tr.querySelector('[data-act="delete"]').addEventListener('click', function () { confirmDelete(k); });
      el.keysBody.appendChild(tr);
    });

    el.emptyMsg.hidden = filtered.length !== 0;
    el.resultCount.textContent = filtered.length + ' of ' + keys.length;
    renderStats();
  }

  function renderStats() {
    let total = keys.length;
    let active = 0;
    let revoked = 0;
    let acts = 0;
    keys.forEach(function (k) {
      if (k.revoked) {
        revoked++;
      } else if (!k.expires_at || new Date(k.expires_at).getTime() > Date.now()) {
        active++;
      } else {
        revoked++;
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
      toast(err.message, 'error');
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
    setNav('overview');
  }

  function setNav(name) {
    el.overviewView.hidden = name !== 'overview';
    el.keysView.hidden = name !== 'keys';
    document.querySelectorAll('.sidebar-link[data-nav]').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-nav') === name);
    });
  }

  function openCreate() {
    resetForm();
    el.modalTitle.textContent = 'New License Key';
    el.editId.value = '';
    el.newKeyBox.hidden = true;
    el.generatedKey.textContent = '';
    el.keyModal.hidden = false;
    el.fOwner.focus();
  }

  function applyPreset() {
    const val = el.fPreset.value;
    const plan = PLANS[val];
    if (!plan) {
      return;
    }
    if (val === 'custom') {
      return;
    }
    el.fLabel.value = plan.name;
    if (plan.maxAccounts !== null) {
      el.fMax.value = String(plan.maxAccounts);
    }
    if (plan.durationHint !== null) {
      el.fDays.value = String(plan.durationHint);
    }
    if (plan.notes) {
      el.fNotes.value = plan.notes;
    }
  }

  function matchPreset(k) {
    const name = String(k.label || '').trim().toLowerCase();
    let found = '';
    Object.keys(PLANS).forEach(function (key) {
      const val = PLANS[key];
      if (!val.durationHint) {
        return;
      }
      if (name === String(val.name).toLowerCase()) {
        found = key;
      }
    });
    return found;
  }

  function openEdit(k) {
    resetForm();
    el.modalTitle.textContent = 'Edit License Key';
    el.editId.value = k.id;
    el.newKeyBox.hidden = true;
    el.fOwner.value = k.owner || '';
    el.fLabel.value = k.label || '';
    const dl = daysLeft(k.expires_at);
    el.fDays.value = dl === null ? '' : String(dl);
    el.fMax.value = k.max_activations || 1;
    el.fNotes.value = k.notes || '';
    el.fRevoked.checked = !!k.revoked;
    const preset = matchPreset(k);
    el.fPreset.value = preset || '';
    el.keyModal.hidden = false;
  }

  function resetForm() {
    el.fPreset.value = '';
    el.fOwner.value = '';
    el.fLabel.value = '';
    el.fDays.value = '';
    el.fMax.value = '1';
    el.fNotes.value = '';
    el.fRevoked.checked = false;
    setFormMsg('');
  }

  function closeModal() {
    el.keyModal.hidden = true;
  }

  function showConfirm(text, onOk, dangerLabel) {
    el.confirmText.textContent = text;
    el.confirmMsg.textContent = '';
    el.confirmMsg.className = 'msg';
    el.confirmOk.textContent = dangerLabel || 'Confirm';
    pending = onOk;
    el.confirmModal.hidden = false;
  }

  function closeConfirm() {
    el.confirmModal.hidden = true;
    pending = null;
  }

  function confirmDelete(k) {
    showConfirm(
      'Delete license ' + (k.plain_key || k.id) + '? This also clears its account activations. This cannot be undone.',
      async function () {
        await api('/api/admin/keys/' + encodeURIComponent(k.id), { method: 'DELETE' });
        toast('Key deleted.');
        closeConfirm();
        loadKeys();
      },
      'Delete Key'
    );
  }

  function confirmClear(k) {
    showConfirm(
      'Reset all account activations for this key? Users will need to reactivate.',
      async function () {
        await api('/api/admin/keys/' + encodeURIComponent(k.id) + '/activations', { method: 'DELETE' });
        toast('Activations cleared.');
        closeConfirm();
        loadKeys();
      },
      'Reset'
    );
  }

  async function handleKeySubmit(e) {
    e.preventDefault();
    const id = el.editId.value;
    const daysRaw = String(el.fDays.value || '').trim();
    const body = {
      owner: el.fOwner.value.trim(),
      label: el.fLabel.value.trim() || 'Standard',
      days: daysRaw === '' ? 0 : parseInt(daysRaw, 10),
      max_activations: parseInt(el.fMax.value, 10) || 1,
      notes: el.fNotes.value.trim(),
      revoked: el.fRevoked.checked
    };
    if (id) {
      body.expires_at = null; // reuse days path on the server
    }
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

  function tickClock() {
    if (el.overviewClock) {
      el.overviewClock.textContent = new Date().toLocaleString();
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
      setLoginMsg('Verifying...', 'info');
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

    document.querySelectorAll('.sidebar-link[data-nav]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        setNav(a.getAttribute('data-nav'));
      });
    });

    el.openCreateBtn.addEventListener('click', openCreate);
    el.applyPresetBtn.addEventListener('click', function () {
      applyPreset();
      toast('Plan preset applied.');
    });
    el.fPreset.addEventListener('change', function () {
      if (el.fPreset.value === 'custom') {
        el.fNotes.focus();
      } else if (el.fPreset.value) {
        applyPreset();
        toast('Plan "' + el.fLabel.value + '" applied.');
      }
    });
    el.cancelModalBtn.addEventListener('click', closeModal);
    el.keyModal.addEventListener('click', function (e) {
      if (e.target === el.keyModal) {
        closeModal();
      }
    });
    el.keyForm.addEventListener('submit', handleKeySubmit);
    el.confirmCancel.addEventListener('click', closeConfirm);
    el.confirmOk.addEventListener('click', function () {
      el.confirmOk.disabled = true;
      Promise.resolve(pending()).catch(function (err) {
        el.confirmMsg.textContent = err.message || 'Action failed.';
        el.confirmMsg.className = 'msg msg-error';
      }).finally(function () {
        if (el.confirmModal.hidden) {
          el.confirmOk.disabled = false;
        }
      });
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

    tickClock();
    setInterval(tickClock, 30000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();