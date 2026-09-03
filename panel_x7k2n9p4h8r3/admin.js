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
      settingsView: g('settingsView'),
      overviewClock: g('overviewClock'),
      overviewRefreshBtn: g('overviewRefreshBtn'),
      keysRefreshBtn: g('keysRefreshBtn'),
      keysBody: g('keysBody'),
      searchInput: g('searchInput'),
      resultCount: g('resultCount'),
      exportKeysBtn: g('exportKeysBtn'),
      emptyMsg: g('emptyMsg'),
      openCreateBtn: g('openCreateBtn'),
      statTotal: g('statTotal'),
      statActive: g('statActive'),
      statRevoked: g('statRevoked'),
      statAccounts: g('statAccounts'),
      statPlans: g('statPlans'),
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
      fMaxDevices: g('fMaxDevices'),
      fNotes: g('fNotes'),
      fRevoked: g('fRevoked'),
      keyFormMsg: g('keyFormMsg'),
      cancelModalBtn: g('cancelModalBtn'),
      submitKeyBtn: g('submitKeyBtn'),
      openPlanCreateBtn: g('openPlanCreateBtn'),
      planModal: g('planModal'),
      planModalTitle: g('planModalTitle'),
      planForm: g('planForm'),
      planEditId: g('planEditId'),
      planName: g('planName'),
      planMaxAccounts: g('planMaxAccounts'),
      planMaxDevices: g('planMaxDevices'),
      planDuration: g('planDuration'),
      planNotes: g('planNotes'),
      planFormMsg: g('planFormMsg'),
      planCancelBtn: g('planCancelBtn'),
      submitPlanBtn: g('submitPlanBtn'),
      plansBody: g('plansBody'),
      plansEmptyMsg: g('plansEmptyMsg'),
      planPreviewModal: g('planPreviewModal'),
      planPreviewName: g('planPreviewName'),
      planPreviewTag: g('planPreviewTag'),
      planPreviewStats: g('planPreviewStats'),
      planPreviewNotes: g('planPreviewNotes'),
      planPreviewClose: g('planPreviewClose'),
      confirmModal: g('confirmModal'),
      confirmText: g('confirmText'),
      confirmMsg: g('confirmMsg'),
      confirmCancel: g('confirmCancel'),
      confirmOk: g('confirmOk'),
      toastContainer: g('toastContainer')
    };
  })();

  let keys = [];
  let plans = [];
  let pending = null;

  // Static fallback presets used only if the plans endpoint is unavailable.
  const SAFETY_NOTE =
    "## Privacy & safety\n- This tool is safe to use on your own account\n- Your token stays on your device - it is never sent to or seen by the owner\n- Only an account ID is counted for usage limits; nothing sensitive is collected";

  const FALLBACK_PLANS = [
    { name: 'Trial', max_accounts: 1, max_devices: 1, duration_days: 3,
      notes: "## Welcome to Trial\nThanks for trying our Discord Manager. Get a feel for the workspace before you upgrade.\n\n## What's included\n- 1 connected account on this key\n- Core dashboard and onboarding tools\n- 3-day access window\n\n## Getting started\n- Activate the key, then connect a Discord account\n- Explore your server metrics and account overview\n\nNeed more power? Upgrade to Standard, Pro, Master or Vip anytime by contacting Mythic.\n\n" + SAFETY_NOTE },
    { name: 'Standard', max_accounts: 3, max_devices: 1, duration_days: 7,
      notes: "## Welcome to Standard\nYou're all set. This plan keeps things focused and simple.\n\n## What's included\n- Up to 3 connected accounts on this key\n- Full dashboard metrics and saved accounts\n- Standard priority support\n\n## Getting started\n- Connect your Discord account to load a live overview\n- Use saved accounts for quick switching\n- Reach out to Mythic on Telegram whenever you need help\n\nQuestions? Message us on Telegram - we reply fast.\n\n" + SAFETY_NOTE },
    { name: 'Pro', max_accounts: 5, max_devices: 1, duration_days: 14,
      notes: "## Welcome to Pro\nA real step up. Manage more accounts with priority support.\n\n## What's included\n- Up to 5 accounts on this key\n- All dashboard tools and automations\n- Priority support\n\n## Getting started\n- Connect each account from the login screen\n- Manage all of them from one clean view\n\nNeed more room? Master or Vip gives you even more.\n\n" + SAFETY_NOTE },
    { name: 'Master', max_accounts: 7, max_devices: 1, duration_days: 30,
      notes: "## Welcome to Master\nAdvanced access for serious use. More accounts, more room.\n\n## What's included\n- Up to 7 accounts on this key\n- All dashboard tools and automations\n- Priority support\n\n## Getting started\n- Connect and switch between accounts freely\n- Everything is ready out of the box\n\nWant the top tier? Vip unlocks up to 10 accounts.\n\n" + SAFETY_NOTE },
    { name: 'Vip', max_accounts: 10, max_devices: 1, duration_days: 90,
      notes: "## Welcome to Vip\nYou're on our highest tier. Enjoy the full experience.\n\n## What's included\n- Up to 10 accounts on this key\n- Every feature, fully unlocked\n- Direct support from the owner\n- 90-day access\n\n## Getting started\n- Add and switch between accounts freely\n- Everything works right out of the box\n\nEnjoy the premium access - and thanks for being a Vip!\n\n" + SAFETY_NOTE }
  ];

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

  function setPlanFormMsg(text, kind) {
    el.planFormMsg.textContent = text || '';
    el.planFormMsg.className = 'msg' + (kind ? ' msg-' + kind : '');
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

  function deviceText(k) {
    const used = (k.deviceCount || 0);
    const max = (k.max_devices || 1);
    if (used >= max) {
      return '<span class="badge badge-warn">' + used + '/' + max + ' full</span>';
    }
    return '<span class="muted-text">' + used + ' / ' + max + '</span>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function escNotes(s) {
    return esc(s).replace(/\r?\n/g, '<br>');
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
        '<td>' + deviceText(k) + '</td>' +
        '<td>' + activationBadge(k) + '</td>' +
        '<td>' +
          '<div class="acc-bar"><div class="acc-fill" style="width:' + usedWidth + '%"></div></div>' +
          '<span class="acc-count">' + usageText(k) + '</span>' +
        '</td>' +
        '<td>' + statusBadge(k) + '</td>' +
        '<td>' + esc(k.last_validated_at ? fmtDate(k.last_validated_at) : '—') + '</td>' +
        '<td>' + esc(k.created_at ? fmtDate(k.created_at) : '—') + '</td>' +
        '<td><div class="row-actions">' +
        '<button class="btn btn-ghost mini-btn" data-act="copy" data-id="' + esc(k.id) + '" title="Copy key">Copy</button>' +
        '<button class="btn btn-ghost mini-btn" data-act="extend" data-id="' + esc(k.id) + '" title="Add 30 days">+30d</button>' +
        '<button class="btn btn-ghost mini-btn" data-act="edit" data-id="' + esc(k.id) + '">Edit</button>' +
        '<button class="btn btn-ghost mini-btn" data-act="clear" data-id="' + esc(k.id) + '">Reset</button>' +
        '<button class="btn btn-danger mini-btn" data-act="delete" data-id="' + esc(k.id) + '">Delete</button>' +
        '</div></td>';
      tr.querySelector('[data-act="copy"]').addEventListener('click', function () { copyKey(k); });
      tr.querySelector('[data-act="extend"]').addEventListener('click', function () { extendKey(k); });
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
    if (el.statAccounts) {
      el.statAccounts.textContent = acts;
    }
    if (el.statPlans) {
      el.statPlans.textContent = plans.length;
    }
  }

  function copyKey(k) {
    const text = k.plain_key || k.key_hash || '';
    if (!text) {
      toast('No key to copy.', 'error');
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
  }

  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) { }
  }

  function extendKey(k) {
    const n = k.max_days_extend || 30;
    api('/api/admin/keys/' + k.id, {
      method: 'PATCH',
      body: JSON.stringify({ days: n })
    }).then(function () {
      toast('Extended "' + (k.plain_key || 'key') + '" by ' + n + ' days.', 'success');
      loadKeys();
    }).catch(function (err) {
      toast(err && err.message ? err.message : 'Failed to extend key.', 'error');
    });
  }

  function exportKeysCsv() {
    if (!keys.length) {
      toast('No keys to export.', 'info');
      return;
    }
    const escCsv = function (s) {
      const str = String(s == null ? '' : s);
      return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
    };
    const headers = ['Key', 'Owner', 'Plan', 'Status', 'Expires', 'Max Accounts', 'Accounts Used', 'Max Devices', 'Devices Used', 'Created'];
    const lines = keys.map(function (k) {
      return [k.plain_key || k.key_hash, k.owner, k.label, k.revoked ? 'Revoked' : 'Active',
        k.expires_at ? new Date(k.expires_at).toISOString().slice(0, 10) : 'Lifetime',
        k.max_activations || 1, k.activationCount || 0,
        k.max_devices || 1, k.deviceCount || 0,
        k.created_at ? new Date(k.created_at).toISOString().slice(0, 10) : ''].map(escCsv).join(',');
    });
    const csv = '\uFEFF' + headers.join(',') + '\n' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'license-keys-export.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    toast('Exported ' + keys.length + ' keys.', 'success');
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

  function buildPresetOptions() {
    if (!el.fPreset) {
      return;
    }
    const sel = el.fPreset;
    const current = sel.value;
    const list = Array.isArray(plans) && plans.length ? plans : FALLBACK_PLANS;
    let html = '<option value="">Choose a plan...</option>';
    list.forEach(function (p) {
      html += '<option value="' + esc(p.name) + '" data-maxac="' + (p.max_accounts != null ? p.max_accounts : 1) + '" data-maxdev="' + (p.max_devices != null ? p.max_devices : 1) + '" data-dur="' + (p.duration_days != null ? p.duration_days : 0) + '" data-notes="' + esc(p.notes || '') + '">' + esc(p.name) + '</option>';
    });
    html += '<option value="__custom">Custom Plan</option>';
    sel.innerHTML = html;
    // Restore selection if it matches a plan name.
    const wanted = current || (Array.apply(null, document.querySelectorAll('#fPreset option')).some(function (o) { return o.value === current; }) ? current : '');
    sel.value = wanted;
  }

  function lookupPlanOption(name) {
    const escName = String(name || '').replace(/"/g, '&quot;');
    const opt = el.fPreset.querySelector('option[value="' + escName + '"]');
    if (!opt) {
      return null;
    }
    return {
      name: name,
      max_accounts: parseInt(opt.getAttribute('data-maxac'), 10),
      max_devices: parseInt(opt.getAttribute('data-maxdev'), 10),
      duration_days: parseInt(opt.getAttribute('data-dur'), 10),
      notes: opt.getAttribute('data-notes') || ''
    };
  }

  function applyPreset() {
    const val = el.fPreset.value;
    if (!val || val === '__custom') {
      return;
    }
    const plan = lookupPlanOption(val);
    if (!plan) {
      return;
    }
    el.fLabel.value = plan.name;
    if (plan.max_accounts) {
      el.fMax.value = String(plan.max_accounts);
    }
    if (plan.max_devices) {
      el.fMaxDevices.value = String(plan.max_devices);
    }
    if (plan.duration_days !== undefined && plan.duration_days > 0) {
      el.fDays.value = String(plan.duration_days);
    }
    if (plan.notes) {
      el.fNotes.value = plan.notes;
    }
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
    el.fMaxDevices.value = k.max_devices || 1;
    el.fNotes.value = k.notes || '';
    el.fRevoked.checked = !!k.revoked;
    buildPresetOptions();
    el.fPreset.value = k.label && Array.prototype.some.call(el.fPreset.querySelectorAll('option'), function (o) { return o.value === k.label; }) ? k.label : '';
    el.keyModal.hidden = false;
  }

  function resetForm() {
    el.fPreset.value = '';
    el.fOwner.value = '';
    el.fLabel.value = '';
    el.fDays.value = '';
    el.fMax.value = '1';
    el.fMaxDevices.value = '1';
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
      'Reset all activations (devices + accounts) for this key? Users will need to reactivate.',
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
      max_devices: parseInt(el.fMaxDevices.value, 10) || 1,
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

  // ---------- Plans ----------

  async function loadPlans() {
    try {
      const res = await api('/api/admin/plans');
      plans = res.data || [];
      renderPlans();
      buildPresetOptions();
    } catch (err) {
      plans = [];
      renderPlans();
      buildPresetOptions();
      toast(err.message, 'error');
    }
  }

  function renderPlans() {
    if (!el.plansBody) {
      return;
    }
    const tierOrder = { 'Trial': 0, 'Standard': 1, 'Pro': 2, 'Master': 3, 'Vip': 4 };
    const sorted = plans.slice().sort(function (a, b) {
      const ta = tierOrder[a.name] != null ? tierOrder[a.name] : 10 + (Number(a.max_accounts) || 1);
      const tb = tierOrder[b.name] != null ? tierOrder[b.name] : 10 + (Number(b.max_accounts) || 1);
      return ta - tb || String(a.name || '').localeCompare(String(b.name || ''));
    });
    el.plansBody.innerHTML = '';
    sorted.forEach(function (p) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td><strong>' + esc(p.name || '—') + '</strong></td>' +
        '<td>' + esc(String(p.max_accounts != null ? p.max_accounts : 1)) + '</td>' +
        '<td>' + esc(String(p.max_devices != null ? p.max_devices : 1)) + '</td>' +
        '<td>' + ((p.duration_days > 0) ? esc(String(p.duration_days)) : '<span class="badge badge-lifetime">Lifetime</span>') + '</td>' +
        '<td class="preview-cell">' + ((p.notes && p.notes.trim()) ? '<button class="btn btn-ghost mini-btn" data-plan="preview" data-name="' + esc(p.name || '') + '">Preview</button>' : '<span class="muted-text">—</span>') + '</td>' +
        '<td>' + esc(p.created_at ? fmtDate(p.created_at) : '—') + '</td>' +
        '<td><div class="row-actions">' +
        '<button class="btn btn-ghost mini-btn" data-plan="edit" data-id="' + esc(p.id) + '">Edit</button>' +
        '<button class="btn btn-danger mini-btn" data-plan="delete" data-id="' + esc(p.id) + '">Delete</button>' +
        '</div></td>';
      tr.querySelector('[data-plan="edit"]').addEventListener('click', function () { openPlanEdit(p); });
      tr.querySelector('[data-plan="delete"]').addEventListener('click', function () { confirmDeletePlan(p); });
      const previewBtn = tr.querySelector('[data-plan="preview"]');
      if (previewBtn) {
        previewBtn.addEventListener('click', function () { openPlanPreview(p); });
      }
      el.plansBody.appendChild(tr);
    });
    if (el.plansEmptyMsg) {
      el.plansEmptyMsg.hidden = plans.length !== 0;
    }
    renderStats();
  }

  function openPlanPreview(p) {
    if (!el.planPreviewModal) {
      return;
    }
    el.planPreviewName.textContent = p.name || 'Plan';
    const duration = (p.duration_days > 0) ? (p.duration_days + ' days') : 'Lifetime';
    el.planPreviewTag.textContent = (p.max_accounts != null ? p.max_accounts : 1) + ' accounts · ' + (p.max_devices != null ? p.max_devices : 1) + ' device' + ((p.max_devices != null ? p.max_devices : 1) === 1 ? '' : 's') + ' · ' + duration;
    el.planPreviewStats.innerHTML = '' +
      '<div class="pp-stat"><span class="pp-label">Accounts</span><span class="pp-value">' + esc(String(p.max_accounts != null ? p.max_accounts : 1)) + '</span></div>' +
      '<div class="pp-stat"><span class="pp-label">Devices</span><span class="pp-value">' + esc(String(p.max_devices != null ? p.max_devices : 1)) + '</span></div>' +
      '<div class="pp-stat"><span class="pp-label">Duration</span><span class="pp-value">' + esc(String(duration)) + '</span></div>';
    el.planPreviewNotes.innerHTML = p.notes && p.notes.trim() ? esc(p.notes) : '<p class="muted-text">No instructions for this plan.</p>';
    el.planPreviewModal.hidden = false;
  }

  function closePlanPreview() {
    if (el.planPreviewModal) {
      el.planPreviewModal.hidden = true;
    }
  }

  function openPlanCreate() {
    el.planModalTitle.textContent = 'New Plan';
    el.planEditId.value = '';
    el.planName.value = '';
    el.planMaxAccounts.value = '1';
    el.planMaxDevices.value = '1';
    el.planDuration.value = '30';
    el.planNotes.value = '';
    setPlanFormMsg('');
    el.planModal.hidden = false;
    el.planName.focus();
  }

  function openPlanEdit(p) {
    el.planModalTitle.textContent = 'Edit Plan';
    el.planEditId.value = p.id;
    el.planName.value = p.name || '';
    el.planMaxAccounts.value = String(p.max_accounts != null ? p.max_accounts : 1);
    el.planMaxDevices.value = String(p.max_devices != null ? p.max_devices : 1);
    el.planDuration.value = String(p.duration_days != null ? p.duration_days : 0);
    el.planNotes.value = p.notes || '';
    setPlanFormMsg('');
    el.planModal.hidden = false;
    el.planName.focus();
  }

  function closePlanModal() {
    el.planModal.hidden = true;
  }

  function confirmDeletePlan(p) {
    showConfirm(
      'Delete the "' + (p.name || '') + '" plan template? Existing keys are not affected.',
      async function () {
        await api('/api/admin/plans/' + encodeURIComponent(p.id), { method: 'DELETE' });
        toast('Plan deleted.');
        closeConfirm();
        loadPlans();
      },
      'Delete Plan'
    );
  }

  async function handlePlanSubmit(e) {
    e.preventDefault();
    const id = el.planEditId.value;
    const body = {
      name: el.planName.value.trim(),
      max_accounts: parseInt(el.planMaxAccounts.value, 10) || 1,
      max_devices: parseInt(el.planMaxDevices.value, 10) || 1,
      duration_days: parseInt(el.planDuration.value, 10) || 0,
      notes: el.planNotes.value.trim()
    };
    if (!body.name) {
      setPlanFormMsg('Plan name is required.', 'error');
      return;
    }
    el.submitPlanBtn.disabled = true;
    setPlanFormMsg('Saving...', 'info');
    try {
      if (id) {
        await api('/api/admin/plans/' + encodeURIComponent(id), { method: 'PATCH', body: body });
        toast('Plan updated.');
      } else {
        await api('/api/admin/plans', { method: 'POST', body: body });
        toast('Plan created.');
      }
      setPlanFormMsg('');
      closePlanModal();
      loadPlans();
    } catch (err) {
      setPlanFormMsg(err.message, 'error');
    } finally {
      el.submitPlanBtn.disabled = false;
    }
  }

  function tickClock() {
    if (el.overviewClock) {
      el.overviewClock.textContent = new Date().toLocaleString();
    }
  }

  function setNav(name) {
    if (el.overviewView) {
      el.overviewView.hidden = name !== 'overview';
    }
    if (el.settingsView) {
      el.settingsView.hidden = name !== 'settings';
    }
    document.querySelectorAll('.sidebar-link[data-nav]').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-nav') === name);
    });
    if (name === 'settings') {
      loadPlans();
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
    loadPlans();
    setNav('overview');
  }

  function init() {
    buildPresetOptions();

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

    if (el.overviewRefreshBtn) {
      el.overviewRefreshBtn.addEventListener('click', function () { loadKeys(); loadPlans(); });
    }
    if (el.keysRefreshBtn) {
      el.keysRefreshBtn.addEventListener('click', function () { loadKeys(); });
    }
    if (el.exportKeysBtn) {
      el.exportKeysBtn.addEventListener('click', exportKeysCsv);
    }

    el.openCreateBtn.addEventListener('click', openCreate);
    el.applyPresetBtn.addEventListener('click', function () {
      applyPreset();
      toast('Plan preset applied.');
    });
    el.fPreset.addEventListener('change', function () {
      if (el.fPreset.value === '__custom') {
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

    el.openPlanCreateBtn.addEventListener('click', openPlanCreate);
    el.planCancelBtn.addEventListener('click', closePlanModal);
    el.planModal.addEventListener('click', function (e) {
      if (e.target === el.planModal) {
        closePlanModal();
      }
    });
    el.planForm.addEventListener('submit', handlePlanSubmit);

    el.planPreviewClose.addEventListener('click', closePlanPreview);
    el.planPreviewModal.addEventListener('click', function (e) {
      if (e.target === el.planPreviewModal) {
        closePlanPreview();
      }
    });

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