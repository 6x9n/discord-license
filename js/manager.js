window.CONFIG = {
  apiBase: 'https://discord-license-server-mythic5.vercel.app',
  trialDuration: 10 * 60 * 1000,
  offlineGraceMs: 24 * 60 * 60 * 1000,
  storage: {
    license: 'dmt.license.cache',
    trialStarted: 'dmt.trial.started',
    trialUsed: 'dmt.trial.used'
  },
  nav: {
    tabKey: 'dmt.activeTab',
    themeKey: 'dmt.theme',
    sidebarKey: 'dmt.sidebarCollapsed'
  },
  prefs: {
    key: 'dmt.prefs',
    startedAt: 'dmt.startedAt'
  },
  dsc: {
    token: 'dmt.dsc.token',
    user: 'dmt.dsc.user',
    accounts: 'dmt.dsc.accounts',
    history: 'dmt.dsc.history',
    whitelists: 'dmt.dsc.whitelists',
    speed: 'dmt.dsc.speed',
    accent: 'dmt.dsc.accent',
    electron: 'dmt.dsc.electron'
  }
};

window.manager = {
  getLicenseCache() {
    try {
      const raw = localStorage.getItem(window.CONFIG.storage.license);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  setLicenseCache(data) {
    localStorage.setItem(window.CONFIG.storage.license, JSON.stringify(data));
  },

  clearLicenseCache() {
    localStorage.removeItem(window.CONFIG.storage.license);
  },

  offlineGraceRemaining() {
    const cache = this.getLicenseCache();
    if (!cache || typeof cache.expiresAt !== 'number') {
      return 0;
    }
    return Math.max(0, cache.expiresAt + window.CONFIG.offlineGraceMs - Date.now());
  },

  ensureLicenseActive() {
    const cache = this.getLicenseCache();
    if (cache && typeof cache.expiresAt === 'number' && cache.expiresAt > Date.now()) {
      return true;
    }
    const started = this.trialStarted();
    return started > 0 && Date.now() - started < window.CONFIG.trialDuration;
  },

  trialStarted() {
    const raw = localStorage.getItem(window.CONFIG.storage.trialStarted);
    return raw ? Number(raw) : 0;
  },

  trialRemaining() {
    const started = this.trialStarted();
    if (!started) {
      return 0;
    }
    return Math.max(0, started + window.CONFIG.trialDuration - Date.now());
  },

  trialUsed() {
    return localStorage.getItem(window.CONFIG.storage.trialUsed) === '1';
  }
};

/* ============================================================
   Discord Account Manager
   ============================================================ */

(function () {
  const CONFIG = window.CONFIG;

  function byId(id) {
    return document.getElementById(id);
  }

  function storageGet(store, key) {
    try {
      return store.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function storageSet(store, key, value) {
    try {
      store.setItem(key, value);
    } catch (e) {}
  }

  function jsonGet(store, key) {
    const raw = storageGet(store, key);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function jsonSet(store, key, value) {
    storageSet(store, key, JSON.stringify(value));
  }

  function toast(message, kind) {
    if (window.appToast) {
      window.appToast(message, kind || 'info');
    }
  }

  /* ---------- View navigation ---------- */

  const VIEWS = {
    login: { panel: 'loginSection', title: 'Login' },
    dashboard: { panel: 'dashboardView', title: 'Dashboard', tab: 'dashboard' },
    badges: { panel: 'badgeSelectionView', title: 'Manage Badges' },
    details: { panel: 'accountDetailsView', title: 'Account Details' },
    evolution: { panel: 'badgeEvolutionView', title: 'Badge Evolution' },
    operation: { panel: 'operationView', title: 'Operation', tab: 'manager' },
    settings: { panel: 'settingsView', title: 'Settings', tab: 'settings' }
  };

  const pageTitle = byId('pageTitle');
  const mainCanvas = byId('mainCanvas');

  function showView(name, opts) {
    const meta = Object.prototype.hasOwnProperty.call(VIEWS, name) ? VIEWS[name] : VIEWS.dashboard;
    const panels = document.querySelectorAll('.view-panel');
    panels.forEach(function (panel) {
      panel.classList.toggle('active', panel.id === meta.panel);
    });

    const navLinks = document.querySelectorAll('.nav-link[data-tab]');
    navLinks.forEach(function (link) {
      const active = meta.tab && link.getAttribute('data-tab') === meta.tab;
      link.classList.toggle('active', !!active);
      if (active) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    if (pageTitle) {
      pageTitle.textContent = meta.title;
    }
    if (mainCanvas) {
      mainCanvas.scrollTop = 0;
    }
    if (opts && opts.persist && meta.tab) {
      storageSet(sessionStorage, CONFIG.nav.tabKey, meta.tab);
    }
  }

  window.appNav = { showView: showView, setActiveTab: function (name) { showView(name, { persist: true }); } };

  /* ---------- Shell & prefs (phase 2 / 3) ---------- */

  function storageGet2(store, key, fallback) {
    const raw = storageGet(store, key);
    return raw === null || raw === undefined ? fallback : raw;
  }

  const root = byId('appScreen');
  const themeToggle = byId('themeToggle');

  document.addEventListener('click', function (e) {
    if (!(e.target && e.target.closest)) {
      return;
    }
    const tabLink = e.target.closest('.nav-link[data-tab]');
    if (tabLink) {
      e.preventDefault();
      window.appNav.setActiveTab(tabLink.getAttribute('data-tab'));
      document.body.classList.remove('drawer-open');
    }
  });

  const menuToggle = byId('menuToggle');
  const drawerBackdrop = byId('drawerBackdrop');
  if (menuToggle) {
    menuToggle.addEventListener('click', function () {
      document.body.classList.add('drawer-open');
    });
  }
  if (drawerBackdrop) {
    drawerBackdrop.addEventListener('click', function () {
      document.body.classList.remove('drawer-open');
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.classList.contains('drawer-open')) {
      document.body.classList.remove('drawer-open');
    }
  });

  const sidebarToggle = byId('sidebarToggle');
  if (sidebarToggle && root) {
    sidebarToggle.addEventListener('click', function () {
      const collapsed = root.classList.toggle('sidebar-collapsed');
      storageSet(localStorage, CONFIG.nav.sidebarKey, collapsed ? '1' : '0');
    });
  }
  if (root && storageGet2(localStorage, CONFIG.nav.sidebarKey, '') === '1') {
    root.classList.add('sidebar-collapsed');
  }

  function applyTheme() {
    if (storageGet2(localStorage, CONFIG.nav.themeKey, '') === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      const htmlEl = document.documentElement;
      const next = htmlEl.getAttribute('data-theme') === 'light' ? '' : 'light';
      if (next) {
        htmlEl.setAttribute('data-theme', 'light');
      } else {
        htmlEl.removeAttribute('data-theme');
      }
      storageSet(localStorage, CONFIG.nav.themeKey, next);
    });
  }

  applyTheme();

  /* ---------- Discord API ---------- */

  const DISCORD_API = 'https://discord.com/api/v9';
  const state = {
    user: jsonGet(localStorage, CONFIG.dsc.user),
    token: storageGet(localStorage, CONFIG.dsc.token) || '',
    guilds: [],
    rel: [],
    running: false,
    stopped: false,
    selectedHouse: null
  };

  function apiCall(method, path, body) {
    const headers = { 'Authorization': state.token };
    let payload;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    return fetch(DISCORD_API + path, { method: method, headers: headers, body: payload })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        }).catch(function () {
          return { status: res.status, data: null };
        });
      });
  }

  function hasAccount() {
    return !!state.token && !!state.user;
  }

  function setActiveAccount(token, user) {
    state.token = normalizeToken(token);
    state.user = user;
    state.profileData = (user && typeof user === 'object') ? user : {};
    storageSet(localStorage, CONFIG.dsc.token, state.token);
    jsonSet(localStorage, CONFIG.dsc.user, user);
    applyBadge();
  }

  function clearActiveAccount() {
    state.token = '';
    state.user = null;
    storageSet(localStorage, CONFIG.dsc.token, '');
    localStorage.removeItem(CONFIG.dsc.user);
    applyBadge();
  }

  function applyBadge() {
    const badge = byId('sessionPlan');
    if (badge) {
      badge.textContent = state.user ? state.user.username : 'Not Logged In';
    }
  }

  function avatarUrl(user, size) {
    if (!user || !user.avatar) {
      return '';
    }
    const ext = user.avatar.indexOf('a_') === 0 ? 'gif' : 'png';
    return 'https://cdn.discordapp.com/avatars/' + user.id + '/' + user.avatar + '.' + ext + '?size=' + (size || 128);
  }

  function snowflakeDate(id) {
    if (!id) {
      return '';
    }
    const ms = (parseInt(id, 10) / 4194304) + 1420070400000;
    return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function flagNames(flags) {
    if (!flags) {
      return 'None';
    }
    const bits = [
      [0, 'Staff'],
      [1, 'Partner'],
      [2, 'HypeSquad Events'],
      [3, 'Bug Hunter L1'],
      [6, 'HypeSquad Bravery'],
      [7, 'HypeSquad Brilliance'],
      [8, 'HypeSquad Balance'],
      [9, 'Early Supporter'],
      [14, 'Bug Hunter L2'],
      [16, 'Verified Bot Dev'],
      [17, 'Certified Moderator'],
      [18, 'HTTP Interactions'],
      [22, 'Active Developer']
    ];
    const names = [];
    bits.forEach(function (bit) {
      if (flags & (1 << bit[0])) {
        names.push(bit[1]);
      }
    });
    return names.length ? names.join(', ') : 'None';
  }

  function nitroTier(validHostType) {
    const map = ['None', 'Nitro Classic', 'Nitro', 'Nitro Basic'];
    return map[validHostType] || 'None';
  }

  /* ---------- Badge dictionaries ---------- */

  const NITRO_TIERS = [
    { months: 1, name: 'Bronze', image: 'assets/images/badges/nitro_badges/bronze.png' },
    { months: 3, name: 'Silver', image: 'assets/images/badges/nitro_badges/silver.png' },
    { months: 6, name: 'Gold', image: 'assets/images/badges/nitro_badges/gold.png' },
    { months: 12, name: 'Platinum', image: 'assets/images/badges/nitro_badges/platinum.png' },
    { months: 24, name: 'Diamond', image: 'assets/images/badges/nitro_badges/diamond.png' },
    { months: 36, name: 'Emerald', image: 'assets/images/badges/nitro_badges/emerald.png' },
    { months: 60, name: 'Ruby', image: 'assets/images/badges/nitro_badges/ruby.png' },
    { months: 72, name: 'Opal', image: 'assets/images/badges/nitro_badges/opal.png' }
  ];

  const BOOST_LEVELS = [
    { level: 1, months: 1, image: 'assets/images/badges/boost_badges/discordboost1.svg' },
    { level: 2, months: 2, image: 'assets/images/badges/boost_badges/discordboost2.svg' },
    { level: 3, months: 3, image: 'assets/images/badges/boost_badges/discordboost3.svg' },
    { level: 4, months: 6, image: 'assets/images/badges/boost_badges/discordboost4.svg' },
    { level: 5, months: 9, image: 'assets/images/badges/boost_badges/discordboost5.svg' },
    { level: 6, months: 12, image: 'assets/images/badges/boost_badges/discordboost6.svg' },
    { level: 7, months: 15, image: 'assets/images/badges/boost_badges/discordboost7.svg' },
    { level: 8, months: 18, image: 'assets/images/badges/boost_badges/discordboost8.svg' },
    { level: 9, months: 24, image: 'assets/images/badges/boost_badges/discordboost9.svg' }
  ];

  const GIFT_LEVELS = [
    { level: 1, gifts: 1, name: 'Patron', image: 'assets/images/badges/gift_badges/giftlvl1.png' },
    { level: 2, gifts: 2, name: 'Champion', image: 'assets/images/badges/gift_badges/giftlvl2.png' },
    { level: 3, gifts: 3, name: 'Luminary', image: 'assets/images/badges/gift_badges/giftlvl3.png' },
    { level: 4, gifts: 6, name: 'Icon', image: 'assets/images/badges/gift_badges/giftlvl4.png' },
    { level: 5, gifts: 10, name: 'Hero', image: 'assets/images/badges/gift_badges/giftlvl5.png' },
    { level: 6, gifts: 20, name: 'Legend', image: 'assets/images/badges/gift_badges/giftlvl6.png' }
  ];

  const FLAG_BADGES = [
    { bit: 1 << 0, key: 'staff', path: 'assets/images/badges/discordstaff.svg', title: 'Discord Staff' },
    { bit: 1 << 1, key: 'partner', path: 'assets/images/badges/discordpartner.svg', title: 'Partnered Server Owner' },
    { bit: 1 << 2, key: 'hypesquadevents', path: 'assets/images/badges/hypesquadevents.svg', title: 'HypeSquad Events' },
    { bit: 1 << 3, key: 'bughunter1', path: 'assets/images/badges/discordbughunter1.svg', title: 'Bug Hunter (Tier 1)' },
    { bit: 1 << 6, key: 'bravery', path: 'assets/images/badges/hypesquadbravery.svg', title: 'HypeSquad Bravery' },
    { bit: 1 << 7, key: 'brilliance', path: 'assets/images/badges/hypesquadbrilliance.svg', title: 'HypeSquad Brilliance' },
    { bit: 1 << 8, key: 'balance', path: 'assets/images/badges/hypesquadbalance.svg', title: 'HypeSquad Balance' },
    { bit: 1 << 9, key: 'earlysupporter', path: 'assets/images/badges/discordearlysupporter.svg', title: 'Early Supporter' },
    { bit: 1 << 14, key: 'bughunter2', path: 'assets/images/badges/discordbughunter2.svg', title: 'Bug Hunter (Tier 2)' },
    { bit: 1 << 17, key: 'botdev', path: 'assets/images/badges/discordbotdev.svg', title: 'Early Verified Bot Developer' },
    { bit: 1 << 18, key: 'moderator', path: 'assets/images/badges/discordmod.svg', title: 'Moderator Programs Alumni' },
    { bit: 1 << 22, key: 'activedeveloper', path: 'assets/images/badges/activedeveloper.svg', title: 'Active Developer' }
  ];

  const PROFILE_BADGE_MAP = {
    'staff': { key: 'staff', path: 'assets/images/badges/discordstaff.svg', title: 'Discord Staff' },
    'partner': { key: 'partner', path: 'assets/images/badges/discordpartner.svg', title: 'Partnered Server Owner' },
    'hypesquad': { key: 'hypesquadevents', path: 'assets/images/badges/hypesquadevents.svg', title: 'HypeSquad Events' },
    'hypesquad_house_1': { key: 'bravery', path: 'assets/images/badges/hypesquadbravery.svg', title: 'HypeSquad Bravery' },
    'hypesquad_bravery': { key: 'bravery', path: 'assets/images/badges/hypesquadbravery.svg', title: 'HypeSquad Bravery' },
    'hypesquad_house_2': { key: 'brilliance', path: 'assets/images/badges/hypesquadbrilliance.svg', title: 'HypeSquad Brilliance' },
    'hypesquad_brilliance': { key: 'brilliance', path: 'assets/images/badges/hypesquadbrilliance.svg', title: 'HypeSquad Brilliance' },
    'hypesquad_house_3': { key: 'balance', path: 'assets/images/badges/hypesquadbalance.svg', title: 'HypeSquad Balance' },
    'hypesquad_balance': { key: 'balance', path: 'assets/images/badges/hypesquadbalance.svg', title: 'HypeSquad Balance' },
    'bug_hunter_level_1': { key: 'bughunter1', path: 'assets/images/badges/discordbughunter1.svg', title: 'Bug Hunter (Tier 1)' },
    'bug_hunter_level_2': { key: 'bughunter2', path: 'assets/images/badges/discordbughunter2.svg', title: 'Bug Hunter (Tier 2)' },
    'verified_developer': { key: 'botdev', path: 'assets/images/badges/discordbotdev.svg', title: 'Early Verified Bot Developer' },
    'active_developer': { key: 'activedeveloper', path: 'assets/images/badges/activedeveloper.svg', title: 'Active Developer' },
    'early_supporter': { key: 'earlysupporter', path: 'assets/images/badges/discordearlysupporter.svg', title: 'Early Supporter' },
    'certified_moderator': { key: 'moderator', path: 'assets/images/badges/discordmod.svg', title: 'Moderator Programs Alumni' },
    'moderator_programs_alumni': { key: 'moderator', path: 'assets/images/badges/discordmod.svg', title: 'Moderator Programs Alumni' }
  };

  function monthsSince(iso) {
    if (!iso) {
      return 0;
    }
    const then = new Date(iso).getTime();
    if (isNaN(then)) {
      return 0;
    }
    return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24 * 30.44));
  }

  function getUserBadges(userData, profileData) {
    const user = userData || {};
    const profile = profileData || {};
    const out = [];
    const seen = {};

    function add(entry) {
      if (!entry) {
        return;
      }
      const dedupe = entry.key || entry.title || entry.path;
      if (seen[dedupe]) {
        return;
      }
      seen[dedupe] = true;
      out.push(entry);
    }

    const flags = user.flags || user.public_flags || 0;
    FLAG_BADGES.forEach(function (fb) {
      if (flags & fb.bit) {
        add(fb);
      }
    });

    const pBadges = (Array.isArray(profile.badges) ? profile.badges : (user.badges || []));
    pBadges.forEach(function (id) {
      const mapped = PROFILE_BADGE_MAP[id] || PROFILE_BADGE_MAP[String(id)];
      if (mapped) {
        add(mapped);
      }
    });

    const nitroMonths = monthsSince(user.premium_since || profile.premium_since);
    if (nitroMonths >= 1 && (user.premium_type || 0) !== 0) {
      let tier = null;
      NITRO_TIERS.forEach(function (t) {
        if (nitroMonths >= t.months) {
          tier = t;
        }
      });
      if (tier) {
        add({ key: 'nitro_' + tier.name.toLowerCase(), path: tier.image, title: 'Nitro ' + tier.name });
      }
    }

    const boostMonths = monthsSince(user.premium_guild_since || profile.premium_guild_since);
    if (boostMonths >= 1) {
      let boost = null;
      BOOST_LEVELS.forEach(function (b) {
        if (boostMonths >= b.months) {
          boost = b;
        }
      });
      if (boost) {
        add({ key: 'boost_' + boost.level, path: boost.image, title: 'Server Boost Level ' + boost.level });
      }
    }

    const gifts = user.gifts || profile.gifts || 0;
    if (gifts >= 1) {
      let gift = null;
      GIFT_LEVELS.forEach(function (g) {
        if (gifts >= g.gifts) {
          gift = g;
        }
      });
      if (gift) {
        add({ key: 'gift_' + gift.level, path: gift.image, title: 'Gift Badge \u2014 ' + gift.name });
      }
    }

    return out;
  }

  function renderProfileBadges() {
    const host = byId('profileBadges');
    if (!host) {
      return;
    }
    const badges = getUserBadges(state.user, state.profileData || {});
    host.innerHTML = '';
    badges.forEach(function (b) {
      const img = document.createElement('img');
      img.className = 'profile-badge-img';
      img.src = b.path;
      img.alt = b.title;
      img.title = b.title;
      img.loading = 'lazy';
      host.appendChild(img);
    });
  }

  /* ---------- Accounts list ---------- */

  function loadAccounts() {
    return jsonGet(localStorage, CONFIG.dsc.accounts) || [];
  }

  function saveAccounts(list) {
    jsonSet(localStorage, CONFIG.dsc.accounts, list);
    renderSavedAccounts();
  }

  function renderSavedAccounts() {
    const list = byId('savedAccountsList');
    const count = byId('savedCount');
    const accounts = loadAccounts();
    if (count) {
      count.textContent = accounts.length + (accounts.length === 1 ? ' account' : ' accounts');
    }
    if (!list) {
      return;
    }
    list.innerHTML = '';
    if (!accounts.length) {
      const empty = document.createElement('li');
      empty.className = 'log-empty';
      empty.textContent = 'No saved accounts yet.';
      list.appendChild(empty);
      return;
    }
    accounts.forEach(function (acc) {
      const li = document.createElement('li');
      li.className = 'saved-item';

      const avatar = document.createElement('span');
      avatar.className = 'saved-avatar';
      const url = avatarUrl(acc.user, 64);
      if (url) {
        avatar.style.backgroundImage = 'url("' + url + '")';
      } else {
        avatar.textContent = (acc.user.username || '?').slice(0, 1).toUpperCase();
      }

      const name = document.createElement('span');
      name.className = 'saved-name';
      name.textContent = acc.user.username + (acc.user.discriminator && acc.user.discriminator !== '0' ? '#' + acc.user.discriminator : '');

      const actions = document.createElement('span');
      actions.className = 'saved-actions';

      const useBtn = document.createElement('button');
      useBtn.type = 'button';
      useBtn.className = 'btn btn-primary btn-small';
      useBtn.textContent = 'Use';
      useBtn.setAttribute('data-use', acc.user.id);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-ghost btn-small';
      delBtn.textContent = 'Delete';
      delBtn.setAttribute('data-del', acc.user.id);

      actions.appendChild(useBtn);
      actions.appendChild(delBtn);

      li.appendChild(avatar);
      li.appendChild(name);
      li.appendChild(actions);
      list.appendChild(li);
    });
  }

  /* ---------- Auth ---------- */

  function handleAuthError(res) {
    if (res && typeof res.message === 'string') {
      if (res.message.toLowerCase().indexOf('unauthorized') !== -1 || res.message.toLowerCase().indexOf('401') !== -1) {
        return 'Invalid token. Check it and try again.';
      }
      return res.message;
    }
    return 'Authentication failed.';
  }

  function normalizeToken(raw) {
    return String(raw || '')
      .trim()
      .replace(/^["']+|["']+$/g, '')
      .replace(/[\u200B\u200C\u200D\uFEFF\u00A0\u2060]+/g, '');
  }

  function validateToken(rawToken) {
    const token = normalizeToken(rawToken);
    const headers = {
      'Authorization': token,
      'Content-Type': 'application/json'
    };
    return fetch(DISCORD_API + '/users/@me', { method: 'GET', headers: headers })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        }).catch(function () {
          return { status: res.status, data: null };
        });
      })
      .catch(function (err) {
        const descriptive = !!(err && err.message);
        throw new Error(
          descriptive
            ? 'Discord API unreachable from this browser (CORS). Run the Desktop/Electron client or route through a proxy server.'
            : 'Could not reach Discord\u2019s API. Check your network and try again.'
        );
      });
  }

  function loginWithToken(token) {
    return validateToken(token).then(function (res) {
      if (!res.data || !res.data.id) {
        throw new Error(handleAuthError(res.data || {}));
      }
      return res.data;
    });
  }

  function upsertAccount(token, user) {
    const accounts = loadAccounts();
    const existing = accounts.filter(function (acc) {
      return acc.user.id !== user.id;
    });
    existing.unshift({ token: token, user: user, savedAt: Date.now() });
    saveAccounts(existing.slice(0, 20));
  }

  function renderProfile(user) {
    const avatarEl = byId('profileAvatar');
    if (avatarEl) {
      const url = avatarUrl(user, 128);
      if (url) {
        avatarEl.style.backgroundImage = 'url("' + url + '")';
      }
    }
    const usernameEl = byId('profileUsername');
    const discrimEl = byId('profileDiscrim');
    const tagEl = byId('profileTag');
    if (usernameEl) {
      usernameEl.textContent = user.username || 'Unknown';
    }
    if (discrimEl) {
      discrimEl.textContent = user.discriminator && user.discriminator !== '0' ? '#' + user.discriminator : '';
    }
    if (tagEl) {
      tagEl.textContent = 'ID ' + user.id + ' \u00b7 ' + nitroTier(user.premium_type);
    }
    renderProfileBadges();
  }

  function refreshMetrics() {
    const ownedEl = byId('metricOwned');
    const joinedEl = byId('metricJoined');
    const friendsEl = byId('metricFriends');
    const dmsEl = byId('metricDMs');

    function done(owned, joined, friends, dms) {
      if (ownedEl) {
        ownedEl.textContent = owned;
      }
      if (joinedEl) {
        joinedEl.textContent = joined;
      }
      if (friendsEl) {
        friendsEl.textContent = friends;
      }
      if (dmsEl) {
        dmsEl.textContent = dms;
      }
    }

    if (!hasAccount()) {
      done('-', '-', '-', '-');
      return;
    }

    Promise.all([
      apiCall('GET', '/users/@me/guilds'),
      apiCall('GET', '/users/@me/relationships')
    ]).then(function (results) {
      const guilds = Array.isArray(results[0].data) ? results[0].data : [];
      const rel = Array.isArray(results[1].data) ? results[1].data : [];

      state.guilds = guilds;
      state.rel = rel;

      const owned = guilds.filter(function (g) {
        return !!g.owner;
      }).length;
      const joined = guilds.length;
      const friends = rel.filter(function (r) {
        return r.type === 1;
      }).length;

      done(owned, joined, friends, friends);
    }).catch(function () {
      done('-', '-', '-', '-');
    });
  }

  function applyAccountState() {
    if (!hasAccount()) {
      return;
    }
    renderProfile(state.user);
    renderDetailsView();
    renderEvolutionView();
    refreshMetrics();
  }

  /* ---------- Details view ---------- */

  function badgeTitles() {
    const badges = getUserBadges(state.user, state.profileData || {});
    return badges.length ? (badges.map(function (b) {
      return b.title;
    }).join(', ')) : 'None';
  }

  function renderDetailsView() {
    const grid = byId('detailsGrid');
    if (!grid) {
      return;
    }
    const u = state.user || {};
    const rows = [
      ['Account ID', u.id || '-'],
      ['Email', u.email || '-'],
      ['Phone', u.phone || 'Not linked'],
      ['2FA Enabled', u.mfa_enabled ? 'Yes' : 'No'],
      ['Verified', u.verified ? 'Yes' : 'No'],
      ['Creation Date', snowflakeDate(u.id) || '-'],
      ['Nitro Tier', nitroTier(u.premium_type)],
      ['Orbs Balance', '-'],
      ['Avatar Decorations', '-'],
      ['Profile Effects', '-'],
      ['Name Plates', '-'],
      ['Profile Frames', '-'],
      ['Profile Badges', badgeTitles()]
    ];
    grid.innerHTML = '';
    rows.forEach(function (row) {
      const div = document.createElement('div');
      div.className = 'details-row';
      const label = document.createElement('span');
      label.className = 'details-label';
      label.textContent = row[0];
      const value = document.createElement('span');
      value.className = 'details-value';
      value.textContent = row[1];
      div.appendChild(label);
      div.appendChild(value);
      grid.appendChild(div);
    });
  }

  /* ---------- Badge evolution ---------- */

  function renderEvolutionView() {
    const wrap = byId('evolutionCards');
    if (!wrap) {
      return;
    }
    const u = state.user || {};
    const tierIndex = Math.max(0, Math.min(3, u.premium_type || 0));

    const categories = [
      {
        key: 'nitro',
        title: 'Nitro Badge',
        sub: 'Subscription tier progression',
        tiers: ['No Nitro', 'Nitro Basic', 'Nitro Classic', 'Nitro'],
        current: tierIndex,
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8"/><path d="M12 8c-3 0-4-1.5-3.5-3S12 4 12 4s3-1 3.5 1-.5 3-3.5 3z"/></svg>'
      },
      {
        key: 'boost',
        title: 'Server Boost',
        sub: 'Server boosting progression',
        tiers: ['No Boosts', '1 Boost', '2 Boosts', '3+ Boosts'],
        current: 0,
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'
      }
    ];

    wrap.innerHTML = '';
    categories.forEach(function (cat) {
      const dayLeft = 30 - new Date().getDate();
      const pct = Math.max(4, Math.min(97, Math.round(((30 - dayLeft) / 30) * 100)));
      const card = document.createElement('div');
      card.className = 'evolution-card panel';

      const header = document.createElement('div');
      header.className = 'evo-header';
      const icon = document.createElement('div');
      icon.className = 'evo-icon';
      icon.innerHTML = cat.icon;
      const headTxt = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'evo-title';
      title.textContent = cat.title;
      const sub = document.createElement('div');
      sub.className = 'evo-sub';
      sub.textContent = cat.sub;
      headTxt.appendChild(title);
      headTxt.appendChild(sub);
      header.appendChild(icon);
      header.appendChild(headTxt);
      card.appendChild(header);

      const avatar = document.createElement('div');
      avatar.className = 'evo-avatar';
      avatar.innerHTML = cat.icon;
      card.appendChild(avatar);

      const tierName = document.createElement('div');
      tierName.className = 'evo-tier';
      tierName.textContent = cat.tiers[cat.current] || cat.tiers[0];
      card.appendChild(tierName);

      const timeline = document.createElement('div');
      timeline.className = 'evo-timeline';
      cat.tiers.forEach(function (t, i) {
        const step = document.createElement('div');
        step.className = 'evo-step' + (i <= cat.current ? ' done' : '');
        step.innerHTML = '<span class="evo-step-mark">' + (i <= cat.current ? '\u2713' : '\u00b7') + '</span><span>' + t + '</span>';
        if (i === cat.current) {
          step.innerHTML = '<span class="evo-step-mark">' + (i <= cat.current ? '\u2713' : '\u00b7') + '</span><span><strong>' + t + '</strong> (active)</span>';
        }
        timeline.appendChild(step);
      });
      card.appendChild(timeline);

      const barLabel = document.createElement('div');
      barLabel.className = 'evo-bar-label';
      barLabel.innerHTML = '<span>' + pct + '% complete</span><span>' + dayLeft + 'd until refresh</span>';
      card.appendChild(barLabel);

      const track = document.createElement('div');
      track.className = 'progress-track';
      const fill = document.createElement('div');
      fill.className = 'progress-bar-fill';
      fill.style.width = pct + '%';
      track.appendChild(fill);
      card.appendChild(track);

      const remaining = document.createElement('div');
      remaining.className = 'evo-remaining';
      remaining.textContent = cat.current >= 3 ? 'Maximum tier reached.' : 'Estimated ~' + dayLeft + ' days remaining at current rate.';
      card.appendChild(remaining);

      wrap.appendChild(card);
    });
  }

  /* ---------- Operation terminal ---------- */

  const SPEED_MS = {
    fast: 750,
    normal: 1500,
    safe: 2600,
    ultra: 4200
  };

  const terminalLog = byId('terminalLog');
  const terminalTitle = byId('operationTitle');
  const opPill = byId('opStatPill');
  const progressFill = byId('progressBarFill');
  const opProgressText = byId('opProgressText');

  function emitLine(text) {
    if (!terminalLog) {
      return;
    }
    const now = new Date();
    const pad = function (n) {
      return String(n).padStart(2, '0');
    };
    const li = document.createElement('li');
    li.className = 'term-line';
    li.innerHTML = '<span class="term-time">' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds()) + '</span><span class="term-text"></span>';
    li.querySelector('.term-text').textContent = text;
    terminalLog.appendChild(li);
    terminalLog.scrollTop = terminalLog.scrollHeight;
  }

  function updateProgress(cur, total) {
    const pct = total ? Math.round((cur / total) * 100) : 0;
    if (opPill) {
      opPill.textContent = cur + ' / ' + total + ' \u2022 ' + pct + '%';
    }
    if (progressFill) {
      progressFill.style.width = pct + '%';
    }
    if (opProgressText) {
      opProgressText.textContent = cur + ' / ' + total;
    }
  }

  function resetTerminal(title) {
    if (terminalTitle) {
      terminalTitle.textContent = title;
    }
    if (terminalLog) {
      terminalLog.innerHTML = '';
    }
    if (opPill) {
      opPill.textContent = 'idle';
    }
    if (progressFill) {
      progressFill.style.width = '0%';
    }
    if (opProgressText) {
      opProgressText.textContent = '0 / 0';
    }
  }

  function openHistory() {
    openModal();
    const list = byId('historyList');
    const count = byId('historyCount');
    const history = jsonGet(localStorage, CONFIG.dsc.history) || [];
    if (count) {
      count.textContent = history.length + (history.length === 1 ? ' record' : ' records');
    }
    if (!list) {
      return;
    }
    list.innerHTML = '';
    if (!history.length) {
      const empty = document.createElement('li');
      empty.className = 'modal-item';
      empty.textContent = 'No operations have run yet.';
      list.appendChild(empty);
      return;
    }
    history.forEach(function (entry) {
      const li = document.createElement('li');
      li.className = 'modal-item';
      const when = new Date(entry.at).toLocaleString();
      li.innerHTML = '<span class="modal-item-main"><strong></strong><span class="modal-item-sub"></span></span>';
      li.querySelector('strong').textContent = entry.title;
      li.querySelector('.modal-item-sub').textContent = when + ' \u00b7 ' + entry.items + ' item' + (entry.items === 1 ? '' : 's');
      list.appendChild(li);
    });
  }

  function pushHistory(title, items) {
    const history = jsonGet(localStorage, CONFIG.dsc.history) || [];
    history.unshift({ title: title, items: items, at: Date.now() });
    jsonSet(localStorage, CONFIG.dsc.history, history.slice(0, 50));
  }

  function currentDelay() {
    const speed = storageGet2(localStorage, CONFIG.dsc.speed, 'normal');
    return SPEED_MS[speed] || SPEED_MS.normal;
  }

  function loadWhitelists() {
    return jsonGet(localStorage, CONFIG.dsc.whitelists) || { servers: [], friends: [], dms: [] };
  }

  function inWl(kind, value) {
    if (!value) {
      return false;
    }
    const wl = loadWhitelists();
    const list = wl[kind] || [];
    const needle = String(value).trim().toLowerCase();
    return list.some(function (entry) {
      return String(entry || '').trim().toLowerCase() === needle;
    });
  }

  function friendName(r) {
    return r && r.user && (r.user.username || 'user') + ' (' + r.id + ')';
  }

  function buildLeaveItems() {
    const items = [];
    (state.guilds || []).forEach(function (g) {
      if (!g.owner && !inWl('servers', g.id)) {
        items.push({
          label: 'Leave server: ' + (g.name || g.id) + ' (' + g.id + ')',
          action: function () {
            return apiCall('DELETE', '/users/@me/guilds/' + g.id);
          }
        });
      }
    });
    return items;
  }

  function buildFriendItems() {
    const items = [];
    (state.rel || []).forEach(function (r) {
      if (r.type === 1 && !inWl('friends', r.id) && !inWl('friends', r.user && r.user.username)) {
        items.push({
          label: 'Remove friend: ' + friendName(r),
          action: function () {
            return apiCall('DELETE', '/users/@me/relationships/' + r.id);
          }
        });
      }
    });
    return items;
  }

  function buildDmItems() {
    const items = [];
    (state.rel || []).forEach(function (r) {
      if (r.type === 1 && !inWl('dms', r.id) && !inWl('dms', r.user && r.user.username)) {
        items.push({
          label: 'Close DM: ' + friendName(r),
          skip: 'no REST endpoint \u2014 logged only'
        });
      }
    });
    return items;
  }

  function buildDeleteDmItems(targetId) {
    if (!targetId) {
      return [];
    }
    return [{
      label: 'Purge DM messages with user ' + targetId,
      skip: 'requires client protocol \u2014 logged only'
    }];
  }

  function runOperation(title, items) {
    if (state.running) {
      toast('An operation is already running.', 'error');
      return;
    }
    if (!items.length) {
      toast('No target items found. Check whitelists and refresh metrics.', 'error');
      return;
    }
    state.running = true;
    state.stopped = false;

    resetTerminal(title);
    emitLine('Starting: ' + title);
    emitLine('Delay between calls: ' + currentDelay() + 'ms');
    pushHistory(title, items.length);

    let index = 0;
    const step = function () {
      if (state.stopped || !state.running) {
        state.running = false;
        emitLine('Operation stopped by user.');
        if (opPill) {
          opPill.textContent = 'stopped';
        }
        toast('Operation stopped.', 'info');
        return;
      }
      index += 1;
      const item = items[index - 1];
      emitLine('[' + index + '/' + items.length + '] ' + item.label + (item.skip ? ' \u2014 ' + item.skip : ''));
      if (item.action) {
        item.action().catch(function () {});
      }
      updateProgress(index, items.length);
      if (index >= items.length) {
        state.running = false;
        emitLine('Operation completed (' + items.length + ' items).');
        if (opPill) {
          opPill.textContent = 'done';
        }
        toast('Operation completed.', 'success');
        return;
      }
      setTimeout(step, currentDelay());
    };
    step();
  }

  function stopRunning() {
    state.stopped = true;
    state.running = false;
  }

  /* ---------- Modal ---------- */

  function openModal() {
    const modal = byId('historyModal');
    if (modal) {
      modal.classList.add('active');
    }
  }

  function closeModal() {
    const modal = byId('historyModal');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  /* ---------- Badge view ---------- */

  function pickHouse(houseId) {
    state.selectedHouse = houseId;
    const cards = document.querySelectorAll('.badge-card');
    cards.forEach(function (card) {
      card.classList.toggle('selected', card.getAttribute('data-house') === String(houseId));
    });
  }

  function resultToast(res, okMsg) {
    if (res.status >= 200 && res.status < 300) {
      toast(okMsg, 'success');
    } else {
      toast(handleAuthError(res.data || {}), 'error');
    }
  }

  /* ---------- Settings ---------- */

  function applyAccent(name) {
    const htmlEl = document.documentElement;
    if (name) {
      htmlEl.setAttribute('data-accent', name);
    } else {
      htmlEl.removeAttribute('data-accent');
    }
    const dots = document.querySelectorAll('.accent-dot');
    dots.forEach(function (dot) {
      dot.classList.toggle('selected', dot.getAttribute('data-accent') === name);
    });
  }

  function applySpeed() {
    const sel = byId('setSpeed');
    if (sel) {
      sel.value = storageGet2(localStorage, CONFIG.dsc.speed, 'normal');
    }
  }

  function applyElectron() {
    const pref = jsonGet(localStorage, CONFIG.dsc.electron) || { autoStart: false, minTray: false };
    const auto = byId('setAutoStart');
    const tray = byId('setMinTray');
    if (auto) {
      auto.checked = !!pref.autoStart;
    }
    if (tray) {
      tray.checked = !!pref.minTray;
    }
  }

  function applySettings() {
    applyAccent(storageGet2(localStorage, CONFIG.dsc.accent, 'violet'));
    applySpeed();
    applyElectron();
  }

  function applyWhitelists() {
    const wl = loadWhitelists();
    const els = {
      servers: byId('wlServers'),
      friends: byId('wlFriends'),
      dms: byId('wlDms')
    };
    ['servers', 'friends', 'dms'].forEach(function (kind) {
      const el = els[kind];
      if (el) {
        el.value = (wl[kind] || []).join('\n');
      }
    });
  }

  /* ---------- Wires ---------- */

  function initAuth() {
    const tokenInput = byId('tokenInput');
    const authBtn = byId('authenticateBtn');
    const toggleTokenBtn = byId('toggleToken');
    const clearSavedBtn = byId('clearSavedBtn');
    const savedList = byId('savedAccountsList');

    if (authBtn) {
      authBtn.addEventListener('click', function () {
        const token = tokenInput ? normalizeToken(tokenInput.value) : '';
        if (!token) {
          toast('Paste an account token first.', 'error');
          return;
        }
        setBusy(authBtn, true);
        loginWithToken(token)
          .then(function (user) {
            setActiveAccount(token, user);
            upsertAccount(token, user);
            tokenInput.value = '';
            showView('dashboard');
            applyAccountState();
            toast('Logged in as ' + user.username + '.', 'success');
          })
          .catch(function (err) {
            toast(err.message || 'Login failed.', 'error');
          })
          .finally(function () {
            setBusy(authBtn, false);
          });
      });
    }

    if (toggleTokenBtn && tokenInput) {
      toggleTokenBtn.addEventListener('click', function () {
        const showing = tokenInput.type === 'text';
        tokenInput.type = showing ? 'password' : 'text';
        const eye = toggleTokenBtn.querySelector('.icon-eye');
        const eyeOff = toggleTokenBtn.querySelector('.icon-eye-off');
        if (eye) {
          eye.setAttribute('display', showing ? 'none' : '');
        }
        if (eyeOff) {
          eyeOff.setAttribute('display', showing ? '' : 'none');
        }
        tokenInput.focus();
      });
    }

    if (clearSavedBtn) {
      clearSavedBtn.addEventListener('click', function () {
        if (!window.confirm('Remove all saved accounts from this device?')) {
          return;
        }
        saveAccounts([]);
        toast('Saved accounts cleared.', 'success');
      });
    }

    if (savedList) {
      savedList.addEventListener('click', function (e) {
        if (!(e.target && e.target.closest)) {
          return;
        }
        const useBtn = e.target.closest('[data-use]');
        const delBtn = e.target.closest('[data-del]');
        const accounts = loadAccounts();
        if (useBtn) {
          const acc = accounts.filter(function (a) {
            return a.user.id === useBtn.getAttribute('data-use');
          })[0];
          if (acc) {
            setActiveAccount(acc.token, acc.user);
            showView('dashboard');
            applyAccountState();
            toast('Switched to ' + acc.user.username + '.', 'success');
          }
        }
        if (delBtn) {
          const id = delBtn.getAttribute('data-del');
          const next = accounts.filter(function (a) {
            return a.user.id !== id;
          });
          saveAccounts(next);
          toast('Removed saved account.', 'success');
        }
      });
    }
  }

  function initDashboard() {
    const confirmBtn = byId('confirmIconBtn');
    const logoutBtn = byId('logoutBtn');

    if (confirmBtn) {
      confirmBtn.addEventListener('click', function () {
        setBusy(confirmBtn, true);
        validateToken(state.token)
          .then(function (res) {
            if (res.data && res.data.id) {
              state.user = res.data;
              jsonSet(localStorage, CONFIG.dsc.user, res.data);
              renderProfile(state.user);
              toast('Session confirmed: ' + res.data.username + '.', 'success');
            } else {
              toast(handleAuthError(res.data || {}), 'error');
            }
          })
          .catch(function () {
            toast('Cannot reach Discord API.', 'error');
          })
          .finally(function () {
            setBusy(confirmBtn, false);
          });
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        stopRunning();
        clearActiveAccount();
        renderSavedAccounts();
        showView('login');
        toast('Logged out.', 'info');
      });
    }
  }

  function initOps() {
    const handlers = {
      leaveServersBtn: function () {
        runOperation('Leave Servers', buildLeaveItems());
      },
      removeFriendsBtn: function () {
        runOperation('Remove Friends', buildFriendItems());
      },
      closeDMsBtn: function () {
        runOperation('Close DMs', buildDmItems());
      },
      deleteUserDMsBtn: function () {
        const target = window.prompt('Delete DM messages with target user ID:', '');
        if (target === null) {
          return;
        }
        runOperation('Delete DM Messages', buildDeleteDmItems(target.trim()));
      },
      allInOneBtn: function () {
        const target = window.prompt('Delete DM messages with target user ID (leave blank to skip):', '');
        const parts = buildLeaveItems().concat(buildFriendItems()).concat(buildDmItems());
        if (target !== null && target.trim()) {
          parts.push.apply(parts, buildDeleteDmItems(target.trim()));
        }
        runOperation('All-in-One Cleanup', parts);
      },
      badgeActionBtn: function () {
        showView('badges');
      },
      accountDetailsBtn: function () {
        showView('details');
      },
      badgeEvolutionBtn: function () {
        showView('evolution');
      },
      operationHistoryBtn: function () {
        openHistory();
      }
    };
    Object.keys(handlers).forEach(function (id) {
      const btn = byId(id);
      if (btn) {
        btn.addEventListener('click', handlers[id]);
      }
    });
  }

  function initBadges() {
    const backBtn = byId('badgeSelectionBackBtn');
    const grid = byId('badgeGrid');
    const equipBtn = byId('equipBadgeBtn');
    const removeBtn = byId('removeBadgeBtn');
    const hideBtn = byId('hideAllBadgesBtn');

    if (backBtn) {
      backBtn.addEventListener('click', function () {
        showView('dashboard');
      });
    }
    if (grid) {
      grid.addEventListener('click', function (e) {
        const card = e.target && e.target.closest ? e.target.closest('.badge-card') : null;
        if (card) {
          pickHouse(card.getAttribute('data-house'));
        }
      });
    }
    if (equipBtn) {
      equipBtn.addEventListener('click', function () {
        if (!state.selectedHouse) {
          toast('Select a badge card first.', 'error');
          return;
        }
        if (Number(state.selectedHouse) === 4) {
          toast('Legacy is grandfathered and cannot be equipped directly.', 'info');
          return;
        }
        setBusy(equipBtn, true);
        apiCall('POST', '/hypesquad/online', { house_id: Number(state.selectedHouse) })
          .then(function (res) {
            resultToast(res, 'HypeSquad badge equipped.');
          })
          .catch(function () {
            toast('Cannot reach Discord API.', 'error');
          })
          .finally(function () {
            setBusy(equipBtn, false);
          });
      });
    }
    if (removeBtn) {
      removeBtn.addEventListener('click', function () {
        setBusy(removeBtn, true);
        apiCall('DELETE', '/hypesquad/online')
          .then(function (res) {
            resultToast(res, 'HypeSquad badge removed.');
          })
          .catch(function () {
            toast('Cannot reach Discord API.', 'error');
          })
          .finally(function () {
            setBusy(removeBtn, false);
          });
      });
    }
    if (hideBtn) {
      hideBtn.addEventListener('click', function () {
        setBusy(hideBtn, true);
        apiCall('PATCH', '/users/@me/settings', { profile_effective_badges: 0 })
          .then(function (res) {
            resultToast(res, 'Badges hidden.');
          })
          .catch(function () {
            toast('Cannot reach Discord API.', 'error');
          })
          .finally(function () {
            setBusy(hideBtn, false);
          });
      });
    }
  }

  function initSubviews() {
    const detailsBack = byId('accountDetailsBackBtn');
    if (detailsBack) {
      detailsBack.addEventListener('click', function () {
        showView('dashboard');
      });
    }
    const evoBack = byId('evolutionBackBtn');
    if (evoBack) {
      evoBack.addEventListener('click', function () {
        showView('dashboard');
      });
    }
    const copyId = byId('copyIdBtn');
    if (copyId) {
      copyId.addEventListener('click', function () {
        if (!state.user || !state.user.id) {
          toast('No account loaded.', 'error');
          return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(state.user.id)
            .then(function () {
              toast('Account ID copied.', 'success');
            })
            .catch(function () {
              toast('Clipboard blocked.', 'error');
            });
        } else {
          toast('Clipboard not supported.', 'error');
        }
      });
    }
  }

  function initTerminal() {
    const backBtn = byId('backToMenuBtn');
    const stopBtn = byId('stopOperationBtn');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        stopRunning();
        showView('dashboard');
      });
    }
    if (stopBtn) {
      stopBtn.addEventListener('click', function () {
        if (state.running) {
          stopRunning();
          if (opPill) {
            opPill.textContent = 'stopping';
          }
        } else {
          toast('No operation is running.', 'info');
        }
      });
    }
    const historyClose = byId('historyModalClose');
    if (historyClose) {
      historyClose.addEventListener('click', closeModal);
    }
    const historyModal = byId('historyModal');
    if (historyModal) {
      historyModal.addEventListener('click', function (e) {
        if (e.target === historyModal) {
          closeModal();
        }
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && historyModal && historyModal.classList.contains('active')) {
        closeModal();
      }
    });
  }

  function initSettings() {
    const autoStart = byId('setAutoStart');
    const minTray = byId('setMinTray');
    const speedSel = byId('setSpeed');
    const accentBox = byId('accentPickers');
    const wlSave = byId('wlSaveBtn');
    const deactivate = byId('deactivateLicenseBtn');
    const clearAll = byId('clearAllDataBtn');

    function saveElectron() {
      const pref = {
        autoStart: !!(autoStart && autoStart.checked),
        minTray: !!(minTray && minTray.checked)
      };
      jsonSet(localStorage, CONFIG.dsc.electron, pref);
    }

    if (autoStart) {
      autoStart.addEventListener('change', function () {
        saveElectron();
        toast('Auto-start ' + (autoStart.checked ? 'enabled' : 'disabled') + '.', 'info');
      });
    }
    if (minTray) {
      minTray.addEventListener('change', function () {
        saveElectron();
        toast('Tray minimize ' + (minTray.checked ? 'enabled' : 'disabled') + '.', 'info');
      });
    }
    if (speedSel) {
      speedSel.addEventListener('change', function () {
        storageSet(localStorage, CONFIG.dsc.speed, speedSel.value);
        toast('Request speed: ' + speedSel.options[speedSel.selectedIndex].text + '.', 'info');
      });
    }
    if (accentBox) {
      accentBox.addEventListener('click', function (e) {
        if (!(e.target && e.target.classList && e.target.classList.contains('accent-dot'))) {
          return;
        }
        const name = e.target.getAttribute('data-accent');
        applyAccent(name);
        storageSet(localStorage, CONFIG.dsc.accent, name);
        toast('Accent updated.', 'success');
      });
    }
    if (wlSave) {
      wlSave.addEventListener('click', function () {
        const parse = function (el) {
          return String(el ? el.value : '')
            .split(/[,\n]/)
            .map(function (s) {
              return s.trim();
            })
            .filter(Boolean);
        };
        const wl = {
          servers: parse(byId('wlServers')),
          friends: parse(byId('wlFriends')),
          dms: parse(byId('wlDms'))
        };
        jsonSet(localStorage, CONFIG.dsc.whitelists, wl);
        toast('Whitelist saved.', 'success');
      });
    }
    if (deactivate) {
      deactivate.addEventListener('click', function () {
        if (!window.confirm('Deactivate the current session and keep saved accounts?')) {
          return;
        }
        stopRunning();
        clearActiveAccount();
        renderSavedAccounts();
        showView('login');
        toast('Session deactivated.', 'info');
      });
    }
    if (clearAll) {
      clearAll.addEventListener('click', function () {
        if (!window.confirm('Wipe ALL local tokens, saved accounts, whitelists and storage? This cannot be undone.')) {
          return;
        }
        try {
          Object.keys(localStorage).forEach(function (key) {
            if (key.indexOf('dmt.') === 0) {
              localStorage.removeItem(key);
            }
          });
          Object.keys(sessionStorage).forEach(function (key) {
            if (key.indexOf('dmt.') === 0) {
              sessionStorage.removeItem(key);
            }
          });
        } catch (e) {}
        window.location.reload();
      });
    }
  }

  function setBusy(btn, busy) {
    if (!btn) {
      return;
    }
    btn.classList.toggle('loading', busy);
    btn.disabled = busy;
  }

  /* ---------- Boot ---------- */

  function boot() {
    applySettings();
    applyWhitelists();
    renderSavedAccounts();
    initAuth();
    initDashboard();
    initOps();
    initBadges();
    initSubviews();
    initTerminal();
    initSettings();

    if (hasAccount()) {
      applyAccountState();
      showView('dashboard', { persist: false });
    } else {
      showView('login', { persist: false });
    }

    setTimeout(applyBadge, 0);
  }

  boot();
})();