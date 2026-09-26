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
      accountsView: g('accountsView'),
      accountsRefreshBtn: g('accountsRefreshBtn'),
      addAccountBtn: g('addAccountBtn'),
      accSearch: g('accSearch'),
      accResultCount: g('accResultCount'),
      accBody: g('accBody'),
      accEmptyMsg: g('accEmptyMsg'),
      accStatCount: g('accStatCount'),
      accStatSpent: g('accStatSpent'),
      accStatRevenue: g('accStatRevenue'),
      accStatNet: g('accStatNet'),
      accModal: g('accModal'),
      accModalTitle: g('accModalTitle'),
      accForm: g('accForm'),
      accEditId: g('accEditId'),
      accEmail: g('accEmail'),
      accEmailPw: g('accEmailPw'),
      accDiscordPw: g('accDiscordPw'),
      accDiscordId: g('accDiscordId'),
      accUsername: g('accUsername'),
      accNitroEnds: g('accNitroEnds'),
      accStatus: g('accStatus'),
      accSource: g('accSource'),
      accPaid: g('accPaid'),
      accSell: g('accSell'),
      accPaySplitField: g('accPaySplitField'),
      accPaidFirst: g('accPaidFirst'),
      accPaidSecond: g('accPaidSecond'),
      accBalanceHint: g('accBalanceHint'),
      accBuyerName: g('accBuyerName'),
      accBuyerTelegram: g('accBuyerTelegram'),
      accNotes: g('accNotes'),
      accBadges: g('accBadges'),
      accCustomBadge: g('accCustomBadge'),
      accAddBadgeBtn: g('accAddBadgeBtn'),
      accBadgeGroups: g('accBadgeGroups'),
      accSelectedBadges: g('accSelectedBadges'),
      accFormMsg: g('accFormMsg'),
      accCancelBtn: g('accCancelBtn'),
      soldModal: g('soldModal'),
      soldForm: g('soldForm'),
      soldAccId: g('soldAccId'),
      soldPrice: g('soldPrice'),
      soldPaidFirst: g('soldPaidFirst'),
      soldPaidSecond: g('soldPaidSecond'),
      soldBalanceHint: g('soldBalanceHint'),
      soldBuyerName: g('soldBuyerName'),
      soldBuyerTelegram: g('soldBuyerTelegram'),
      soldAccountLabel: g('soldAccountLabel'),
      soldFormMsg: g('soldFormMsg'),
      soldCancelBtn: g('soldCancelBtn'),
      soldSubmitBtn: g('soldSubmitBtn'),
      accSaveBtn: g('accSaveBtn'),
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
      planNotes: g('planNotes'),      planFormMsg: g('planFormMsg'),
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

  // Single clipboard write with a hidden-textarea fallback, because the async
  // clipboard API is refused outside a secure context and this page can be
  // opened over plain http on a local network.
  function copyToClipboard(text, okMsg) {
    const done = function () {
      toast(okMsg, 'success');
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

  function copyKey(k) {
    const text = k.plain_key || k.key_hash || '';
    if (!text) {
      toast('No key to copy.', 'error');
      return;
    }
    copyToClipboard(text, 'Key copied to clipboard.');
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
    // Shared live clock, mounted on the overview and the accounts header.
    if (window.LiveClock && typeof window.LiveClock.mount === 'function') {
      window.LiveClock.mount('.clock, .live-clock');
    }
  }

  function setNav(name) {
    if (el.overviewView) {
      el.overviewView.hidden = name !== 'overview';
    }
    if (el.accountsView) {
      el.accountsView.hidden = name !== 'accounts';
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
    if (name === 'accounts') {
      loadAccounts();
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
      el.overviewRefreshBtn.addEventListener('click', async function () {
        const btn = el.overviewRefreshBtn;
        // loadKeys/loadPlans already catch and toast their own errors, so they
        // resolve either way. The previous handler just fired them off with no
        // pending state, which let a user click repeatedly and stack requests.
        if (btn.dataset.busy === '1') {
          return;
        }
        btn.dataset.busy = '1';
        btn.disabled = true;
        // Do NOT swap textContent here: the button contains an inline SVG icon
        // and a label, and replacing the text would permanently drop the icon.
        // The spinning icon in admin.css is the whole pending indicator.
        btn.classList.add('is-loading');
        btn.setAttribute('aria-busy', 'true');
        const labelEl = btn.querySelector('.btn-label');
        if (labelEl && !labelEl.getAttribute('data-label')) {
          labelEl.setAttribute('data-label', labelEl.textContent);
        }
        if (labelEl) {
          labelEl.textContent = 'Refreshing...';
        }
        try {
          await Promise.all([loadKeys(), loadPlans()]);
        } finally {
          btn.disabled = false;
          btn.classList.remove('is-loading');
          btn.removeAttribute('aria-busy');
          const restore = btn.querySelector('.btn-label');
          if (restore) {
            restore.textContent = restore.getAttribute('data-label') || 'Refresh';
            restore.removeAttribute('data-label');
          }
          btn.dataset.busy = '';
        }
      });
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

    initAccounts();

    // The clock drives itself once mounted; re-mounting picks up any nodes
    // that were not in the DOM at first paint.
    tickClock();
  }

  /* =======================================================================
     Accounts (merged Summary)
     ======================================================================= */

  var acc = {
    rows: [],
    filter: 'all',
    query: '',
    ready: false
  };

  // Boost and Nitro are inventory labels, not public_flags bits, so they are
  // free text rather than decoded from the Discord response. The names mirror
  // how Discord labels the badges themselves.
  var BADGE_GROUPS = [
    {
      // Every option here ships real Discord artwork. Anything without a matching
    // file is left out rather than shown as an invented icon, because a badge
    // drawn by hand is not the badge the account actually has. Rows saved with
    // one of the removed names still resolve through BadgeIcons and surface in
    // the removable custom chips below, so nothing is lost silently.
    key: 'boost',
      label: 'Server Boost',
      options: ['Boost Level 1', 'Boost Level 2', 'Boost Level 3', 'Boost Level 4', 'Boost Level 5', 'Boost Level 6', 'Boost Level 7', 'Boost Level 8', 'Boost Level 9']
    },
    {
      key: 'nitro',
      label: 'Nitro',
      options: ['Nitro', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Ruby', 'Opal', 'Diamond']
    },
    {
      key: 'other',
      label: 'Other',
      options: [
        'Discord Staff', 'Partner', 'Bug Hunter Level 1', 'Bug Hunter Level 2',
        'Early Supporter', 'HypeSquad Events', 'HypeSquad Bravery',
        'HypeSquad Brilliance', 'HypeSquad Balance',
        'Discord Certified Moderator', 'Active Developer'
      ]
    }
  ];

  // Badge labels are stored as free text, so a row saved under an older name
  // ("Boost Tier 1", "Bug Hunter") must still tick the matching box and must
  // not be dropped when the account is saved again. Compare and store the
  // current name instead.
  function badgeName(value) {
    if (window.BadgeIcons && typeof window.BadgeIcons.canonical === 'function') {
      return window.BadgeIcons.canonical(value);
    }
    return String(value == null ? '' : value);
  }

  function sameBadge(a, b) {
    return badgeName(a) === badgeName(b);
  }

  function accMoney(n) {
    var v = Number(n);
    if (isNaN(v)) v = 0;
    return '$' + v.toFixed(2);
  }

  // Backed by a comma-joined hidden input. Dedupe here as well so a legacy
  // row with repeated labels cannot inflate the per-group counts.
  function accBadges() {
    var seen = {};
    return String((el.accBadges && el.accBadges.value) || '')
      .split(',')
      .map(function (s) { return badgeName(s.trim()); })
      .filter(function (s) {
        if (!s || seen[s]) return false;
        seen[s] = true;
        return true;
      });
  }

  function setAccBadges(list) {
    if (el.accBadges) {
      el.accBadges.value = list.join(', ');
    }
  }

  /* -------- badge groups (accordion: exactly one open at a time) -------- */

  // Only one section is expanded at a time. Clicking the open section closes
  // it, which is why this closes first and then decides what to open.
  function openBadgeGroup(key) {
    if (!el.accBadgeGroups) return;
    var groups = el.accBadgeGroups.querySelectorAll('.badge-group');
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var isTarget = g.getAttribute('data-group') === key;
      var head = g.querySelector('.badge-group-head');
      var body = g.querySelector('.badge-group-body');
      if (!head || !body) continue;
      head.setAttribute('aria-expanded', isTarget ? 'true' : 'false');
      g.classList.toggle('open', isTarget);
      if (isTarget) {
        body.hidden = false;
      } else {
        body.hidden = true;
      }
    }
  }

  function renderBadgeGroups() {
    if (!el.accBadgeGroups) return;
    var selected = accBadges();
    BADGE_GROUPS.forEach(function (group) {
      var wrap = el.accBadgeGroups.querySelector('.badge-group[data-group="' + group.key + '"] .badge-opts');
      var countEl = el.accBadgeGroups.querySelector('[data-count="' + group.key + '"]');
      if (!wrap) return;
      wrap.innerHTML = group.options.map(function (badge) {
        var on = selected.some(function (x) { return sameBadge(x, badge); });
        // The artwork identifies the badge, so the name is hidden visually and
        // stays available as a tooltip and to screen readers. When there is no
        // artwork to go by the name has to be shown, so keep it visible.
        var art = badgeIcon(badge);
        return '<button type="button" class="badge-opt' + (on ? ' selected' : '') + '" role="checkbox"'
          + ' aria-checked="' + (on ? 'true' : 'false') + '" data-badge="' + esc(badge) + '"'
          + ' title="' + esc(badge) + '">'
          + art
          + '<span class="badge-label' + (art ? ' sr-only' : ' badge-label-show') + '">' + esc(badge) + '</span>'
          + '</button>';
      }).join('');
      if (countEl) {
        var n = group.options.filter(function (b) {
          return selected.some(function (x) { return sameBadge(x, b); });
        }).length;
        countEl.textContent = String(n);
        countEl.classList.toggle('has-items', n > 0);
      }
    });

    // Custom badges live in the same hidden input but have no group, so show
    // them as removable chips under the groups.
    var known = {};
    BADGE_GROUPS.forEach(function (g) {
      g.options.forEach(function (b) { known[b] = true; });
    });
    var custom = selected.filter(function (b) { return !known[b]; });
    if (el.accSelectedBadges) {
      el.accSelectedBadges.innerHTML = custom.length
        ? 'Custom: ' + custom.map(function (b) {
          return '<span class="badge-chip">' + badgeIcon(b)
            + '<span class="badge-label">' + esc(b) + '</span>'
            + '<button type="button" class="badge-chip-x" data-remove-badge="' + esc(b)
            + '" aria-label="Remove ' + esc(b) + '">&times;</button></span>';
        }).join('')
        : '';
    }
  }

  function toggleAccBadge(badge) {
    var list = accBadges();
    var i = -1;
    for (var k = 0; k < list.length; k++) {
      if (sameBadge(list[k], badge)) { i = k; break; }
    }
    if (i !== -1) list.splice(i, 1);
    else list.push(badgeName(badge));
    setAccBadges(list);
    renderBadgeGroups();
  }

  function addCustomAccBadge() {
    if (!el.accCustomBadge) return;
    var val = el.accCustomBadge.value.trim();
    if (!val) return;
    if (val.length > 60) {
      toast('Badge label is too long (max 60 characters).', 'error');
      return;
    }
    var list = accBadges();
    var already = list.some(function (b) { return sameBadge(b, val); });
    if (!already) list.push(val);
    setAccBadges(list);
    el.accCustomBadge.value = '';
    renderBadgeGroups();
  }

  /* -------- auth: the admin secret also opens the summary session -------- */

  var accAuthReady = false;

  async function ensureAccAuth() {
    if (accAuthReady) return;
    try {
      await api('/api/summary?op=check');
      accAuthReady = true;
    } catch (err) {
      // Hand the admin secret to the summary endpoint so one console login
      // covers both sections.
      await api('/api/summary?op=login', { method: 'POST', body: { secret: getSecret() } });
      accAuthReady = true;
    }
  }

  /* -------- data -------- */

  async function loadAccounts() {
    try {
      await ensureAccAuth();
      const data = await api('/api/summary');
      acc.rows = Array.isArray(data.data) ? data.data : [];
      acc.ready = true;
    } catch (err) {
      acc.rows = [];
      acc.ready = false;
      toast(err.message || 'Could not load accounts.', 'error');
    }
    renderAccounts();
  }

  function accFiltered() {
    var q = acc.query.trim().toLowerCase();
    return acc.rows.filter(function (row) {
      if (acc.filter !== 'all' && row.status !== acc.filter) return false;
      if (!q) return true;
      return [row.email, row.discord_id, row.username, row.source, row.status_label, row.notes]
        .some(function (v) { return String(v || '').toLowerCase().indexOf(q) !== -1; });
    });
  }

  function renderAccKPIs() {
    var spent = 0, revenue = 0;
    acc.rows.forEach(function (row) {
      spent += Number(row.buy_price) || 0;
      if (row.status === 'SOLD') revenue += Number(row.sell_price) || 0;
    });
    var net = revenue - spent;
    if (el.accStatCount) el.accStatCount.textContent = String(acc.rows.length);
    if (el.accStatSpent) el.accStatSpent.textContent = accMoney(spent);
    if (el.accStatRevenue) el.accStatRevenue.textContent = accMoney(revenue);
    if (el.accStatNet) {
      el.accStatNet.textContent = accMoney(net);
      el.accStatNet.classList.toggle('net-negative', net < 0);
      el.accStatNet.classList.toggle('net-positive', net >= 0);
    }
  }

  // Badge glyphs come from the shared icon set. Unknown/custom labels still
  // render, just without an icon, so nothing ever disappears.
  function badgeIcon(label) {
    var B = window.BadgeIcons;
    if (!B) return '';
    // Real badge artwork when the repo has it, drawn glyph otherwise.
    return typeof B.media === 'function' ? B.media(label) : B.svg(label);
  }

  // Whole amounts print without decimals so it reads 205$ rather than 205.00$.
  function accAmount(n) {
    var v = money2(n);
    return (v % 1 === 0 ? String(v) : v.toFixed(2)) + '$';
  }

  // Format an account into the compact export string requested by the user.
  // Plain newlines keep it easy to copy and paste anywhere. Empty fields are
  // left out entirely, so a blank line can never read as a real value.
  function accExportText(row) {
    var parts = [];

    if (row.email) parts.push('email : ' + row.email);
    if (row.email_password) parts.push('email password : ' + row.email_password);
    if (row.discord_password) parts.push('discord password : ' + row.discord_password);

    // Prefer the descriptive label the user typed over the raw AVAILABLE/SOLD
    // state, since that is what the export is meant to convey.
    var statusText = row.status_label || row.status;
    if (statusText) parts.push('Status : ' + statusText);

    if (row.nitro_ends) {
      // Rendered as "may 4 2027" rather than a locale string, so the exported
      // text looks the same for every user. An unparseable value is passed
      // through untouched instead of being replaced with a guess.
      var d = new Date(row.nitro_ends);
      var months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      parts.push('nitro end : ' + (!isNaN(d.getTime())
        ? months[d.getMonth()] + ' ' + d.getDate() + ' ' + d.getFullYear()
        : row.nitro_ends));
    }

    // "paid" is what the account cost to acquire, which is the buy price. A
    // whole amount prints without decimals so it reads 205$, not 205.00$.
    var paid = money2(row.buy_price);
    if (paid > 0) parts.push('paid : ' + accAmount(paid));

    if (row.source) parts.push('from : ' + row.source);

    // Only a sold account that actually records instalments gets a payment
    // block, so a one-off sale and an unsold account keep the short export.
    var split = paySplit(row);
    if (split.split) {
      parts.push('total : ' + accAmount(split.total));
      parts.push('part 1 : ' + accAmount(split.first));
      parts.push('part 2 : ' + accAmount(split.second));
      if (split.remaining > 0) parts.push('remaining : ' + accAmount(split.remaining));
    }
    return parts.join('\n');
  }

  function copyAccExport(row) {
    var text = accExportText(row);
    if (!text) {
      toast('Nothing to export on this account.', 'error');
      return;
    }
    copyToClipboard(text, 'Account details copied.');
  }

  // ---------- split payment maths ----------
  // Only the two received instalments are stored in the database. The agreed
  // second instalment and the outstanding balance are always derived from them
  // and the total here, in one place, so no two screens can disagree and the
  // figures cannot drift apart from the sale price.
  function money2(n) {
    var v = Number(n);
    if (!isFinite(v)) return 0;
    // Round to cents so repeated additions cannot produce 0.30000000000000004.
    // The trailing +0 collapses the -0 that Math.round returns when a balance
    // nets to exactly zero through float noise, which would otherwise leak
    // into comparisons and string building.
    return Math.round(v * 100) / 100 + 0;
  }

  function paySplit(row) {
    var total = money2(row.sell_price);
    var first = money2(row.sell_paid_first);
    var second = money2(row.sell_paid_second);
    var remaining = money2(total - first - second);
    return {
      total: total,
      first: first,
      second: second,
      // What the second instalment was agreed to be, given the total and part 1.
      part2Due: money2(total - first),
      // Negative when the buyer has overpaid, which we report rather than hide.
      remaining: remaining,
      settled: remaining <= 0,
      // A split is only "in play" once an instalment has actually been
      // recorded. A plain one-off sale with nothing recorded yet still has a
      // balance, but it is not a split, so it keeps the short export.
      split: row.status === 'SOLD' && total > 0 && (first > 0 || second > 0)
    };
  }

  // Live "remaining" readout under the two inputs, so the balance is visible
  // while typing instead of only after a save.
  function updateBalanceHint(totalInput, firstInput, secondInput, hint) {
    if (!hint) return;
    var total = money2(totalInput ? totalInput.value : 0);
    var first = money2(firstInput ? firstInput.value : 0);
    var second = money2(secondInput ? secondInput.value : 0);
    if (total <= 0) {
      hint.textContent = '';
      hint.className = 'pay-balance';
      return;
    }
    var remaining = money2(total - first - second);
    if (remaining > 0) {
      hint.textContent = 'Part 2 agreed: ' + accMoney(money2(total - first))
        + '  ·  still owed: ' + accMoney(remaining);
      hint.className = 'pay-balance pay-balance-due';
    } else if (remaining < 0) {
      hint.textContent = 'Overpaid by ' + accMoney(money2(-remaining)) + '.';
      hint.className = 'pay-balance pay-balance-over';
    } else {
      hint.textContent = 'Fully paid. Nothing outstanding.';
      hint.className = 'pay-balance pay-balance-clear';
    }
  }

  function wireBalanceHint(totalInput, firstInput, secondInput, hint) {
    if (!hint) return;
    [totalInput, firstInput, secondInput].forEach(function (input) {
      if (!input) return;
      input.addEventListener('input', function () {
        updateBalanceHint(totalInput, firstInput, secondInput, hint);
      });
    });
  }

  function accBadgesHtml(row) {    var out = [];
    // Bare artwork: no chip fill or border, so the badges read as icons rather
    // than pills. The name moves to a tooltip and to a screen-reader-only label.
    // This uses its own class instead of .badge-muted/.badge-nitro so the
    // status badges that share those classes keep their background.
    function chip(name) {
      var art = badgeIcon(name);
      return '<span class="badge badge-art" title="' + esc(name) + '">' + art
        + '<span class="badge-label' + (art ? ' sr-only' : ' badge-label-show') + '">' + esc(name) + '</span></span>';
    }
    if (row.nitro_tier && row.nitro_tier !== 'None' && row.nitro_tier !== 'Unknown') {
      out.push(chip(row.nitro_tier));
    }
    (row.badges || []).forEach(function (b) {
      // Show the current badge name so rows saved before the rename read the
      // same as newly added ones.
      out.push(chip(badgeName(b)));
    });
    if (row.nitro_ends) {
      out.push('<span class="badge badge-warn">' + badgeIcon('Nitro')
        + '<span class="badge-label">ends ' + esc(fmtDate(row.nitro_ends)) + '</span></span>');
    }
    return out.join('') || '<span class="muted-text">—</span>';
  }

  function accSourceHtml(raw) {
    var v = String(raw || '').trim();
    if (!v) return '<span class="muted-text">—</span>';
    if (/^https?:\/\//i.test(v)) {
      return '<a class="link" href="' + esc(v) + '" target="_blank" rel="noopener noreferrer">'
        + esc(v.replace(/^https?:\/\//i, '')) + '</a>';
    }
    if (v.indexOf('@') === 0) {
      return '<a class="link" href="https://t.me/' + esc(v.slice(1)) + '" target="_blank" rel="noopener noreferrer">'
        + esc(v) + '</a>';
    }
    return '<span class="muted-text">' + esc(v) + '</span>';
  }

  var MASKED_PW = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';

  // Passwords are returned by the API in plaintext, so the cell starts masked
  // and only reveals on an explicit per-row click.
  function accPwCell(value, label) {
    if (!value) return '<span class="muted-text">—</span>';
    return '<span class="pw-cell">'
      + '<span class="pw-mask" data-pw="' + esc(value) + '">' + MASKED_PW + '</span>'
      + '<button type="button" class="pw-reveal" data-reveal aria-label="Reveal ' + esc(label) + '">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
      + '</button></span>';
  }

  // Who bought it, captured when the account was marked sold. Kept as plain
  // escaped text rather than a link so the admin table cannot navigate away.
  function accBuyerHtml(row) {
    var parts = [];
    if (row.buyer_name) parts.push(esc(row.buyer_name));
    if (row.buyer_telegram) parts.push(esc(row.buyer_telegram));
    if (!parts.length) return '';
    return '<div class="cell-micro">buyer: ' + parts.join(' &middot; ') + '</div>';
  }

  // When the account entered stock. Shown for sold rows too, so the added and
  // sold dates can be read together to see how long it was held.
  function accStockAgeHtml(row) {
    if (!row.created_at) return '';
    var added = new Date(row.created_at);
    if (isNaN(added.getTime())) return '';
    return '<div class="cell-micro">added ' + esc(fmtDate(row.created_at)) + '</div>';
  }

  function accRowHtml(row) {
    var net = null;
    if (row.status === 'SOLD') net = (Number(row.sell_price) || 0) - (Number(row.buy_price) || 0);
    var netHtml = net === null
      ? '<span class="muted-text">—</span>'
      : '<span class="' + (net < 0 ? 'net-negative' : 'net-positive') + '">' + accMoney(net) + '</span>';

    var identity = row.discord_id
      ? '<strong class="cell-id">' + esc(row.discord_id) + '</strong>'
      : '<span class="muted-text">no id</span>';
    if (row.username) identity += '<div class="muted-text">@' + esc(row.username) + '</div>';
    identity += accStockAgeHtml(row);

    var statusCell = '<span class="badge ' + (row.status === 'SOLD' ? 'badge-warn' : 'badge-ok') + '">'
      + esc(row.status) + '</span>';
    if (row.status_label) {
      statusCell += '<div class="status-label">' + esc(row.status_label) + '</div>';
    }
    // Surface the sale timestamp and buyer so the admin table carries the same
    // information as the summary. The buyer is shown independently of
    // sold_at, because a sold record can legitimately be missing a timestamp.
    if (row.status === 'SOLD') {
      if (row.sold_at) {
        var soldOn = new Date(row.sold_at);
        if (!isNaN(soldOn.getTime())) {
          statusCell += '<div class="cell-micro">sold ' + esc(fmtDate(row.sold_at)) + '</div>';
        }
      }
      statusCell += accBuyerHtml(row);
    }

    var pws = '<div class="pw-stack">'
      + '<div class="pw-row"><span class="pw-kind">Email</span>' + accPwCell(row.email_password, 'email password') + '</div>'
      + '<div class="pw-row"><span class="pw-kind">Discord</span>' + accPwCell(row.discord_password, 'Discord password') + '</div>'
      + '</div>';

    var payCell = row.status === 'SOLD' ? accMoney(row.sell_price) : '<span class="muted-text">—</span>';
    var split = paySplit(row);
    // Show an outstanding balance on any sale, split or not, because an
    // unrecorded payment is the thing worth catching. An unsold account never
    // shows one, since its sell price is only an asking price.
    if (split.remaining > 0) {
      payCell += '<div class="pay-due">' + accMoney(split.remaining) + ' owed</div>';
    } else if (split.split) {
      payCell += '<div class="pay-clear">paid in full</div>';
    }

    var actions = '<button class="btn btn-ghost mini-btn" data-acc-act="export" data-id="' + esc(row.id) + '" title="Copy account details to the clipboard">Details</button>'
      + '<button class="btn btn-ghost mini-btn" data-acc-act="edit" data-id="' + esc(row.id) + '">Edit</button>'
      + (row.status === 'AVAILABLE'
        ? '<button class="btn btn-ghost mini-btn" data-acc-act="sold" data-id="' + esc(row.id) + '">Sold</button>'
        : '')
      + '<button class="btn btn-danger mini-btn" data-acc-act="del" data-id="' + esc(row.id) + '">Del</button>';

    return '<tr>'
      + '<td>' + identity + '</td>'
      + '<td><span class="muted-text">' + esc(row.email || '—') + '</span></td>'
      + '<td>' + pws + '</td>'
      + '<td><div class="tag-row">' + accBadgesHtml(row) + '</div></td>'
      + '<td>' + statusCell + '</td>'
      + '<td class="num">' + accMoney(row.buy_price) + '</td>'
      + '<td class="num">' + payCell + '</td>'
      + '<td class="num">' + netHtml + '</td>'
      + '<td>' + accSourceHtml(row.source) + '</td>'
      + '<td><div class="row-actions">' + actions + '</div></td>'
      + '</tr>';
  }

  function renderAccounts() {
    renderAccKPIs();
    if (!el.accBody) return;
    var rows = accFiltered();
    if (el.accResultCount) {
      el.accResultCount.textContent = rows.length + (rows.length === 1 ? ' account' : ' accounts');
    }
    if (el.accEmptyMsg) el.accEmptyMsg.hidden = rows.length > 0;
    el.accBody.innerHTML = rows.map(accRowHtml).join('');
  }

  /* -------- modal -------- */

  function setAccFormMsg(text, kind) {
    if (!el.accFormMsg) return;
    el.accFormMsg.textContent = text || '';
    el.accFormMsg.className = 'msg' + (kind ? ' msg-' + kind : '');
  }

  function resetAccForm() {
    [el.accEditId, el.accEmail, el.accEmailPw, el.accDiscordPw, el.accDiscordId,
      el.accUsername, el.accNitroEnds, el.accStatus, el.accSource,
      el.accPaid, el.accSell, el.accPaidFirst, el.accPaidSecond, el.accNotes, el.accCustomBadge].forEach(function (node) {
      if (node) node.value = '';
    });
    // A new account is not sold, so the split stays hidden until it is.
    if (el.accPaySplitField) el.accPaySplitField.hidden = true;
    if (el.accBalanceHint) el.accBalanceHint.textContent = '';
    setAccBadges([]);
    renderBadgeGroups();
    // Nothing open by default; the user picks a group.
    openBadgeGroup(null);
    setAccFormMsg('');
  }

  function openAccModal(row) {
    resetAccForm();
    if (row) {
      if (el.accModalTitle) el.accModalTitle.textContent = 'Edit Account';
      if (el.accEditId) el.accEditId.value = row.id || '';
      if (el.accEmail) el.accEmail.value = row.email || '';
      if (el.accEmailPw) el.accEmailPw.value = row.email_password || '';
      if (el.accDiscordPw) el.accDiscordPw.value = row.discord_password || '';
      if (el.accDiscordId) el.accDiscordId.value = row.discord_id || '';
      if (el.accUsername) el.accUsername.value = row.username || '';
      if (el.accNitroEnds) el.accNitroEnds.value = row.nitro_ends ? String(row.nitro_ends).slice(0, 10) : '';
      if (el.accStatus) el.accStatus.value = row.status_label || '';
      if (el.accSource) el.accSource.value = row.source || '';
      if (el.accPaid) el.accPaid.value = row.buy_price != null ? Number(row.buy_price) : '';
      if (el.accSell) el.accSell.value = row.sell_price != null ? Number(row.sell_price) : '';
    if (el.accPaidFirst) el.accPaidFirst.value = money2(row.sell_paid_first) || '';
    if (el.accPaidSecond) el.accPaidSecond.value = money2(row.sell_paid_second) || '';
    // The split only means something once the account is sold, so it stays
    // hidden otherwise rather than showing a balance against an asking price.
    if (el.accPaySplitField) el.accPaySplitField.hidden = !(row && row.status === 'SOLD');
    updateBalanceHint(el.accSell, el.accPaidFirst, el.accPaidSecond, el.accBalanceHint);
      if (el.accBuyerName) el.accBuyerName.value = row.buyer_name || '';
      if (el.accBuyerTelegram) el.accBuyerTelegram.value = row.buyer_telegram || '';
      if (el.accNotes) el.accNotes.value = row.notes || '';
      setAccBadges((row.badges || []).map(String));
    } else {
      if (el.accModalTitle) el.accModalTitle.textContent = 'Add Account';
    }
    renderBadgeGroups();
    if (el.accModal) el.accModal.hidden = false;
    if (el.accEmail) el.accEmail.focus();
  }

  function closeAccModal() {
    if (el.accModal) el.accModal.hidden = true;
  }

  function validateAccForm() {
    var errors = [];
    var email = (el.accEmail.value || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      errors.push('Email address format looks invalid.');
    }
    var did = (el.accDiscordId.value || '').trim();
    if (did && !/^[0-9]{15,21}$/.test(did)) {
      errors.push('Account ID must be 15 to 21 digits.');
    } else if (did) {
      var clash = acc.rows.some(function (r) {
        return r.discord_id === did && r.id !== el.accEditId.value;
      });
      if (clash) errors.push('That account ID is already tracked.');
    }
    if ((el.accEmailPw.value || '').length > 200) errors.push('Email password is too long (max 200).');
    if ((el.accDiscordPw.value || '').length > 200) errors.push('Discord password is too long (max 200).');
    if ((el.accSource.value || '').length > 300) errors.push('Source is too long (max 300).');
    if ((el.accStatus.value || '').length > 60) errors.push('Status is too long (max 60).');

    var paidRaw = (el.accPaid.value || '').trim();
    var paid = Number(paidRaw);
    if (paidRaw !== '' && (!isFinite(paid) || paid < 0)) {
      errors.push('Paid must be a non-negative number.');
    }
    var sellRaw = (el.accSell.value || '').trim();
    var sell = Number(sellRaw);
    if (sellRaw !== '' && (!isFinite(sell) || sell < 0)) {
      errors.push('Sold must be a non-negative number.');
    }

    var hasIdentity = !!(did || (el.accUsername.value || '').trim() || email);
    if (!hasIdentity) {
      errors.push('Add at least an email, a username, or an account ID.');
    }
    return errors;
  }

  async function submitAccForm(e) {
    e.preventDefault();
    setAccFormMsg('');
    var errors = validateAccForm();
    if (errors.length) {
      setAccFormMsg(errors.join(' '), 'error');
      return;
    }
    var id = (el.accEditId.value || '').trim();
    var payload = {
      email: (el.accEmail.value || '').trim(),
      emailPassword: (el.accEmailPw.value || '').trim(),
      discordPassword: (el.accDiscordPw.value || '').trim(),
      discordId: (el.accDiscordId.value || '').trim(),
      username: (el.accUsername.value || '').trim(),
      nitroEnds: (el.accNitroEnds.value || '').trim(),
      statusLabel: (el.accStatus.value || '').trim(),
      source: (el.accSource.value || '').trim(),
      notes: (el.accNotes.value || '').trim(),
      badges: accBadges()
    };
    if ((el.accPaid.value || '').trim() !== '') payload.buyPrice = Number(el.accPaid.value);
    if ((el.accSell.value || '').trim() !== '') payload.sellPrice = Number(el.accSell.value);
    // Always send both instalments, including as 0, so clearing a part payment
    // actually clears it rather than being silently ignored.
    payload.sellPaidFirst = money2(el.accPaidFirst ? el.accPaidFirst.value : 0);
    payload.sellPaidSecond = money2(el.accPaidSecond ? el.accPaidSecond.value : 0);
    // Always send the buyer fields, including when emptied, so clearing the
    // buyer on a record actually clears it instead of being ignored.
    if (el.accBuyerName) payload.buyerName = el.accBuyerName.value.trim();
    if (el.accBuyerTelegram) payload.buyerTelegram = el.accBuyerTelegram.value.trim();

    el.accSaveBtn.disabled = true;
    try {
      if (id) {
        await api('/api/summary?id=' + encodeURIComponent(id), { method: 'PATCH', body: payload });
      } else {
        // A new record needs a buy price; default to 0 rather than rejecting.
        if (payload.buyPrice === undefined) payload.buyPrice = 0;
        await api('/api/summary', { method: 'POST', body: payload });
      }
      closeAccModal();
      toast(id ? 'Account updated.' : 'Account added.', 'ok');
      await loadAccounts();
    } catch (err) {
      setAccFormMsg(err.message || 'Could not save the account.', 'error');
    } finally {
      el.accSaveBtn.disabled = false;
    }
  }

  function setSoldFormMsg(msg, type) {
    if (!el.soldFormMsg) return;
    el.soldFormMsg.textContent = msg || '';
    el.soldFormMsg.className = 'msg' + (msg ? (type === 'error' ? ' err' : ' ok') : '');
  }

  function openSoldModal(row) {
    if (!el.soldModal) { markAccSoldLegacy(row); return; }
    el.soldAccId.value = row.id;
    el.soldPrice.value = row.sell_price != null && Number(row.sell_price) ? String(row.sell_price) : '';
    el.soldPaidFirst.value = money2(row.sell_paid_first) ? String(money2(row.sell_paid_first)) : '';
    el.soldPaidSecond.value = money2(row.sell_paid_second) ? String(money2(row.sell_paid_second)) : '';
    updateBalanceHint(el.soldPrice, el.soldPaidFirst, el.soldPaidSecond, el.soldBalanceHint);
    el.soldBuyerName.value = row.buyer_name || '';
    el.soldBuyerTelegram.value = row.buyer_telegram || '';
    if (el.soldAccountLabel) {
      el.soldAccountLabel.textContent = row.username ? ('@' + row.username) : 'this account';
    }
    setSoldFormMsg('');
    el.soldModal.hidden = false;
    // Land on the price field, since that is the one value we always need.
    setTimeout(function () { if (el.soldPrice) el.soldPrice.focus(); }, 30);
  }

  function closeSoldModal() {
    if (!el.soldModal) return;
    el.soldModal.hidden = true;
    setSoldFormMsg('');
  }

  async function submitSoldForm(e) {
    e.preventDefault();
    const id = el.soldAccId.value;
    const raw = (el.soldPrice.value || '').trim();
    const price = Number(raw);
    if (raw === '' || !isFinite(price) || price < 0) {
      setSoldFormMsg('Sale price must be a non-negative number.', 'error');
      if (el.soldPrice) el.soldPrice.focus();
      return;
    }

    const patch = {
      status: 'SOLD',
      sellPrice: price,
      soldAt: new Date().toISOString()
    };
    // Both instalments are always sent, including as 0, so re-confirming a sale
    // cannot leave a stale part payment behind from an earlier attempt.
    patch.sellPaidFirst = money2(el.soldPaidFirst ? el.soldPaidFirst.value : 0);
    patch.sellPaidSecond = money2(el.soldPaidSecond ? el.soldPaidSecond.value : 0);
    const buyerName = (el.soldBuyerName.value || '').trim();
    const buyerTg = (el.soldBuyerTelegram.value || '').trim();
    if (buyerName) patch.buyerName = buyerName;
    if (buyerTg) patch.buyerTelegram = buyerTg;

    el.soldSubmitBtn.disabled = true;
    setSoldFormMsg('Saving...');
    try {
      await api('/api/summary?id=' + encodeURIComponent(id), { method: 'PATCH', body: patch });
      closeSoldModal();
      toast('Sold for ' + accMoney(price) + '. Added to your summary.', 'ok');
      await loadAccounts();
    } catch (err) {
      setSoldFormMsg(err.message || 'Could not update the account.', 'error');
    } finally {
      el.soldSubmitBtn.disabled = false;
    }
  }

  // Fallback for the unlikely case the sold modal markup is missing.
  function markAccSoldLegacy(row) {
    var raw = window.prompt('Sale price for this account', row.sell_price != null && Number(row.sell_price) ? String(row.sell_price) : '');
    if (raw === null) return;
    var price = Number(raw);
    if (raw.trim() === '' || !isFinite(price) || price < 0) {
      toast('Sale price must be a non-negative number.', 'error');
      return;
    }
    api('/api/summary?id=' + encodeURIComponent(row.id), {
      method: 'PATCH',
      body: { status: 'SOLD', sellPrice: price, soldAt: new Date().toISOString() }
    }).then(function () {
      toast('Marked as sold.', 'ok');
      return loadAccounts();
    }).catch(function (err) {
      toast(err.message || 'Could not update the account.', 'error');
    });
  }

  function deleteAcc(row) {
    if (!window.confirm('Delete this account record? This cannot be undone.')) return;
    api('/api/summary?id=' + encodeURIComponent(row.id), { method: 'DELETE' })
      .then(function () {
        toast('Account deleted.', 'ok');
        return loadAccounts();
      })
      .catch(function (err) {
        toast(err.message || 'Could not delete the account.', 'error');
      });
  }

  /* -------- wiring -------- */

  function initAccounts() {
    if (el.accountsRefreshBtn) {
      el.accountsRefreshBtn.addEventListener('click', async function () {
        var btn = el.accountsRefreshBtn;
        if (btn.dataset.busy === '1') return;
        btn.dataset.busy = '1';
        btn.disabled = true;
        btn.classList.add('is-loading');
        btn.setAttribute('aria-busy', 'true');
        try {
          await loadAccounts();
        } finally {
          btn.disabled = false;
          btn.classList.remove('is-loading');
          btn.removeAttribute('aria-busy');
          btn.dataset.busy = '';
        }
      });
    }

    if (el.addAccountBtn) {
      el.addAccountBtn.addEventListener('click', function () { openAccModal(null); });
    }
    if (el.accCancelBtn) {
      el.accCancelBtn.addEventListener('click', closeAccModal);
    }
    if (el.accModal) {
      el.accModal.addEventListener('click', function (e) {
        if (e.target === el.accModal) closeAccModal();
      });
    }
    if (el.accForm) {
      el.accForm.addEventListener('submit', submitAccForm);
    }
    if (el.soldCancelBtn) {
      el.soldCancelBtn.addEventListener('click', closeSoldModal);
    }
    if (el.soldModal) {
      el.soldModal.addEventListener('click', function (e) {
        if (e.target === el.soldModal) closeSoldModal();
      });
    }
    if (el.soldForm) {
      el.soldForm.addEventListener('submit', submitSoldForm);
    }
    // Keep the outstanding balance visible while the operator types, in both
    // the sold dialog and the account editor.
    wireBalanceHint(el.soldPrice, el.soldPaidFirst, el.soldPaidSecond, el.soldBalanceHint);
    wireBalanceHint(el.accSell, el.accPaidFirst, el.accPaidSecond, el.accBalanceHint);
    if (el.accSearch) {
      el.accSearch.addEventListener('input', function () {
        acc.query = el.accSearch.value || '';
        renderAccounts();
      });
    }
    if (el.accAddBadgeBtn) {
      el.accAddBadgeBtn.addEventListener('click', addCustomAccBadge);
    }
    if (el.accCustomBadge) {
      el.accCustomBadge.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          addCustomAccBadge();
        }
      });
    }

    // Accordion + badge selection + custom badge removal, all delegated so the
    // re-rendered badge buttons do not need per-node listeners.
    if (el.accBadgeGroups) {
      el.accBadgeGroups.addEventListener('click', function (e) {
        var head = e.target.closest('.badge-group-head');
        if (head) {
          var group = head.closest('.badge-group');
          var key = group ? group.getAttribute('data-group') : '';
          var isOpen = group ? group.classList.contains('open') : false;
          openBadgeGroup(isOpen ? null : key);
          return;
        }
        var removeBtn = e.target.closest('[data-remove-badge]');
        if (removeBtn) {
          toggleAccBadge(removeBtn.getAttribute('data-remove-badge'));
          return;
        }
        var opt = e.target.closest('.badge-opt');
        if (opt) {
          toggleAccBadge(opt.getAttribute('data-badge'));
        }
      });
    }

    if (el.accSelectedBadges) {
      el.accSelectedBadges.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-remove-badge]');
        if (btn) toggleAccBadge(btn.getAttribute('data-remove-badge'));
      });
    }

    // Show/hide password buttons in the form.
    document.querySelectorAll('.pw-eye[data-pw-for]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var input = document.getElementById(btn.getAttribute('data-pw-for'));
        if (!input) return;
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.classList.toggle('active', show);
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      });
    });

    if (el.accBody) {
      el.accBody.addEventListener('click', function (e) {
        var reveal = e.target.closest('[data-reveal]');
        if (reveal) {
          var mask = reveal.parentNode.querySelector('.pw-mask');
          if (!mask) return;
          var shown = mask.classList.toggle('revealed');
          mask.textContent = shown ? (mask.getAttribute('data-pw') || '') : MASKED_PW;
          reveal.classList.toggle('active', shown);
          return;
        }
        var btn = e.target.closest('[data-acc-act]');
        if (!btn) return;
        var id = btn.getAttribute('data-id');
        var act = btn.getAttribute('data-acc-act');
        var row = acc.rows.filter(function (r) { return r.id === id; })[0];
        if (!row) return;
        if (act === 'edit') openAccModal(row);
        else if (act === 'sold') openSoldModal(row);
        else if (act === 'del') deleteAcc(row);
        else if (act === 'export') copyAccExport(row);
      });
    }

    document.querySelectorAll('[data-acc-filter]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        acc.filter = chip.getAttribute('data-acc-filter');
        document.querySelectorAll('[data-acc-filter]').forEach(function (c) {
          var on = c === chip;
          c.classList.toggle('chip-active', on);
          c.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        renderAccounts();
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && el.accModal && !el.accModal.hidden) {
        closeAccModal();
      }
      // The sold modal is never open at the same time as the account modal,
      // so checking it after the other one keeps Escape unambiguous.
      if (e.key === 'Escape' && el.soldModal && !el.soldModal.hidden) {
        closeSoldModal();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();