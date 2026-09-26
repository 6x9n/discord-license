'use strict';

var state = {
  accounts: [],
  filter: 'all',
  mode: 'autofill',
  toastTimer: null,
  sellingId: null
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

/* Every option here ships real Discord artwork. A badge we have no file for is
   left out rather than shown as an invented icon, because a hand-drawn badge is
   not the badge the account actually has. Values already saved under a removed
   name still resolve through BadgeIcons and show as removable custom chips.

   Ordered the way the main profile tool draws a profile: account badges in
   Discord flag order, then Nitro, then Server Boost, then the gift tier. */
var BADGE_OPTIONS = [
  'Discord Staff',
  'Partner',
  'HypeSquad Events',
  'Bug Hunter Level 1',
  'HypeSquad Bravery',
  'HypeSquad Brilliance',
  'HypeSquad Balance',
  'Early Supporter',
  'Bug Hunter Level 2',
  'Discord Certified Moderator',
  'Active Developer',
  'Nitro',
  'Bronze',
  'Silver',
  'Gold',
  'Platinum',
  'Emerald',
  'Ruby',
  'Opal',
  'Diamond',
  'Boost Level 1',
  'Boost Level 2',
  'Boost Level 3',
  'Boost Level 4',
  'Boost Level 5',
  'Boost Level 6',
  'Boost Level 7',
  'Boost Level 8',
  'Boost Level 9',
  'Patron',
  'Champion',
  'Luminary',
  'Icon',
  'Hero',
  'Legend',
  'Completed a Quest',
  'Orb',
  'Leaf'
];

/* Badge labels are stored as free text, so rows saved before the rename still
   carry the old wording ("Bug Hunter", "Boost Tier 1"). Compare and store the
   current name so those rows keep working instead of looking like custom
   badges or being dropped on save. Unknown labels pass through untouched. */
function badgeName(value) {
  if (window.BadgeIcons && typeof window.BadgeIcons.canonical === 'function') {
    return window.BadgeIcons.canonical(value);
  }
  return String(value === undefined || value === null ? '' : value);
}

function sameBadge(a, b) {
  return badgeName(a) === badgeName(b);
}

/* Real badge artwork when the repo has it, drawn glyph otherwise. */
function badgeIcon(label) {
  var B = window.BadgeIcons;
  if (!B) return '';
  return typeof B.media === 'function' ? B.media(label) : B.svg(label);
}

function badgeList() {
  var seen = {};
  return splitList($('fBadges').value)
    .map(badgeName)
    .filter(function (b) {
      if (!b || seen[b]) return false;
      seen[b] = true;
      return true;
    });
}

function syncBadgePicker() {
  var list = badgeList();
  var html = [];
  BADGE_OPTIONS.forEach(function (b) {
    var on = list.some(function (x) { return sameBadge(x, b); });
    // The artwork identifies the badge, so the name is hidden visually and
    // stays available as a tooltip and to screen readers. Without artwork the
    // name has to stay visible, otherwise the option is unreadable.
    var art = badgeIcon(b);
    html.push('<button type="button" data-badge="' + esc(b) + '" role="checkbox" aria-checked="' + on
      + '" class="badge-opt' + (on ? ' selected' : '') + '" title="' + esc(b) + '">'
      + art + '<span class="badge-label' + (art ? ' sr-only' : ' badge-label-show') + '">' + esc(b) + '</span></button>');
  });
  list.forEach(function (b) {
    var isKnown = BADGE_OPTIONS.some(function (x) { return sameBadge(x, b); });
    if (!isKnown) {
      var cArt = badgeIcon(b);
      html.push('<button type="button" data-badge="' + esc(b) + '" role="checkbox" aria-checked="true"'
        + ' class="badge-opt selected" title="' + esc(b) + '">' + cArt
        + '<span class="badge-label' + (cArt ? ' sr-only' : ' badge-label-show') + '">' + esc(b) + '</span></button>');
    }
  });
  $('badgePicker').innerHTML = html.join('');
}

function toggleBadge(b) {
  var list = badgeList();
  var i = -1;
  for (var k = 0; k < list.length; k++) {
    if (sameBadge(list[k], b)) { i = k; break; }
  }
  if (i !== -1) list.splice(i, 1);
  else list.push(badgeName(b));
  $('fBadges').value = list.join(', ');
  markField('fBadges', false);
  if ($('saveStatus').classList.contains('err')) setSaveStatus('');
  syncBadgePicker();
}

function addCustomBadge() {
  var input = $('fCustomBadge');
  var val = input.value.trim();
  if (!val) { input.focus(); return; }
  if (val.length > 60) {
    markField('fCustomBadge', true);
    input.focus();
    showToast('Custom badge is too long (max 60 characters).', 'err');
    return;
  }
  markField('fCustomBadge', false);
  var list = badgeList();
  var already = list.some(function (b) { return sameBadge(b, val); });
  if (!already) list.push(val);
  $('fBadges').value = list.join(', ');
  input.value = '';
  if ($('saveStatus').classList.contains('err')) setSaveStatus('');
  syncBadgePicker();
  input.focus();
}

function showToast(msg, type) {
  var el = $('toast');
  el.textContent = msg;
  el.className = 'toast ' + (type === 'err' ? 'err' : (type === 'warn' ? 'warn' : 'ok'));
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(function () { el.className = 'toast hidden'; }, 3800);
}

/* Warn once per load about Nitro that is about to lapse. One toast naming the
   accounts rather than a toast per account, because a toast per account would
   push the earlier ones off screen and the last one seen is the only one read.
   The rows are coloured too, so this is a nudge rather than the only signal.

   The key is what makes it once: the filter buttons and every save re-render
   the table, and warning again on each of those would be noise. */
var warnedNitroKey = null;
function warnExpiringNitro(rows) {
  var soon = [];
  var expired = 0;
  rows.forEach(function (row) {
    var end = nitroEnd(row.nitro_ends);
    if (!end) return;
    if (end.state === 'expired') { expired++; soon.push(row); }
    else if (end.state === 'soon') { soon.push(row); }
  });
  if (!soon.length) return;
  // Keyed on the accounts themselves, so a later reload with real changes warns
  // again while re-rendering the same list stays quiet.
  var key = soon.map(function (r) { return r.id + ':' + r.nitro_ends; }).sort().join('|');
  if (key === warnedNitroKey) return;
  warnedNitroKey = key;

  var names = soon.map(function (r) {
    return (r.username || r.discord_id || r.email || 'account') + ' ' + nitroEnd(r.nitro_ends).when;
  });
  var shown = names.slice(0, 3).join(', ');
  if (names.length > 3) shown += ' and ' + (names.length - 3) + ' more';
  var days = (window.BadgeIcons && window.BadgeIcons.nitroSoonDays) || 7;
  showToast(
    (expired
      ? expired + ' account' + (expired === 1 ? ' has' : 's have') + ' Nitro already expired, '
      + soon.length + ' ending within ' + days + ' days: '
      : soon.length + ' account' + (soon.length === 1 ? '' : 's') + ' ending Nitro within '
      + days + ' days: ') + shown,
    expired ? 'err' : 'warn');
}

function showLogin() {
  $('summaryLogin').classList.remove('hidden');
  $('summaryDash').classList.add('hidden');
  $('loginError').classList.add('hidden');
  $('loginPassword').value = '';
  setTimeout(function () { $('loginPassword').focus(); }, 30);
}

function showDash() {
  $('summaryLogin').classList.add('hidden');
  $('summaryDash').classList.remove('hidden');
}

function setBtnLoading(btn, loading) {
  btn.classList.toggle('is-loading', !!loading);
  btn.disabled = !!loading;
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

/* ================= Login ================= */
function setLoginError(msg) {
  var errEl = $('loginError');
  if (!msg) {
    errEl.classList.add('hidden');
    errEl.textContent = '';
    return;
  }
  errEl.textContent = msg;
  errEl.classList.remove('hidden');
  var card = $('loginCard');
  card.classList.remove('shake');
  void card.offsetWidth; // restart animation
  card.classList.add('shake');
}

function handleLogin(e) {
  e.preventDefault();
  var pw = $('loginPassword').value;
  var btn = $('loginBtn');

  if (!pw) {
    setLoginError('Please enter the password.');
    $('loginPassword').focus();
    return;
  }

  setLoginError(null);
  setBtnLoading(btn, true);
  api('summary?op=login', 'POST', { password: pw }).then(function (r) {
    if (r.ok) {
      showDash();
      loadAccounts();
    } else {
      setLoginError((r.data && r.data.error) || 'Login failed.');
      $('loginPassword').select();
    }
  }).catch(function () {
    setLoginError('Could not reach the server. Check your connection and try again.');
  }).then(function () {
    setBtnLoading(btn, false);
  });
}

function handleLogout() {
  api('summary?op=logout', 'POST').then(showLogin).catch(showLogin);
}

/* ================= Dashboard ================= */
function loadAccounts() {
  api('summary').then(function (r) {
    if (r.status === 401) { showLogin(); return; }
    if (!r.ok) {
      showToast(((r.data && r.data.error) || 'Failed to load accounts.'), 'err');
      state.accounts = [];
    } else {
      state.accounts = r.data || [];
    }
    renderAll();
  }).catch(function () {
    showToast('Network error while loading accounts.', 'err');
  });
}

function filterRows() {
  if (state.filter === 'all') return state.accounts;
  return state.accounts.filter(function (row) { return row.status === state.filter; });
}

function renderAll() { renderKPIs(); renderTable(); warnExpiringNitro(state.accounts); }

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
  function tag(label, cls) {
    // Bare artwork: no chip fill or border, name kept for tooltips and screen
    // readers. chip-art is separate from chip-tag so the text tags such as 2FA
    // and Verified keep their background.
    var art = badgeIcon(label);
    return '<span class="' + (cls || 'chip-tag') + ' chip-art" title="' + esc(label) + '">' + art
      + '<span class="badge-label' + (art ? ' sr-only' : ' badge-label-show') + '">' + esc(label) + '</span></span>';
  }
  // Colour the Nitro badge itself when the subscription is close to or past its
  // end, so the urgency is visible on the row without having to read the date.
  var end = nitroEnd(row.nitro_ends);
  if (row.nitro_tier && row.nitro_tier !== 'None' && row.nitro_tier !== 'Unknown') {
    out.push(tag(row.nitro_tier, 'chip-tag nitro' + (end && end.state !== 'ok' ? ' nitro-chip-' + end.state : '')));
  }
  if (row.two_factor_enabled) out.push('<span class="chip-tag mfa">2FA</span>');
  if (row.verified) {
    out.push('<span class="chip-tag">Verified</span>');
  } else if (row.email) {
    out.push('<span class="chip-tag unv">Unverified</span>');
  }
  // Saved badges come back in whatever order they were ticked, so put them back
  // into profile order here or the same set of badges reads differently on
  // every account.
  orderBadges(row.badges || []).forEach(function (b) { out.push(tag(badgeName(b))); });
  (row.decorations || []).slice(0, 2).forEach(function (d) { out.push(tag(d)); });
  var html = out.join('') || '<span class="cell-micro">—</span>';
  // Nitro expiry sits on its own line under the badges rather than in the run of
  // chips, so it cannot be mistaken for one and the date has room to breathe.
  if (end) {
    html += '<div class="' + end.cls + '">' + badgeIcon('Nitro')
      + '<span>Nitro ends ' + esc(fmtDate(row.nitro_ends)) + '</span>'
      + (end.when ? '<span class="nitro-end-when">' + esc(end.when) + '</span>' : '')
      + '</div>';
  }
  return html;
}

/* Nitro expiry, or null when the account has no usable date. Shared with the
   toast below so the row colour and the warning always agree. */
function nitroEnd(iso) {
  if (!window.BadgeIcons || typeof window.BadgeIcons.nitroEndInfo !== 'function') return null;
  return window.BadgeIcons.nitroEndInfo(iso);
}

function orderBadges(list) {
  if (window.BadgeIcons && typeof window.BadgeIcons.orderBadges === 'function') {
    return window.BadgeIcons.orderBadges(list);
  }
  return list || [];
}

function telegramHtml(raw) {
  var v = String(raw || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) {
    return '<a class="link" href="' + esc(v) + '" target="_blank" rel="noopener noreferrer">' + esc(v) + '</a>';
  }
  var slug = v.replace(/^@/, '').replace(/[^a-zA-Z0-9_]/g, '');
  if (!slug) return esc(v);
  return '<a class="link" href="https://t.me/' + esc(slug) + '" target="_blank" rel="noopener noreferrer">@' + esc(slug) + '</a>';
}

function buyerBlock(row) {
  var parts = [];
  if (row.buyer_name) parts.push(esc(row.buyer_name));
  if (row.buyer_telegram) parts.push(telegramHtml(row.buyer_telegram));
  if (!parts.length) return '';
  return '<div class="cell-micro">buyer: ' + parts.join(' &middot; ') + '</div>';
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
    + '<td><div class="cell-sub" title="' + esc(row.email || '') + '">' + esc(row.email || '—') + '</div>'
    + '<div class="cell-micro">' + (row.phone ? esc(row.phone) : (row.email ? 'phone: —' : '')) + '</div></td>'
    + '<td class="cell-sub">' + fmtDate(row.creation_date)
    + '<div class="cell-micro">added ' + shortDate(row.created_at) + '</div></td>'
    + '<td class="num">' + money(row.buy_price) + '</td>'
    + '<td><span class="status-badge status-' + esc(row.status) + '">' + esc(row.status) + '</span>'
    + (row.status === 'SOLD' && row.sold_at ? '<div class="cell-micro">' + shortDate(row.sold_at) + '</div>' : '')
    + (row.status === 'SOLD' ? buyerBlock(row) : '')
    + '</td>'
    + '<td class="num">' + (row.status === 'SOLD' ? money(row.sell_price) : '—') + '</td>'
    + '<td class="num ' + netClass + '">' + net + '</td>'
    + '<td><div class="row-actions">' + actions + '</div></td>'
    + '</tr>';
}

/* ================= Modal ================= */
var FORM_INPUTS = ['fDiscordId', 'fUsername', 'fEmail', 'fPhone', 'fCreationDate', 'fBadges', 'fDecorations', 'fNotes', 'fBuyPrice'];

function markField(id, invalid) {
  var el = $(id);
  if (!el) return;
  el.classList.toggle('field-invalid', !!invalid);
  el.setAttribute('aria-invalid', invalid ? 'true' : 'false');
}

function setSaveStatus(msg, type) {
  var el = $('saveStatus');
  el.textContent = msg || '';
  el.className = 'fetch-status' + (type ? ' ' + type : '');
}

function clearStatuses() {
  setSaveStatus('');
  $('fetchStatus').className = 'fetch-status';
  $('fetchStatus').textContent = '';
}

function resetModal() {
  FORM_INPUTS.forEach(function (id) { $(id).value = ''; });
  $('tokenInput').value = '';
  $('fCustomBadge').value = '';
  $('fNitro').value = 'None';
  $('f2fa').checked = false;
  $('fVerified').checked = false;
  FORM_INPUTS.forEach(function (id) { markField(id, false); });
  markField('fCustomBadge', false);
  clearStatuses();
  syncBadgePicker();
}

function setMode(mode) {
  state.mode = mode;
  var autofill = $('modeAutofill');
  var manual = $('modeManual');
  var autofillActive = mode === 'autofill';
  autofill.classList.toggle('mode-active', autofillActive);
  manual.classList.toggle('mode-active', !autofillActive);
  autofill.setAttribute('aria-selected', autofillActive ? 'true' : 'false');
  manual.setAttribute('aria-selected', autofillActive ? 'false' : 'true');
  $('tokenPanel').classList.toggle('hidden', !autofillActive);
}

function openModal() {
  resetModal();
  setMode(state.mode);
  $('addModal').classList.remove('hidden');
  setTimeout(function () {
    if (state.mode === 'autofill') $('tokenInput').focus();
    else $('fDiscordId').focus();
  }, 30);
}

function closeModal() {
  $('addModal').classList.add('hidden');
}

function openAutofill() { setMode('autofill'); openModal(); }
function openManual() { setMode('manual'); openModal(); }

/* -------- Token fetch -------- */
function fetchDetail() {
  var token = $('tokenInput').value;
  var statusEl = $('fetchStatus');

  if (!token.trim()) {
    statusEl.textContent = 'Paste a Discord token first.';
    statusEl.className = 'fetch-status err';
    $('tokenInput').focus();
    return;
  }
  if (/\s/.test(token)) {
    statusEl.textContent = 'The token contains spaces. Make sure you copied the whole token.';
    statusEl.className = 'fetch-status err';
    return;
  }
  if (token.length < 20) {
    statusEl.textContent = 'This token looks too short to be valid. Check it and try again.';
    statusEl.className = 'fetch-status err';
    return;
  }

  var btn = $('fetchBtn');
  setBtnLoading(btn, true);
  statusEl.textContent = 'Querying Discord...';
  statusEl.className = 'fetch-status';

  api('summary?op=fetch', 'POST', { token: token.trim() }).then(function (r) {
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
    syncBadgePicker();
    $('fDecorations').value = (d.decorations || []).join(', ');
    ['fDiscordId', 'fUsername', 'fEmail', 'fPhone', 'fCreationDate'].forEach(function (id) { markField(id, false); });
    statusEl.textContent = 'Details fetched for ' + (d.discordId ? '#' + d.discordId : 'account') + '. Review and set a buy price.';
    statusEl.className = 'fetch-status ok';
  }).catch(function () {
    statusEl.textContent = 'Could not reach the server.';
    statusEl.className = 'fetch-status err';
  }).then(function () {
    setBtnLoading(btn, false);
  });
}

/* -------- Submit -------- */
function validateForm() {
  var errors = [];

  var buyRaw = $('fBuyPrice').value;
  var buyPrice = Number(buyRaw);
  if (buyRaw === '' || !isFinite(buyPrice) || buyPrice < 0) {
    errors.push({ id: 'fBuyPrice', msg: 'Buy price is required and must be a valid non-negative number.' });
  }

  var discordId = $('fDiscordId').value.trim();
  if (discordId) {
    if (!/^[0-9]{15,21}$/.test(discordId)) {
      errors.push({ id: 'fDiscordId', msg: 'Discord ID must be 15 to 21 digits (no letters).' });
    } else if (state.accounts.some(function (a) { return a.discord_id && a.discord_id === discordId; })) {
      errors.push({ id: 'fDiscordId', msg: 'An account with this Discord ID is already tracked.' });
    }
  }

  var username = $('fUsername').value.trim();
  if (username.length > 40) {
    errors.push({ id: 'fUsername', msg: 'Username is too long (max 40 characters).' });
  }

  var email = $('fEmail').value.trim();
  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      errors.push({ id: 'fEmail', msg: 'Email address format looks invalid.' });
    }
  }

  var phone = $('fPhone').value.trim();
  if (phone && !/^[0-9()+\-.\s]{6,30}$/.test(phone)) {
    errors.push({ id: 'fPhone', msg: 'Phone number looks invalid (digits, +, -, parentheses only).' });
  }

  var creationDate = $('fCreationDate').value;
  if (creationDate) {
    var cd = new Date(creationDate + 'T00:00:00');
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    if (cd > today) {
      errors.push({ id: 'fCreationDate', msg: 'Creation date cannot be in the future.' });
    }
  }

  if (!discordId && !username && !email) {
    errors.push({ id: 'fDiscordId', msg: 'Enter at least a Discord ID, a username, or an email so the account can be identified.' });
  }

  [$('fBadges').value, $('fDecorations').value].forEach(function (rawVal) {
    splitList(rawVal).forEach(function (item) {
      if (item.length > 60) {
        errors.push({ id: 'fBadges', msg: 'A badge / decoration label is too long (max 60 characters).' });
      }
    });
  });

  return errors;
}

function saveAccount(e) {
  e.preventDefault();
  FORM_INPUTS.forEach(function (id) { markField(id, false); });
  setSaveStatus('');

  var errors = validateForm();
  if (errors.length) {
    errors.forEach(function (er) { markField(er.id, true); });
    var msgs = errors.map(function (er) { return er.msg; });
    setSaveStatus(msgs.length === 1 ? msgs[0] : 'Please fix the highlighted fields: ' + msgs.join(' '), 'err');
    var first = errors[0];
    var el = $(first.id);
    if (el) {
      if (el.focus) el.focus();
      if (el.select) el.select();
    }
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
    buyPrice: Number($('fBuyPrice').value),
    notes: $('fNotes').value.trim()
  };

  var btn = $('saveBtn');
  setBtnLoading(btn, true);
  api('summary', 'POST', payload).then(function (r) {
    if (r.status === 401) { showLogin(); return; }
    if (!r.ok) {
      setSaveStatus((r.data && r.data.error) || 'Failed to save account.', 'err');
      return;
    }
    setSaveStatus('');
    showToast('Account added.', 'ok');
    closeModal();
    loadAccounts();
  }).catch(function () {
    setSaveStatus('Could not reach the server.', 'err');
  }).then(function () {
    setBtnLoading(btn, false);
  });
}

/* ================= Row actions ================= */
/* ================= Sold modal ================= */
function openSold(id) {
  state.sellingId = id;
  var name = '';
  var found = state.accounts.filter(function (r) { return r.id === id; })[0];
  if (found && found.username) name = ' "' + found.username + '"';
  $('soldTitle').textContent = 'Mark' + name + ' as Sold';
  $('soldPrice').value = '0';
  $('soldBuyer').value = '';
  $('soldTelegram').value = '';
  markField('soldPrice', false);
  markField('soldBuyer', false);
  markField('soldTelegram', false);
  $('soldStatus').textContent = '';
  $('soldStatus').className = 'fetch-status';
  $('soldModal').classList.remove('hidden');
  setTimeout(function () { $('soldPrice').focus(); $('soldPrice').select(); }, 30);
}

function closeSoldModal() {
  $('soldModal').classList.add('hidden');
}

function submitSold(e) {
  e.preventDefault();
  var raw = $('soldPrice').value;
  var sellPrice = Number(raw);
  if (raw.trim() === '' || !isFinite(sellPrice) || sellPrice < 0) {
    markField('soldPrice', true);
    $('soldStatus').textContent = 'Sale price must be a valid non-negative number.';
    $('soldStatus').className = 'fetch-status err';
    return;
  }
  markField('soldPrice', false);
  var payload = {
    status: 'SOLD',
    sellPrice: sellPrice,
    soldAt: new Date().toISOString()
  };
  var buyerName = $('soldBuyer').value.trim();
  var buyerTelegram = $('soldTelegram').value.trim();
  if (buyerName) payload.buyerName = buyerName;
  if (buyerTelegram) payload.buyerTelegram = buyerTelegram;

  var btn = $('soldSave');
  setBtnLoading(btn, true);
  api('summary?id=' + encodeURIComponent(state.sellingId), 'PATCH', payload).then(function (r) {
    if (r.status === 401) { showLogin(); return; }
    if (!r.ok) {
      $('soldStatus').textContent = (r.data && r.data.error) || 'Failed to update account.';
      $('soldStatus').className = 'fetch-status err';
      return;
    }
    closeSoldModal();
    showToast('Account marked as sold.', 'ok');
    loadAccounts();
  }).catch(function () {
    $('soldStatus').textContent = 'Network error while updating account.';
    $('soldStatus').className = 'fetch-status err';
  }).then(function () {
    setBtnLoading(btn, false);
  });
}

function deleteAccount(id) {
  if (!confirm('Delete this account record? This cannot be undone.')) return;
  api('summary?id=' + encodeURIComponent(id), 'DELETE').then(function (r) {
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

/* ================= Wiring ================= */
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
  $('loginPassword').addEventListener('input', function () { setLoginError(null); });
  $('pwToggle').addEventListener('click', function () {
    var pw = $('loginPassword');
    var show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    $('pwEyeOpen').classList.toggle('hidden', !show);
    $('pwEyeClosed').classList.toggle('hidden', show);
    this.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    pw.focus();
  });

  $('logoutBtn').addEventListener('click', handleLogout);
  $('addAccountBtn').addEventListener('click', openAutofill);
  $('addManualBtn').addEventListener('click', openManual);

  $('modalClose').addEventListener('click', closeModal);
  $('saveCancel').addEventListener('click', closeModal);
  $('modeAutofill').addEventListener('click', function () { setMode('autofill'); $('tokenInput').focus(); });
  $('modeManual').addEventListener('click', function () { setMode('manual'); $('fDiscordId').focus(); });
  $('fetchBtn').addEventListener('click', fetchDetail);
  $('tokenInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      fetchDetail();
    }
  });
  $('accountForm').addEventListener('submit', saveAccount);

  $('badgePicker').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-badge]');
    if (btn) toggleBadge(btn.getAttribute('data-badge'));
  });
  $('addBadgeBtn').addEventListener('click', addCustomBadge);
  $('fCustomBadge').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomBadge();
    }
  });
  $('fCustomBadge').addEventListener('input', function () {
    markField('fCustomBadge', false);
    if ($('saveStatus').classList.contains('err')) setSaveStatus('');
  });

  $('soldForm').addEventListener('submit', submitSold);
  $('soldCancel').addEventListener('click', closeSoldModal);
  $('soldClose').addEventListener('click', closeSoldModal);
  $('soldModal').addEventListener('click', function (e) {
    if (e.target === this) closeSoldModal();
  });
  ['soldPrice', 'soldBuyer', 'soldTelegram'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      markField(id, false);
      if ($('soldStatus').classList.contains('err')) {
        $('soldStatus').textContent = '';
        $('soldStatus').className = 'fetch-status';
      }
    });
  });

  FORM_INPUTS.forEach(function (id) {
    $(id).addEventListener('input', function () {
      markField(id, false);
      if ($('saveStatus').classList.contains('err')) setSaveStatus('');
    });
  });

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
    if (act === 'sold') openSold(id);
    else if (act === 'del') deleteAccount(id);
  });

  $('addModal').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (!$('addModal').classList.contains('hidden')) closeModal();
      if (!$('soldModal').classList.contains('hidden')) closeSoldModal();
    }
  });
}

function init() {
  bindUI();
  // Live date/time in the dashboard header. Mounted here because the header
  // only exists once the dash markup is present, and the module keeps a
  // single timer regardless of how often mount() is called.
  if (window.LiveClock && typeof window.LiveClock.mount === 'function') {
    window.LiveClock.mount('.live-clock');
  }
  api('summary?op=check').then(function (r) {
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