'use strict';

/* global state */
var state = {
  accounts: [],
  filter: 'all',
  busy: false,
  toastTimer: null
};

function $(id) { return document.getElementById(id); }

function esc(s) {
  return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function money(n) {
  var v = Number(n);
  if (isNaN(v)) v = 0;
  return '$' + v.toFixed(2);
}

function fmtDate(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function shortDate(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function splitList(value) {
  return String(value || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

function showToast(msg, type) {
  var el = $('toast');
  el.textContent = msg;
  el.className = 'toast ' + (type === 'err' ? 'err' : 'ok');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(function () { el.className = 'toast hidden'; }, 3800);
}

function showLogin() {
  $('summaryLogin').classList.remove('hidden');
  $('summaryDash').classList.add('hidden');
  $('loginError').classList.add('hidden');
  $('loginPassword').value = '';
}

function showDash() {
  $('summaryLogin').classList.add('hidden');
  $('summaryDash').classList.remove('hidden');
}

function api(path, method, body) {
  var opts = { method: method || 'GET', credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  return fetch('/api/' + path, opts).then(function (res) {
    return res.text().then(function (t) {
      var data = null;
      try { data = JSON.parse(t); } catch (e) { data = null; }
      return { ok: res.ok, status: res.status, data: data };
    });
  });
}

/* ---------------- Auth ---------------- */
function handleLogin(e) {
  e.preventDefault();
  var pw = $('loginPassword').value;
  var btn = $('loginBtn');
  var errEl = $('loginError');
  btn.disabled = true;
  btn.textContent = 'Signing in...';
  api('auth/login', 'POST', { password: pw }).then(function (r) {
    if (r.ok) {
      errEl.classList.add('hidden');
      showDash();
      loadAccounts();
    } else {
      errEl.textContent = (r.data && r.data.error) || 'Login failed.';
      errEl.classList.remove('hidden');
    }
  }).catch(function () {
    errEl.textContent = 'Could not reach the server.';
    errEl.classList.remove('hidden');
  }).then(function () {
    btn.disabled = false;
    btn.textContent = 'Login';
  });
}

function handleLogout() {
  api('auth/logout', 'POST').then(showLogin).catch(showLogin);
}

/* ---------------- Dashboard ---------------- */
function loadAccounts() {
  state.busy = true;
  api('accounts').then(function (r) {
    if (r.status === 401) {
      showLogin();
      return;
    }
    if (!r.ok) {
      showToast(((r.data && r.data.error) || 'Failed to load accounts.'), 'err');
      state.accounts = [];
    } else {
      state.accounts = r.data || [];
    }
    renderAll();
  }).catch(function () {
    showToast('Network error while loading accounts.', 'err');
  }).then(function () {
    state.busy = false;
  });
}

function filterRows() {
  if (state.filter === 'all') return state.accounts;
  return state.accounts.filter(function (row) { return row.status === state.filter; });
}

function renderAll() { renderKPIs(); renderTable(); }

function renderKPIs() {
  var now = new Date();
  var yearMonth = now.getFullYear() * 100 + (now.getMonth() + 1);
  var spent = 0, revenue = 0, mRevenue = 0, mCost = 0;
  state.accounts.forEach(function (row) {
    var buy = Number(row.buy_price) || 0;
    spent += buy;
    if (row.status === 'SOLD') {
      var sell = Number(row.sell_price) || 0;
      revenue += sell;
      var sold = new Date(row.sold_at);
      if (!isNaN(sold.getTime()) && sold.getFullYear() * 100 + (sold.getMonth() + 1) === yearMonth) {
        mRevenue += sell;
        mCost += buy;
      }
    }
  });
  var net = revenue - spent;
  var monthly = mRevenue - mCost;
  $('kpiSpent').textContent = money(spent);
  $('kpiRevenue').textContent = money(revenue);
  $('kpiNet').textContent = money(net);
  $('kpiNet').className = 'kpi-value' + (net < 0 ? ' net-negative' : ' net-positive');
  $('kpiMonthly').textContent = money(monthly);
  $('kpiMonthly').className = 'kpi-value' + (monthly < 0 ? ' net-negative' : ' net-positive');
}

function renderTable() {
  var rows = filterRows();
  $('accountCount').textContent = rows.length + (rows.length === 1 ? ' account' : ' accounts');
  $('emptyState').classList.toggle('hidden', rows.length > 0);
  var tbody = $('accountsBody');
  tbody.innerHTML = rows.map(rowHtml).join('');
}

function badgesHtml(row) {
  var out = [];
  if (row.nitro_tier && row.nitro_tier !== 'None' && row.nitro_tier !== 'Unknown') {
    out.push('<span class="chip-tag nitro">' + esc(row.nitro_tier) + '</span>');
  }
  if (row.two_factor_enabled) out.push('<span class="chip-tag mfa">2FA</span>');
  if (row.verified) {
    out.push('<span class="chip-tag">Verified</span>');
  } else if (row.email) {
    out.push('<span class="chip-tag unv">Unverified</span>');
  }
  (row.badges || []).forEach(function (b) { out.push('<span class="chip-tag">' + esc(b) + '</span>'); });
  (row.decorations || []).slice(0, 2).forEach(function (d) { out.push('<span class="chip-tag">' + esc(d) + '</span>'); });
  return out.join('') || '<span class="cell-micro">—</span>';
}

function rowHtml(row) {
  var id = esc(row.discord_id);
  var username = esc(row.username);
  var net = '—', netClass = '';
  if (row.status === 'SOLD') {
    var profit = (Number(row.sell_price) || 0) - (Number(row.buy_price) || 0);
    net = money(profit);
    netClass = profit < 0 ? 'net-negative' : 'net-positive';
  }
  var actions;
  if (row.status === 'AVAILABLE') {
    actions = '<button class="btn btn-sm btn-secondary" data-act="sold" data-id="' + esc(row.id) + '">Mark Sold</button>'
      + '<button class="btn btn-sm btn-danger" data-act="del" data-id="' + esc(row.id) + '">Delete</button>';
  } else {
    actions = '<button class="btn btn-sm btn-danger" data-act="del" data-id="' + esc(row.id) + '">Delete</button>';
  }
  return '<tr>'
    + '<td><strong>' + (id || '—') + '</strong>'
    + (username ? '<div class="cell-user-sub">' + username + '</div>' : '')
    + (row.notes ? '<div class="cell-micro">' + esc(row.notes) + '</div>' : '')
    + '</td>'
    + '<td>' + badgesHtml(row) + '</td>'
    + '<td><div class="cell-sub">' + esc(row.email || '—') + '</div>'
    + '<div class="cell-micro">' + (row.phone ? esc(row.phone) : (row.email ? 'phone: —' : '')) + '</div></td>'
    + '<td class="cell-sub">' + fmtDate(row.creation_date)
    + '<div class="cell-micro">added ' + shortDate(row.created_at) + '</div></td>'
    + '<td class="num">' + money(row.buy_price) + '</td>'
    + '<td><span class="status-badge status-' + esc(row.status) + '">' + esc(row.status) + '</span>'
    + (row.status === 'SOLD' && row.sold_at ? '<div class="cell-micro">' + shortDate(row.sold_at) + '</div>' : '')
    + '</td>'
    + '<td class="num">' + (row.status === 'SOLD' ? money(row.sell_price) : '—') + '</td>'
    + '<td class="num ' + netClass + '">' + net + '</td>'
    + '<td><div class="row-actions">' + actions + '</div></td>'
    + '</tr>';
}

/* ---------------- Modal ---------------- */
function resetModal() {
  ['fDiscordId', 'fUsername', 'fEmail', 'fPhone', 'fBadges', 'fDecorations', 'fNotes', 'fBuyPrice', 'tokenInput'].forEach(function (id) {
    $(id).value = '';
  });
  $('fCreationDate').value = '';
  $('fNitro').value = 'None';
  $('f2fa').checked = false;
  $('fVerified').checked = false;
  $('fetchStatus').className = 'fetch-status';
  $('fetchStatus').textContent = '';
  $('saveStatus').className = 'fetch-status';
  $('saveStatus').textContent = '';
}

function openModal() {
  resetModal();
  $('addModal').classList.remove('hidden');
  setTimeout(function () { $('tokenInput').focus(); }, 30);
}

function closeModal() {
  $('addModal').classList.add('hidden');
}

function fetchDetail() {
  var token = $('tokenInput').value.trim();
  var statusEl = $('fetchStatus');
  if (!token) {
    statusEl.textContent = 'Paste a Discord token first.';
    statusEl.className = 'fetch-status err';
    return;
  }
  var btn = $('fetchBtn');
  btn.disabled = true;
  btn.textContent = 'Fetching...';
  statusEl.textContent = 'Querying Discord...';
  statusEl.className = 'fetch-status';
  api('discord/fetch', 'POST', { token: token }).then(function (r) {
    if (!r.ok) {
      statusEl.textContent = (r.data && r.data.error) || 'Fetch failed.';
      statusEl.className = 'fetch-status err';
      return;
    }
    var d = r.data.data || {};
    $('fDiscordId').value = d.discordId || '';
    $('fUsername').value = d.tag || d.username || '';
    $('fEmail').value = d.email || '';
    $('fPhone').value = d.phoneLinked && d.phone ? d.phone : '';
    $('f2fa').checked = !!d.twoFactorEnabled;
    $('fVerified').checked = !!d.verified;
    if (d.creationDate) $('fCreationDate').value = String(d.creationDate).slice(0, 10);
    if (d.nitroTier && ['None', 'Nitro Classic', 'Nitro', 'Nitro Basic'].indexOf(d.nitroTier) !== -1) {
      $('fNitro').value = d.nitroTier;
    }
    $('fBadges').value = (d.badges || []).join(', ');
    $('fDecorations').value = (d.decorations || []).join(', ');
    statusEl.textContent = 'Details fetched for ' + (d.discordId ? '#' + d.discordId : 'account') + '. Review and set a buy price.';
    statusEl.className = 'fetch-status ok';
  }).catch(function () {
    statusEl.textContent = 'Could not reach the server.';
    statusEl.className = 'fetch-status err';
  }).then(function () {
    btn.disabled = false;
    btn.textContent = 'Fetch Details';
  });
}

function saveAccount(e) {
  e.preventDefault();
  var statusEl = $('saveStatus');
  var buyPrice = Number($('fBuyPrice').value);
  if ($('fBuyPrice').value === '' || isNaN(buyPrice) || buyPrice < 0) {
    statusEl.textContent = 'Buy price is required and must be a valid non-negative number.';
    statusEl.className = 'fetch-status err';
    return;
  }
  var payload = {
    discordId: $('fDiscordId').value.trim(),
    username: $('fUsername').value.trim(),
    email: $('fEmail').value.trim(),
    phone: $('fPhone').value.trim(),
    twoFactorEnabled: $('f2fa').checked,
    verified: $('fVerified').checked,
    creationDate: $('fCreationDate').value || '',
    nitroTier: $('fNitro').value,
    badges: splitList($('fBadges').value),
    decorations: splitList($('fDecorations').value),
    buyPrice: buyPrice,
    notes: $('fNotes').value.trim()
  };
  var btn = $('saveBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  api('accounts', 'POST', payload).then(function (r) {
    if (r.status === 401) { showLogin(); return; }
    if (!r.ok) {
      statusEl.textContent = (r.data && r.data.error) || 'Failed to save account.';
      statusEl.className = 'fetch-status err';
      return;
    }
    statusEl.textContent = '';
    showToast('Account added.', 'ok');
    closeModal();
    loadAccounts();
  }).catch(function () {
    statusEl.textContent = 'Could not reach the server.';
    statusEl.className = 'fetch-status err';
  }).then(function () {
    btn.disabled = false;
    btn.textContent = 'Save Account';
  });
}

/* ---------------- Row actions ---------------- */
function markSold(id, name) {
  var label = name ? ' "' + name + '"' : '';
  var raw = prompt('Enter the sale price for account' + label + ':', '0');
  if (raw === null) return;
  var sellPrice = Number(raw);
  if (isNaN(sellPrice) || sellPrice < 0) {
    showToast('Sale price must be a valid non-negative number.', 'err');
    return;
  }
  api('accounts/' + encodeURIComponent(id), 'PATCH', {
    status: 'SOLD',
    sellPrice: sellPrice,
    soldAt: new Date().toISOString()
  }).then(function (r) {
    if (r.status === 401) { showLogin(); return; }
    if (!r.ok) {
      showToast((r.data && r.data.error) || 'Failed to update account.', 'err');
      return;
    }
    showToast('Account marked as sold.', 'ok');
    loadAccounts();
  }).catch(function () {
    showToast('Network error while updating account.', 'err');
  });
}

function deleteAccount(id) {
  if (!confirm('Delete this account record? This cannot be undone.')) return;
  api('accounts/' + encodeURIComponent(id), 'DELETE').then(function (r) {
    if (r.status === 401) { showLogin(); return; }
    if (!r.ok) {
      showToast((r.data && r.data.error) || 'Failed to delete account.', 'err');
      return;
    }
    showToast('Account deleted.', 'ok');
    loadAccounts();
  }).catch(function () {
    showToast('Network error while deleting account.', 'err');
  });
}

/* ---------------- Wiring ---------------- */
function setFilter(filter, btn) {
  state.filter = filter;
  var chips = document.querySelectorAll('.chip[data-filter]');
  for (var i = 0; i < chips.length; i++) {
    chips[i].classList.toggle('chip-active', chips[i] === btn);
  }
  renderTable();
}

function bindUI() {
  $('loginForm').addEventListener('submit', handleLogin);
  $('logoutBtn').addEventListener('click', handleLogout);
  $('addAccountBtn').addEventListener('click', openModal);
  $('modalClose').addEventListener('click', closeModal);
  $('saveCancel').addEventListener('click', closeModal);
  $('fetchBtn').addEventListener('click', fetchDetail);
  $('tokenInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      fetchDetail();
    }
  });
  $('accountForm').addEventListener('submit', saveAccount);

  var chips = document.querySelectorAll('.chip[data-filter]');
  for (var i = 0; i < chips.length; i++) {
    chips[i].addEventListener('click', function () {
      setFilter(this.getAttribute('data-filter'), this);
    });
  }

  $('accountsBody').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    var act = btn.getAttribute('data-act');
    var name = state.accounts.filter(function (r) { return r.id === id; })[0];
    name = name ? name.username : '';
    if (act === 'sold') markSold(id, name);
    else if (act === 'del') deleteAccount(id);
  });

  $('addModal').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
  });
  $('loginForm').addEventListener('keydown', function () { /* noop, form handles Enter */ });
}

function init() {
  bindUI();
  api('auth/check').then(function (r) {
    if (r.ok && r.data && r.data.authenticated) {
      showDash();
      loadAccounts();
    } else {
      showLogin();
    }
  }).catch(function () {
    showLogin();
  });
}

document.addEventListener('DOMContentLoaded', init);