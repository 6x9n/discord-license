window.CONFIG = {
  apiBase: '',
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
    whitelistsByAccount: 'dmt.dsc.whitelists.byAccount',
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
    } catch (e) { }
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

  const TOAST_ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5h.01"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg>'
  };

  function toast(message, kind) {
    const container = byId('toastContainer') || document.getElementById('toastContainer');
    if (!container) return;
    const k = kind || 'info';
    const node = document.createElement('div');
    node.className = 'toast ' + k;
    node.innerHTML =
      '<div class="toast-icon">' + (TOAST_ICONS[k] || TOAST_ICONS.info) + '</div>' +
      '<div class="toast-text"></div>' +
      '<div class="toast-bar"></div>';
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

  function setBusy(node, busy) {
    if (!node) return;
    node.classList.toggle('loading', !!busy);
    node.disabled = !!busy;
  }

  /* ---------- View navigation ---------- */

  const VIEWS = {
    login: { panel: 'loginSection', title: 'Login' },
    dashboard: { panel: 'dashboardView', title: 'Dashboard', tab: 'dashboard' },
    badges: { panel: 'badgeSelectionView', title: 'Manage Badges', tab: 'manager' },
    details: { panel: 'accountDetailsView', title: 'Account Details', tab: 'manager' },
    evolution: { panel: 'badgeEvolutionView', title: 'Badge Evolution', tab: 'manager' },
    operation: { panel: 'operationView', title: 'Operation', tab: 'manager' },
    settings: { panel: 'settingsView', title: 'Settings', tab: 'settings' }
  };

  const pageTitle = byId('pageTitle');
  const mainCanvas = byId('mainCanvas');

  function showView(name, opts) {
    const meta = Object.prototype.hasOwnProperty.call(VIEWS, name) ? VIEWS[name] : VIEWS.dashboard;
    const previousPanel = state.currentView;
    state.currentView = meta.panel;
    const panels = document.querySelectorAll('.view-panel');
    panels.forEach(function (panel) {
      panel.classList.toggle('active', panel.id === meta.panel);
    });

    const navLinks = document.querySelectorAll('.nav-link[data-tab], .nav-link[data-view]');
    navLinks.forEach(function (link) {
      const active = (meta.tab && link.getAttribute('data-tab') === meta.tab) ||
        link.getAttribute('data-view') === name;
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

    const accountViews = ['dashboardView', 'accountDetailsView', 'badgeEvolutionView', 'badgeSelectionView'];
    const enteringBadgeView = meta.panel === 'badgeSelectionView' && previousPanel !== meta.panel;
    if (accountViews.indexOf(meta.panel) !== -1 && hasAccount() && (previousPanel !== meta.panel || enteringBadgeView)) {
      refreshAccountStateAfterOp();
    }
    if (meta.panel === 'accountDetailsView' && hasAccount()) {
      loadSupplementalAccountDetails();
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

    const historyLink = e.target.closest('[data-action="operation-history"]');
    if (historyLink) {
      e.preventDefault();
      openHistory();
      document.body.classList.remove('drawer-open');
      return;
    }

    const viewBtn = e.target.closest('[data-view]');
    if (viewBtn) {
      e.preventDefault();
      const name = viewBtn.getAttribute('data-view');
      if (name) {
        if (!hasAccount()) {
          showView('login', { persist: false });
          toast('Login a Discord account first.', 'error');
          return;
        }
        const target = VIEWS[name] ? name : (name === 'manager' ? 'operation' : name);
        showView(target, { persist: true });
      }
      if (viewBtn.classList.contains('nav-link')) {
        document.body.classList.remove('drawer-open');
      }
      return;
    }

    const tabLink = e.target.closest('.nav-link[data-tab]');
    if (tabLink) {
      e.preventDefault();
      if (!hasAccount()) {
        showView('login', { persist: false });
        toast('Login a Discord account first.', 'error');
        return;
      }
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
  const CDN_BADGE_BASE = 'https://cdn.discordapp.com/badge-icons';
  const savedUserObj = jsonGet(localStorage, CONFIG.dsc.user);
  if (savedUserObj && isSyntheticUser(savedUserObj)) {
    localStorage.removeItem(CONFIG.dsc.user);
  }
  const cleanedSavedUserObj = savedUserObj && isSyntheticUser(savedUserObj) ? null : savedUserObj;
  if (cleanedSavedUserObj && (cleanedSavedUserObj.user || cleanedSavedUserObj.id || cleanedSavedUserObj.avatar || cleanedSavedUserObj.email)) {
    jsonSet(localStorage, CONFIG.dsc.user, {
      username: cleanedSavedUserObj.global_name || cleanedSavedUserObj.username || 'Unknown',
      token: storageGet(localStorage, CONFIG.dsc.token) || ''
    });
  }
  if (cleanedSavedUserObj && cleanedSavedUserObj.id) {
    localStorage.removeItem('dmt.dsc.profile_' + cleanedSavedUserObj.id);
  }
  const state = {
    user: cleanedSavedUserObj,
    token: storageGet(localStorage, CONFIG.dsc.token) || '',
    profileData: {},
    accountDetailsData: null,
    accountDetailsLoading: false,
    guilds: [],
    rel: [],
    channels: [],
    userSettings: null,
    protobufSettings: null,
    dmsClosed: false,
    dataLoaded: false,
    lastDataLoad: 0,
    lastLoadError: null,
    running: false,
    stopped: false,
    allInOneCooldown: 0,
    selectedHouse: null,
    selectedLegacy: null,
    opLines: [],
    inspectType: null,
    inspectSelected: [],
    inspectSelectMode: false,
    inspectSearchQuery: '',
    evolutionType: 'nitro',
    legacyUsernameOverride: null,
    closeDmResults: [],
    currentOperationTitle: '',
    currentView: null
  };

  const MAX_RATE_RETRIES = 3;
  let inFlightController = null;
  let accountDataRequest = null;

  function delay(ms) {
    return new Promise(function (resolve, reject) {
      let done = false;
      const timer = setTimeout(function () {
        if (!done) {
          done = true;
          resolve();
        }
      }, ms);
      if (inFlightController && !inFlightController.signal.aborted) {
        inFlightController.signal.addEventListener('abort', function () {
          if (!done) {
            done = true;
            clearTimeout(timer);
            reject(new Error('Operation stopped.'));
          }
        }, { once: true });
      }
    });
  }

  function makeRequest(method, path, body, token) {
    const authToken = token || state.token;
    const headers = {
      'Authorization': authToken,
      'X-Super-Properties': btoa(JSON.stringify({
        os: 'Windows', browser: 'Chrome', device: '',
        system_locale: 'en-US', browser_user_agent: navigator.userAgent,
        browser_version: '', os_version: '10',
        referrer: '', referring_domain: '',
        referrer_current: '', referring_domain_current: '',
        release_channel: 'stable', client_build_number: 9999,
        client_event_source: null
      })),
      'X-Discord-Locale': 'en-US',
      'X-Debug-Options': 'bugReporterEnabled'
    };
    let payload;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const options = { method: method, headers: headers, body: payload };
    if (inFlightController && !inFlightController.signal.aborted) {
      options.signal = inFlightController.signal;
    }
    const single = function () {
      const requestUrl = /^https?:\/\//i.test(path) ? path : DISCORD_API + path;
      return fetch(requestUrl, options).then(function (res) {
        let retryAfter = null;
        if (res.status === 429) {
          try {
            const header = parseFloat(res.headers.get('Retry-After') || '');
            retryAfter = isFinite(header) ? header : null;
          } catch (e) { }
        }
        return res.json().then(function (data) {
          if (retryAfter === null && data && typeof data.retry_after === 'number') {
            retryAfter = data.retry_after;
          }
          return { status: res.status, data: data, retryAfter: retryAfter };
        }).catch(function () {
          return { status: res.status, data: null, retryAfter: retryAfter };
        });
      });
    };
    let attempts = 0;
    const run = function () {
      return single().then(function (res) {
        if (res.status === 429 && attempts < MAX_RATE_RETRIES && !(inFlightController && inFlightController.signal.aborted)) {
          attempts += 1;
          const secs = Math.min(Math.max(Math.ceil(Number(res.retryAfter) || 5), 1), 30);
          toast('Rate Limited - retrying in ' + secs + 's...', 'warning');
          return delay(secs * 1000).then(run);
        }
        return res;
      });
    };
    return run();
  }

  function apiCall(method, path, body) {
    return makeRequest(method, path, body, state.token);
  }

  function abortInFlight() {
    if (inFlightController) {
      try {
        inFlightController.abort();
      } catch (e) { }
      inFlightController = null;
    }
  }

  function hasAccount() {
    return !!state.token && !!state.user && !isSyntheticUser(state.user);
  }

  function applyAccountLock() {
    const locked = !hasAccount();
    document.body.classList.toggle('account-locked', locked);
    const node = document.getElementById('appScreen');
    if (node) {
      node.classList.toggle('account-locked', locked);
    }
    document.querySelectorAll('#appSidebar .nav-link').forEach(function (link) {
      link.classList.toggle('locked', locked);
      link.setAttribute('aria-disabled', locked ? 'true' : 'false');
      link.setAttribute('tabindex', locked ? '-1' : '0');
    });
    renderTopbar();
  }

  function renderTopbar() {
    const planEl = document.getElementById('sessionPlan');
    const keyEl = document.getElementById('sessionKey');
    if (!planEl) {
      return;
    }
    const li = managerLicenseInfo();
    const owner = (li && li.owner) || (state.user && (state.user.global_name || state.user.username)) || '';
    if (owner) {
      planEl.textContent = (li && li.plan && li.plan !== 'Standard') ? li.plan : 'Licensed';
      planEl.title = owner;
    } else {
      planEl.textContent = 'Open Access';
      planEl.title = '';
    }
    if (keyEl) {
      const mask = (li && li.key) ? maskKey(li.key) : '';
      keyEl.textContent = mask;
      keyEl.title = (li && li.key) || '';
      keyEl.hidden = !mask;
    }
  }

  function maskKey(key) {
    const k = String(key || '').trim();
    if (!k) {
      return '';
    }
    const parts = k.split('-');
    if (parts.length < 2) {
      return k;
    }
    const head = parts[0];
    const tail = parts[parts.length - 1];
    return head + '-••••-••••-' + tail;
  }

  function managerLicenseInfo() {
    try {
      const raw = localStorage.getItem('dmt.license.cache') || localStorage.getItem('dmt.welcome.pending');
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) { }
    return null;
  }

  function setActiveAccount(token, user) {
    state.token = normalizeToken(token);
    state.user = user;
    if (user && user.id) {
      localStorage.removeItem('dmt.dsc.profile_' + user.id);
    }
    state.profileData = {};
    state.accountDetailsData = null;
    state.accountDetailsLoading = false;
    state.legacyUsernameOverride = null;
    state.guilds = [];
    state.rel = [];
    state.channels = [];
    state.dataLoaded = false;
    storageSet(localStorage, CONFIG.dsc.token, state.token);
    jsonSet(localStorage, CONFIG.dsc.user, {
      username: user && (user.global_name || user.username) || 'Unknown',
      token: state.token
    });
    applyWhitelists();
    applyBadge();
    applyAccountLock();
  }

  function clearActiveAccount() {
    abortInFlight();
    state.token = '';
    state.user = null;
    state.legacyUsernameOverride = null;
    state.guilds = [];
    state.rel = [];
    state.channels = [];
    state.dataLoaded = false;
    storageSet(localStorage, CONFIG.dsc.token, '');
    state.accountDetailsData = null;
    state.accountDetailsLoading = false;
    localStorage.removeItem(CONFIG.dsc.user);
    applyBadge();
    applyAccountLock();
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

  function guildIconUrl(guild, size) {
    if (!guild || !guild.icon) {
      return '';
    }
    const ext = guild.icon.indexOf('a_') === 0 ? 'gif' : 'png';
    return 'https://cdn.discordapp.com/icons/' + guild.id + '/' + guild.icon + '.' + ext + '?size=' + (size || 128);
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
    { bit: 1 << 0, key: 'staff', hash: '57440232efd66a218520202720d3f233', path: 'assets/images/badges/discordstaff.svg', title: 'Discord Staff' },
    { bit: 1 << 1, key: 'partner', hash: '3f9748e53446a137a052f3454e2de41e', path: 'assets/images/badges/discordpartner.svg', title: 'Partnered Server Owner' },
    { bit: 1 << 2, key: 'hypesquadevents', hash: 'bf12284d6825ed97f3b0f279f0450f3f', path: 'assets/images/badges/hypesquadevents.svg', title: 'HypeSquad Events' },
    { bit: 1 << 3, key: 'bughunter1', hash: '2717692c7dca7289b35208312e70579b', path: 'assets/images/badges/discordbughunter1.svg', title: 'Bug Hunter (Tier 1)' },
    { bit: 1 << 6, key: 'bravery', hash: '8a882641233adea6150e268344351826', path: 'assets/images/badges/hypesquadbravery.svg', title: 'HypeSquad Bravery' },
    { bit: 1 << 7, key: 'brilliance', hash: 'a16137d66a263625299208003f572620', path: 'assets/images/badges/hypesquadbrilliance.svg', title: 'HypeSquad Brilliance' },
    { bit: 1 << 8, key: 'balance', hash: '9f00b212f010373ab11311d0449d0ca6', path: 'assets/images/badges/hypesquadbalance.svg', title: 'HypeSquad Balance' },
    { bit: 1 << 9, key: 'earlysupporter', hash: '7060786766c926952dc7c0e65038e129', path: 'assets/images/badges/discordearlysupporter.svg', title: 'Early Supporter' },
    { bit: 1 << 14, key: 'bughunter2', hash: '848f2a58460661126da324c42f82b6d7', path: 'assets/images/badges/discordbughunter2.svg', title: 'Bug Hunter (Tier 2)' },
    { bit: 1 << 17, key: 'botdev', hash: '6df5892e0f35db05104d5883391d4e5d', path: 'assets/images/badges/discordbotdev.svg', title: 'Early Verified Bot Developer' },
    { bit: 1 << 18, key: 'moderator', hash: 'e8d11871239845d47cfc35ef21396f4c', path: 'assets/images/badges/discordmod.svg', title: 'Moderator Programs Alumni' },
    { bit: 1 << 22, key: 'activedeveloper', hash: '6bdc42827d37398d28ed2917711d9d95', path: 'assets/images/badges/activedeveloper.svg', title: 'Active Developer' }
  ];

  const PROFILE_BADGE_MAP = {
    'staff': { key: 'staff', hash: '57440232efd66a218520202720d3f233', path: 'assets/images/badges/discordstaff.svg', title: 'Discord Staff' },
    'discord_staff': { key: 'staff', hash: '57440232efd66a218520202720d3f233', path: 'assets/images/badges/discordstaff.svg', title: 'Discord Staff' },
    'partner': { key: 'partner', hash: '3f9748e53446a137a052f3454e2de41e', path: 'assets/images/badges/discordpartner.svg', title: 'Partnered Server Owner' },
    'partnered_server_owner': { key: 'partner', hash: '3f9748e53446a137a052f3454e2de41e', path: 'assets/images/badges/discordpartner.svg', title: 'Partnered Server Owner' },
    'hypesquad': { key: 'hypesquadevents', hash: 'bf12284d6825ed97f3b0f279f0450f3f', path: 'assets/images/badges/hypesquadevents.svg', title: 'HypeSquad Events' },
    'hypesquadevents': { key: 'hypesquadevents', hash: 'bf12284d6825ed97f3b0f279f0450f3f', path: 'assets/images/badges/hypesquadevents.svg', title: 'HypeSquad Events' },
    'hypesquad_house_1': { key: 'bravery', hash: '8a882641233adea6150e268344351826', path: 'assets/images/badges/hypesquadbravery.svg', title: 'HypeSquad Bravery' },
    'hypesquad_bravery': { key: 'bravery', hash: '8a882641233adea6150e268344351826', path: 'assets/images/badges/hypesquadbravery.svg', title: 'HypeSquad Bravery' },
    'bravery': { key: 'bravery', hash: '8a882641233adea6150e268344351826', path: 'assets/images/badges/hypesquadbravery.svg', title: 'HypeSquad Bravery' },
    'hypesquad_house_2': { key: 'brilliance', hash: 'a16137d66a263625299208003f572620', path: 'assets/images/badges/hypesquadbrilliance.svg', title: 'HypeSquad Brilliance' },
    'hypesquad_brilliance': { key: 'brilliance', hash: 'a16137d66a263625299208003f572620', path: 'assets/images/badges/hypesquadbrilliance.svg', title: 'HypeSquad Brilliance' },
    'brilliance': { key: 'brilliance', hash: 'a16137d66a263625299208003f572620', path: 'assets/images/badges/hypesquadbrilliance.svg', title: 'HypeSquad Brilliance' },
    'hypesquad_house_3': { key: 'balance', hash: '9f00b212f010373ab11311d0449d0ca6', path: 'assets/images/badges/hypesquadbalance.svg', title: 'HypeSquad Balance' },
    'hypesquad_balance': { key: 'balance', hash: '9f00b212f010373ab11311d0449d0ca6', path: 'assets/images/badges/hypesquadbalance.svg', title: 'HypeSquad Balance' },
    'balance': { key: 'balance', hash: '9f00b212f010373ab11311d0449d0ca6', path: 'assets/images/badges/hypesquadbalance.svg', title: 'HypeSquad Balance' },
    'bug_hunter_level_1': { key: 'bughunter1', hash: '2717692c7dca7289b35208312e70579b', path: 'assets/images/badges/discordbughunter1.svg', title: 'Bug Hunter (Tier 1)' },
    'bughunter1': { key: 'bughunter1', hash: '2717692c7dca7289b35208312e70579b', path: 'assets/images/badges/discordbughunter1.svg', title: 'Bug Hunter (Tier 1)' },
    'bug_hunter_level_2': { key: 'bughunter2', hash: '848f2a58460661126da324c42f82b6d7', path: 'assets/images/badges/discordbughunter2.svg', title: 'Bug Hunter (Tier 2)' },
    'bughunter2': { key: 'bughunter2', hash: '848f2a58460661126da324c42f82b6d7', path: 'assets/images/badges/discordbughunter2.svg', title: 'Bug Hunter (Tier 2)' },
    'verified_developer': { key: 'botdev', hash: '6df5892e0f35db05104d5883391d4e5d', path: 'assets/images/badges/discordbotdev.svg', title: 'Early Verified Bot Developer' },
    'early_verified_bot_developer': { key: 'botdev', hash: '6df5892e0f35db05104d5883391d4e5d', path: 'assets/images/badges/discordbotdev.svg', title: 'Early Verified Bot Developer' },
    'botdev': { key: 'botdev', hash: '6df5892e0f35db05104d5883391d4e5d', path: 'assets/images/badges/discordbotdev.svg', title: 'Early Verified Bot Developer' },
    'active_developer': { key: 'activedeveloper', hash: '6bdc42827d37398d28ed2917711d9d95', path: 'assets/images/badges/activedeveloper.svg', title: 'Active Developer' },
    'activedeveloper': { key: 'activedeveloper', hash: '6bdc42827d37398d28ed2917711d9d95', path: 'assets/images/badges/activedeveloper.svg', title: 'Active Developer' },
    'early_supporter': { key: 'earlysupporter', hash: '7060786766c926952dc7c0e65038e129', path: 'assets/images/badges/discordearlysupporter.svg', title: 'Early Supporter' },
    'earlysupporter': { key: 'earlysupporter', hash: '7060786766c926952dc7c0e65038e129', path: 'assets/images/badges/discordearlysupporter.svg', title: 'Early Supporter' },
    'certified_moderator': { key: 'moderator', hash: 'e8d11871239845d47cfc35ef21396f4c', path: 'assets/images/badges/discordmod.svg', title: 'Moderator Programs Alumni' },
    'moderator_programs_alumni': { key: 'moderator', hash: 'e8d11871239845d47cfc35ef21396f4c', path: 'assets/images/badges/discordmod.svg', title: 'Moderator Programs Alumni' },
    'moderator': { key: 'moderator', hash: 'e8d11871239845d47cfc35ef21396f4c', path: 'assets/images/badges/discordmod.svg', title: 'Moderator Programs Alumni' },
    'quest_completed': { key: 'quest_completed', hash: '7d9ae358c8c5e118768335dbe68b4fb8', path: 'assets/images/badges/quest.png', title: 'Completed a Quest' },
    'quest': { key: 'quest_completed', hash: '7d9ae358c8c5e118768335dbe68b4fb8', path: 'assets/images/badges/quest.png', title: 'Completed a Quest' },
    'quest_badge': { key: 'quest_completed', hash: '7d9ae358c8c5e118768335dbe68b4fb8', path: 'assets/images/badges/quest.png', title: 'Completed a Quest' },
    'legacy_username': { key: 'legacy_username', hash: '6de6d34eb6033258d928a743e3a553e3', path: 'assets/images/badges/username.png', title: 'Originally known as' },
    'premium': { key: 'nitro', hash: '2ba85e8026ddbc56104e61d002556543', path: 'assets/images/badges/discordnitro.svg', title: 'Discord Nitro Subscriber' },
    'nitro': { key: 'nitro', hash: '2ba85e8026ddbc56104e61d002556543', path: 'assets/images/badges/discordnitro.svg', title: 'Discord Nitro' },
    'guild_booster': { key: 'boost', hash: '', path: 'assets/images/badges/boost_badges/discordboost1.svg', title: 'Server Booster' },
    'guild_booster_lvl1': { key: 'boost', hash: '', path: 'assets/images/badges/boost_badges/discordboost1.svg', title: 'Server Booster (Level 1)' },
    'guild_booster_lvl2': { key: 'boost', hash: '', path: 'assets/images/badges/boost_badges/discordboost2.svg', title: 'Server Booster (Level 2)' },
    'guild_booster_lvl3': { key: 'boost', hash: '', path: 'assets/images/badges/boost_badges/discordboost3.svg', title: 'Server Booster (Level 3)' },
    'guild_booster_lvl4': { key: 'boost', hash: '', path: 'assets/images/badges/boost_badges/discordboost4.svg', title: 'Server Booster (Level 4)' },
    'guild_booster_lvl5': { key: 'boost', hash: '', path: 'assets/images/badges/boost_badges/discordboost5.svg', title: 'Server Booster (Level 5)' },
    'guild_booster_lvl6': { key: 'boost', hash: '', path: 'assets/images/badges/boost_badges/discordboost6.svg', title: 'Server Booster (Level 6)' },
    'guild_booster_lvl7': { key: 'boost', hash: '', path: 'assets/images/badges/boost_badges/discordboost7.svg', title: 'Server Booster (Level 7)' },
    'guild_booster_lvl8': { key: 'boost', hash: '', path: 'assets/images/badges/boost_badges/discordboost8.svg', title: 'Server Booster (Level 8)' },
    'guild_booster_lvl9': { key: 'boost', hash: '', path: 'assets/images/badges/boost_badges/discordboost9.svg', title: 'Server Booster (Level 9)' }
  };

  function normalizeAssetPath(value, fallback) {
    const raw = String(value || '').trim();
    if (!raw) {
      return fallback || '';
    }
    if (/^(https?:)?\/\//i.test(raw) || raw.indexOf('data:') === 0) {
      return raw;
    }
    const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalized) {
      return fallback || '';
    }
    if (normalized.indexOf('assets/') === 0) {
      return normalized;
    }
    if (normalized.indexOf('images/') === 0) {
      return 'assets/' + normalized;
    }
    if (normalized.indexOf('boost_badges/') !== -1 || normalized.indexOf('boost_badges') !== -1) {
      const base = normalized.split('/').pop();
      return 'assets/images/badges/boost_badges/' + base;
    }
    if (normalized.indexOf('nitro_badges/') !== -1 || normalized.indexOf('nitro_badges') !== -1) {
      const base = normalized.split('/').pop();
      return 'assets/images/badges/nitro_badges/' + base;
    }
    if (normalized.indexOf('gift_badges/') !== -1 || normalized.indexOf('gift_badges') !== -1) {
      const base = normalized.split('/').pop();
      return 'assets/images/badges/gift_badges/' + base;
    }
    if (normalized.indexOf('badges/') !== -1 || normalized.indexOf('badges') !== -1) {
      const base = normalized.split('/').pop();
      return 'assets/images/badges/' + base;
    }
    return normalized;
  }

  function getBadgeImageUrl(badge) {
    if (badge && badge.hash) {
      return CDN_BADGE_BASE + '/' + badge.hash + '.png';
    }
    return normalizeAssetPath(badge ? (badge.path || '') : '', 'assets/images/badges/discordnitro.svg');
  }

  function animateCounter(el, targetValue) {
    if (!el) {
      return;
    }
    const target = Number.isFinite(targetValue) ? Number(targetValue) : 0;
    const start = Number(el.dataset.current || el.textContent || 0);
    const from = Number.isFinite(start) ? start : 0;
    const duration = 550;
    const startTime = performance.now();
    const tick = function (now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(from + (target - from) * eased);
      el.textContent = next;
      el.dataset.current = String(next);
      el.style.animation = 'counter-pop 0.25s ease';
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        el.textContent = target;
        el.dataset.current = String(target);
      }
    };
    requestAnimationFrame(tick);
  }

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

  function getLegacyUsernameSetting() {
    const response = state.protobufSettings;
    const settings = response && typeof response === 'object' ? response.settings : response;
    if (!settings) {
      return 'unknown';
    }
    try {
      const decoded = atob(String(settings));
      const hex = Array.from(decoded).map(function (character) {
        return character.charCodeAt(0).toString(16).padStart(2, '0');
      }).join('');
      const markerIndex = hex.indexOf('42053f010208');
      if (markerIndex !== -1) {
        const value = hex.slice(markerIndex + '42053f010208'.length, markerIndex + '42053f010208'.length + 2);
        return value === '00' ? 'visible' : (value === '01' ? 'hidden' : 'unknown');
      }
      if (hex.indexOf('b201020801') !== -1) {
        return 'hidden';
      }
      if (hex.indexOf('b201020800') !== -1) {
        return 'visible';
      }
      return 'unknown';
    } catch (e) {
      return 'unknown';
    }
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
      const key = entry.key || entry.id || entry.title;
      if (!key || seen[key]) {
        return;
      }
      seen[key] = true;
      if (entry.id) {
        seen[entry.id] = true;
      }
      out.push(entry);
    }

    // 1. Process profile badges first (official badges directly from Discord profile)
    const pBadges = Array.isArray(profile.badges) ? profile.badges : [];
    pBadges.forEach(function (entry) {
      const rawId = (entry && typeof entry === 'object') ? (entry.id || '') : String(entry || '');
      const idStr = String(rawId).toLowerCase();
      const desc = (entry && typeof entry === 'object') ? (entry.description || entry.title) : null;
      const iconHash = (entry && typeof entry === 'object') ? entry.icon : null;

      const mapped = PROFILE_BADGE_MAP[rawId] || PROFILE_BADGE_MAP[idStr];
      if (mapped) {
        add({
          key: mapped.key,
          id: rawId,
          hash: iconHash || mapped.hash,
          path: mapped.path,
          title: desc || mapped.title
        });
      } else if (idStr.indexOf('guild_booster') !== -1 || idStr.indexOf('boost') !== -1) {
        add({
          key: 'boost',
          id: rawId,
          hash: iconHash || '',
          path: 'assets/images/badges/boost_badges/discordboost1.svg',
          title: desc || 'Server Booster'
        });
      } else if (idStr.indexOf('premium') !== -1 || idStr.indexOf('nitro') !== -1) {
        add({
          key: 'nitro',
          id: rawId,
          hash: iconHash || '',
          path: 'assets/images/badges/discordnitro.svg',
          title: desc || 'Discord Nitro'
        });
      } else if (idStr.indexOf('hypesquad') !== -1) {
        let hKey = 'hypesquadevents';
        let hTitle = 'HypeSquad Events';
        let hPath = 'assets/images/badges/hypesquadevents.svg';
        if (idStr.indexOf('1') !== -1 || idStr.indexOf('bravery') !== -1) {
          hKey = 'bravery';
          hTitle = 'HypeSquad Bravery';
          hPath = 'assets/images/badges/hypesquadbravery.svg';
        } else if (idStr.indexOf('2') !== -1 || idStr.indexOf('brilliance') !== -1) {
          hKey = 'brilliance';
          hTitle = 'HypeSquad Brilliance';
          hPath = 'assets/images/badges/hypesquadbrilliance.svg';
        } else if (idStr.indexOf('3') !== -1 || idStr.indexOf('balance') !== -1) {
          hKey = 'balance';
          hTitle = 'HypeSquad Balance';
          hPath = 'assets/images/badges/hypesquadbalance.svg';
        }
        add({
          key: hKey,
          id: rawId,
          hash: iconHash || '',
          path: hPath,
          title: desc || hTitle
        });
      } else if (idStr.indexOf('legacy') !== -1 || idStr.indexOf('username') !== -1 || idStr.indexOf('pomelo') !== -1) {
        add({
          key: 'legacy_username',
          id: rawId,
          hash: iconHash || '6de6d34eb6033258d928a743e3a553e3',
          path: 'assets/images/badges/username.png',
          title: desc || ('Originally known as ' + (user.username || 'User'))
        });
      } else if (idStr.indexOf('quest') !== -1) {
        add({
          key: 'quest_completed',
          id: rawId,
          hash: iconHash || '7d9ae358c8c5e118768335dbe68b4fb8',
          path: 'assets/images/badges/quest.png',
          title: desc || 'Completed a Quest'
        });
      } else if (iconHash) {
        add({
          key: 'custom_' + (rawId || iconHash),
          id: rawId,
          hash: iconHash,
          path: '',
          title: desc || (rawId ? rawId.replace(/_/g, ' ') : 'Badge')
        });
      }
    });

    // 2. Add bit flags (if not already included from profile badges)
    const flags = user.flags || user.public_flags || 0;
    FLAG_BADGES.forEach(function (fb) {
      if (flags & fb.bit) {
        add(fb);
      }
    });

    // 3. Fallback Nitro tenure (if not already added)
    if (!seen['nitro']) {
      const nitroMonths = monthsSince(user.premium_since || profile.premium_since);
      if (nitroMonths >= 1 && (user.premium_type || 0) !== 0) {
        let tier = null;
        NITRO_TIERS.forEach(function (t) {
          if (nitroMonths >= t.months) {
            tier = t;
          }
        });
        if (tier) {
          add({ key: 'nitro', path: tier.image, title: 'Nitro ' + tier.name });
        }
      } else if (user.premium_type && user.premium_type > 0) {
        add({ key: 'nitro', path: 'assets/images/badges/discordnitro.svg', title: nitroTier(user.premium_type) });
      }
    }

    // 4. Fallback Server Booster tenure (if not already added)
    if (!seen['boost']) {
      const boostMonths = monthsSince(user.premium_guild_since || profile.premium_guild_since);
      if (boostMonths >= 1) {
        let boost = null;
        BOOST_LEVELS.forEach(function (b) {
          if (boostMonths >= b.months) {
            boost = b;
          }
        });
        if (boost) {
          add({ key: 'boost', path: boost.image, title: 'Server Boost Level ' + boost.level });
        }
      }
    }

    // 5. Fallback Gift badge (if not already added)
    if (!seen['gift']) {
      const gifts = user.gifts || profile.gifts || 0;
      if (gifts >= 1) {
        let gift = null;
        GIFT_LEVELS.forEach(function (g) {
          if (gifts >= g.gifts) {
            gift = g;
          }
        });
        if (gift) {
          add({ key: 'gift', path: gift.image, title: 'Gift Badge \u2014 ' + gift.name });
        }
      }
    }

    return out;
  }

  function renderBadgeImages(host, badges) {
    if (!host) {
      return;
    }
    host.innerHTML = '';
    badges.forEach(function (b) {
      const img = document.createElement('img');
      const fallback = normalizeAssetPath((b && b.path) || '', 'assets/images/badges/discordnitro.svg');
      img.className = 'inline-badge';
      img.alt = (b && b.title) || 'Badge';
      img.title = (b && b.title) || 'Badge';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = getBadgeImageUrl(b) || fallback;
      img.onerror = function () {
        img.onerror = null;
        img.src = fallback;
      };
      host.appendChild(img);
    });
  }

  function fetchProfileBadges(host) {
    if (!state.user || !state.user.id) {
      return;
    }
    makeRequest('GET', '/users/' + state.user.id + '/profile')
      .then(function (res) {
        if (res && res.data && typeof res.data === 'object') {
          state.profileData = res.data;
          let badges = getUserBadges(state.user, res.data);
          const legacyHidden = state.legacyUsernameOverride === false || getLegacyUsernameSetting() === 'hidden';
          if (legacyHidden) {
            badges = badges.filter(function (badge) {
              return !badge || badge.key !== 'legacy_username';
            });
          }
          if (host) {
            renderBadgeImages(host, badges);
          }
          renderDetailsView();
          renderDashboardEvolution();
        }
      })
      .catch(function () {
        state.profileData = {};
        if (host) {
          let badges = getUserBadges(state.user, {});
          if (state.legacyUsernameOverride === false || getLegacyUsernameSetting() === 'hidden') {
            badges = badges.filter(function (badge) {
              return !badge || badge.key !== 'legacy_username';
            });
          }
          renderBadgeImages(host, badges);
        }
      });
  }

  function renderProfileBadges() {
    const host = byId('profileHeaderBadges') || byId('profileBadges');
    if (!host) {
      return;
    }
    if (hasAccount() && !state.accountDetailsData && !state.accountDetailsLoading) {
      loadSupplementalAccountDetails();
    }
    renderBadgeImages(host, []);
    fetchProfileBadges(host);
  }

  /* ---------- Accounts list ---------- */

  function loadAccounts() {
    const stored = jsonGet(localStorage, CONFIG.dsc.accounts);
    if (!Array.isArray(stored)) {
      return [];
    }
    let changed = false;
    const accounts = stored.map(function (account) {
      const user = account && account.user && typeof account.user === 'object' ? account.user : {};
      const username = account && account.username || user.username || user.global_name || 'Unknown';
      const token = account && account.token ? normalizeToken(account.token) : '';
      const normalizedUser = user && user.id ? user : null;
      const normalized = { username: username, token: token };
      if (normalizedUser) {
        normalized.user = normalizedUser;
      }
      if (!account || account.username !== normalized.username || account.token !== normalized.token ||
        JSON.stringify(account.user || null) !== JSON.stringify(normalizedUser) || Object.keys(account).length !== (normalizedUser ? 3 : 2)) {
        changed = true;
      }
      return normalized;
    }).filter(function (account) {
      return !!account.token;
    });
    if (changed || accounts.length !== stored.length) {
      jsonSet(localStorage, CONFIG.dsc.accounts, accounts);
    }
    return accounts;
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
    accounts.forEach(function (acc, index) {
      const li = document.createElement('li');
      li.className = 'saved-item';

      const avatar = document.createElement('span');
      avatar.className = 'saved-avatar';
      const avatarUrlValue = avatarUrl(acc.user, 64);
      if (avatarUrlValue) {
        avatar.style.backgroundImage = 'url("' + avatarUrlValue + '")';
      } else {
        avatar.textContent = (acc.username || '?').slice(0, 1).toUpperCase();
      }

      const name = document.createElement('span');
      name.className = 'saved-name';
      name.textContent = acc.username;

      const actions = document.createElement('span');
      actions.className = 'saved-actions';

      const useBtn = document.createElement('button');
      useBtn.type = 'button';
      useBtn.className = 'btn btn-primary btn-small';
      useBtn.textContent = 'Use';
      useBtn.setAttribute('data-account-use', String(index));

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-ghost btn-small';
      delBtn.textContent = 'Delete';
      delBtn.setAttribute('data-account-delete', String(index));

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
    let t = String(raw || '')
      .trim()
      .replace(/^["']+|["']+$/g, '')
      .replace(/[\u200B\u200C\u200D\uFEFF\u00A0\u2060]+/g, '');
    if (t.toLowerCase().startsWith('bot ')) {
      t = t.slice(4).trim();
    }
    return t;
  }

  function parseUserIdFromToken(token) {
    try {
      const parts = String(token || '').split('.');
      if (parts.length >= 2) {
        let b64 = parts[0];
        while (b64.length % 4 !== 0) {
          b64 += '=';
        }
        const decoded = atob(b64);
        if (/^\d{16,21}$/.test(decoded)) {
          return decoded;
        }
      }
    } catch (e) { }
    return null;
  }

  function buildFallbackUser(token) {
    const fallbackId = parseUserIdFromToken(token) || ('1' + Math.floor(1000000000000000 + Math.random() * 9000000000000000));
    return {
      id: fallbackId,
      username: 'User_' + fallbackId.slice(-4),
      global_name: 'User_' + fallbackId.slice(-4),
      discriminator: '0',
      avatar: null,
      flags: 0,
      premium_type: 0,
      verified: false,
      mfa_enabled: false,
      _placeholder: true
    };
  }

  function isSyntheticUser(user) {
    const data = user || {};
    const name = (data.global_name || data.username || '').toString();
    const isDefaultPlaceholderName = /^User_\d{4,}$/.test(name) || /^User_\d{4,}$/.test(String(data.username || ''));
    const idOkay = !!(data && data.id && String(data.id).length >= 16);
    const noAvatar = data.avatar === null || data.avatar === undefined || data.avatar === '';
    const defaultDiscriminator = data.discriminator === '0' || data.discriminator === null || data.discriminator === undefined;
    const hasNoRealIdentity = !data.email && !data.phone && !data.mfa_enabled && !data.verified;
    const isPlaceholderMarker = !!data._placeholder;
    return !!((isPlaceholderMarker || (idOkay && isDefaultPlaceholderName && noAvatar && defaultDiscriminator && hasNoRealIdentity)));
  }

  function validateToken(rawToken) {
    const token = normalizeToken(rawToken);
    if (!token) {
      return Promise.reject(new Error('Token cannot be empty.'));
    }

    return makeRequest('GET', '/users/@me', undefined, token)
      .then(function (res) {
        const payload = res && res.data ? res.data : {};
        if (res && res.status >= 200 && res.status < 300 && payload && payload.id) {
          return { status: res.status, data: payload };
        }
        if (res && res.status === 429) {
          return Promise.reject(new Error('Discord rate limited the profile request. Please wait a moment and try again.'));
        }
        return Promise.reject(new Error('Invalid token or profile request failed.'));
      })
      .catch(function (err) {
        if (err && err.message) {
          return Promise.reject(err);
        }
        return Promise.reject(new Error('Token validation failed.'));
      });
  }

  function loginWithToken(token) {
    const norm = normalizeToken(token);
    if (!norm) {
      return Promise.reject(new Error('Token cannot be empty.'));
    }

    return validateToken(norm).then(function (res) {
      if (res && res.data && res.data.id) {
        return res.data;
      }
      return Promise.reject(new Error('Token validation failed.'));
    });
  }

  function upsertAccount(token, user) {
    const accounts = loadAccounts();
    const existing = accounts.filter(function (acc) {
      return acc.token !== token;
    });
    existing.unshift({
      username: user.global_name || user.username || 'Unknown',
      token: normalizeToken(token),
      user: user
    });
    saveAccounts(existing.slice(0, 20));
  }

  function renderProfile(user) {
    const safeUser = user || {};
    const avatarEl = byId('profileAvatar');
    const usernameEl = byId('profileUsername');
    const discrimEl = byId('profileDiscrim');
    const tagEl = byId('profileTag');

    if (!storageGet(localStorage, CONFIG.dsc.token) || !safeUser || !safeUser.id || isSyntheticUser(safeUser)) {
      if (avatarEl) {
        avatarEl.style.backgroundImage = 'url("https://cdn.discordapp.com/embed/avatars/1.png")';
      }
      if (usernameEl) {
        usernameEl.textContent = 'Not signed in';
      }
      if (discrimEl) {
        discrimEl.textContent = '';
      }
      if (tagEl) {
        tagEl.textContent = 'No account loaded.';
      }
      return;
    }

    if (avatarEl) {
      const url = avatarUrl(safeUser, 128);
      if (url) {
        avatarEl.style.backgroundImage = 'url("' + url + '")';
      } else {
        avatarEl.style.backgroundImage = 'url("https://cdn.discordapp.com/embed/avatars/' + (parseInt(safeUser.id || '0', 10) % 5) + '.png")';
      }
    }

    if (usernameEl) {
      usernameEl.textContent = safeUser.global_name || safeUser.username || 'Unknown';
    }
    if (discrimEl) {
      discrimEl.textContent = safeUser.discriminator && safeUser.discriminator !== '0' ? '#' + safeUser.discriminator : '';
    }
    if (tagEl) {
      const created = safeUser.id ? snowflakeDate(safeUser.id) : 'Unknown';
      tagEl.textContent = 'ID ' + (safeUser.id || 'Unknown') + ' · Created ' + created;
    }
    renderProfileBadges();
  }

  function updateDmButtonState(isClosed) {
    const btn = byId('closeDMsBtn');
    if (!btn) {
      return;
    }
    btn.setAttribute('data-dm-state', 'open');
    btn.title = 'Close active DM conversations and hide them from the sidebar.';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><path d="M12 15v3"/></svg><span>Close DMs</span>';
  }

  function syncDmButton() {
    if (state.user && state.user.id) {
      const savedState = storageGet(localStorage, 'dsc_dms_closed_' + state.user.id);
      if (savedState !== null) {
        state.dmsClosed = savedState === 'true';
      }
    }
    updateDmButtonState(state.dmsClosed);
  }

  function toggleDMs() {
    if (!hasAccount()) {
      toast('Please log in first.', 'error');
      return;
    }
    if (state.running) {
      toast('An operation is already running.', 'error');
      return;
    }
    openOperationConfirmModal('Close DMs', buildCleanDMsItems, byId('closeDMsBtn'), 'Close active DM conversations and hide them from the sidebar.');
  }

  function loadAccountData() {
    if (accountDataRequest) {
      return accountDataRequest;
    }
    const promises = [
      apiCall('GET', '/users/@me/guilds'),
      apiCall('GET', '/users/@me/relationships'),
      apiCall('GET', '/users/@me/channels'),
      apiCall('GET', '/users/@me/settings'),
      apiCall('GET', '/users/@me/settings-proto/1?_=' + Date.now()).catch(function () { return { status: 400 }; })
    ];
    if (state.user && state.user.id) {
      promises.push(apiCall('GET', '/users/' + state.user.id + '/profile').catch(function () { return { status: 400 }; }));
    }
    state.profileData = {};
    accountDataRequest = Promise.all(promises).then(function (results) {
      const guildsRes = results[0];
      const relRes = results[1];
      const channelsRes = results[2];
      const settingsRes = results[3];
      const protoSettingsRes = results[4];
      const profileRes = results[5];

      if (guildsRes.status >= 400 || relRes.status >= 400) {
        const msg = (guildsRes.data && guildsRes.data.message) ||
          (relRes.data && relRes.data.message) ||
          ('Discord data request failed (' + guildsRes.status + '/' + relRes.status + ')');
        const err = new Error(msg);
        state.lastLoadError = msg;
        throw err;
      }

      const guilds = Array.isArray(guildsRes.data) ? guildsRes.data : [];
      const rel = Array.isArray(relRes.data) ? relRes.data : [];
      const channels = Array.isArray(channelsRes.data) ? channelsRes.data : [];

      state.guilds = guilds;
      state.rel = rel;
      state.channels = channels;
      state.protobufSettings = protoSettingsRes && protoSettingsRes.status < 400 && protoSettingsRes.data
        ? protoSettingsRes.data
        : null;
      if (settingsRes && settingsRes.status < 400 && settingsRes.data) {
        state.userSettings = settingsRes.data;
        const isRestricted = !!(settingsRes.data.default_guilds_restricted || (Array.isArray(settingsRes.data.restricted_guilds) && settingsRes.data.restricted_guilds.length > 0));
        state.dmsClosed = isRestricted;
        if (state.user && state.user.id) {
          storageSet(localStorage, 'dsc_dms_closed_' + state.user.id, String(isRestricted));
        }
        updateDmButtonState(state.dmsClosed);
      }
      if (profileRes && profileRes.status < 400 && profileRes.data && typeof profileRes.data === 'object') {
        state.profileData = profileRes.data;
        renderProfileBadges();
        renderDashboardEvolution();
      } else {
        renderProfileBadges();
      }
      if (window.refreshBadgeView) {
        window.refreshBadgeView();
      }
      state.dataLoaded = true;
      state.lastDataLoad = Date.now();
      state.lastLoadError = null;
      return { guilds: guilds, rel: rel, channels: channels };
    });
    return accountDataRequest.finally(function () {
      accountDataRequest = null;
    });
  }

  function setMetrics(owned, joined, friends, dms) {
    const ownedEl = byId('metricOwned');
    const joinedEl = byId('metricJoined');
    const friendsEl = byId('metricFriends');
    const dmsEl = byId('metricDMs');
    if (ownedEl) {
      animateCounter(ownedEl, owned);
    }
    if (joinedEl) {
      animateCounter(joinedEl, joined);
    }
    if (friendsEl) {
      animateCounter(friendsEl, friends);
    }
    if (dmsEl) {
      animateCounter(dmsEl, dms);
    }
  }

  function updateMetricsFrom(data) {
    const guilds = data.guilds || [];
    const rel = data.rel || [];
    const channels = data.channels || [];
    const owned = guilds.filter(function (g) {
      return !!g.owner;
    }).length;
    const joined = guilds.length;
    const friends = rel.filter(function (r) {
      return [1, 2, 3, 4, 5].indexOf(Number(r.type)) !== -1;
    }).length;
    const dms = channels.filter(function (c) {
      return c.type === 1 || c.type === 3;
    }).length;
    setMetrics(owned, joined, friends, dms);
  }

  function refreshMetrics() {
    if (!hasAccount()) {
      setMetrics('-', '-', '-', '-');
      return;
    }
    loadAccountData()
      .then(updateMetricsFrom)
      .catch(function () {
        setMetrics('-', '-', '-', '-');
      });
  }

  function refreshAccountStateAfterOp() {
    if (!hasAccount()) {
      return Promise.resolve();
    }
    return loadAccountData()
      .then(function (data) {
        updateMetricsFrom(data);
        renderProfile(state.user);
        renderDetailsView();
        renderEvolutionView();
        renderDashboardEvolution();
        renderProfileBadges();
        if (window.refreshBadgeView) {
          window.refreshBadgeView();
        }
        return data;
      })
      .catch(function () {
        renderProfile(state.user);
        renderDetailsView();
        renderEvolutionView();
        renderDashboardEvolution();
        renderProfileBadges();
        if (window.refreshBadgeView) {
          window.refreshBadgeView();
        }
        return null;
      });
  }

  function applyAccountState() {
    if (!hasAccount()) {
      return;
    }
    syncDmButton();
    renderProfile(state.user);
    renderDetailsView();
    renderEvolutionView();
    renderDashboardEvolution();
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
    const extra = state.accountDetailsData || {};
    const nitroPlan = extra.nitroPlan || nitroTier(u.premium_type);
    const nitroEnds = extra.nitroExpires ? formatDetailsDate(extra.nitroExpires) : (extra.nitroActive ? 'Active; end date unavailable' : 'No active Nitro');
    const rows = [
      ['Account ID', u.id || '-'],
      ['Email', u.email || '-'],
      ['Phone', u.phone || 'Not linked'],
      ['2FA Enabled', u.mfa_enabled ? 'Yes' : 'No'],
      ['Verified', u.verified ? 'Yes' : 'No'],
      ['Creation Date', snowflakeDate(u.id) || '-'],
      ['Nitro Tier', nitroPlan],
      ['Nitro Ends', nitroEnds],
      ['Orbs Balance', extra.orbsAvailable ? String(extra.orbs) : '-'],
      ['Avatar Decorations', extra.countsAvailable ? String(extra.avatarDecorations) : '-'],
      ['Profile Effects', extra.countsAvailable ? String(extra.profileEffects) : '-'],
      ['Name Plates', extra.countsAvailable ? String(extra.namePlates) : '-'],
      ['Profile Frames', extra.countsAvailable ? String(extra.profileFrames) : '-']
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

  function formatDetailsDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    return isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function parseDetailsDate(value) {
    if (!value) {
      return null;
    }
    const normalized = typeof value === 'number' && value < 1000000000000 ? value * 1000 : value;
    const date = normalized instanceof Date ? normalized : new Date(normalized);
    return isNaN(date.getTime()) ? null : date;
  }

  function loadSupplementalAccountDetails() {
    if (!hasAccount()) {
      return Promise.resolve(null);
    }
    if (state.accountDetailsLoading) {
      return Promise.resolve(state.accountDetailsData);
    }
    state.accountDetailsLoading = true;
    const token = state.token;
    const subscriptionEnd = function (sub) {
      if (!sub) {
        return null;
      }
      const direct = parseDetailsDate(sub.current_period_end || sub.expires_at);
      if (direct) {
        return direct;
      }
      const items = Array.isArray(sub.items) ? sub.items : [];
      const itemDates = items.map(function (item) {
        return parseDetailsDate(item && (item.current_period_end || item.expires_at));
      }).filter(function (date) { return !!date; });
      return itemDates.length ? itemDates.sort(function (left, right) { return left.getTime() - right.getTime(); })[0] : null;
    };
    const safeGet = function (path) {
      return apiCall('GET', path).catch(function () { return { status: 0, data: null }; });
    };
    return Promise.all([
      safeGet('/users/@me/billing/subscriptions?_=' + Date.now()),
      safeGet('/users/@me/virtual-currency/balance?_=' + Date.now()),
      safeGet('/users/@me/collectibles-purchases?_=' + Date.now()),
      safeGet('/users/@me/billing/payments?_=' + Date.now())
    ]).then(function (results) {
      if (token !== state.token) {
        state.accountDetailsLoading = false;
        return null;
      }
      const subscriptionData = results[0].data;
      const subscriptions = Array.isArray(subscriptionData) ? subscriptionData : ((subscriptionData && (subscriptionData.subscriptions || subscriptionData.items)) || []);
      const liveSubscriptions = subscriptions.filter(function (sub) {
        const status = String(sub && sub.status !== undefined ? sub.status : '').toLowerCase();
        if (status === '4' || status === 'ended' || status === 'expired' || status === 'inactive') {
          return false;
        }
        const end = subscriptionEnd(sub);
        return end ? end.getTime() > Date.now() : ['0', '1', '2', '3', '6', '7', '8', '9', 'active', 'paid', 'canceled', 'cancelled', 'past_due', 'retry', 'hold', 'paused', ''].indexOf(status) !== -1;
      });
      const nitroSubscriptions = liveSubscriptions.filter(function (sub) {
        return [1, 5, 15].indexOf(Number(sub && sub.type)) !== -1;
      });
      const nitro = nitroSubscriptions.slice().sort(function (left, right) {
        const leftEnd = subscriptionEnd(left);
        const rightEnd = subscriptionEnd(right);
        return (leftEnd ? leftEnd.getTime() : Number.MAX_SAFE_INTEGER) - (rightEnd ? rightEnd.getTime() : Number.MAX_SAFE_INTEGER);
      })[0] || null;
      const nitroItems = nitro && Array.isArray(nitro.items) ? nitro.items : [];
      const knownClassicPlan = nitroItems.some(function (item) { return String(item && item.plan_id) === '978380034091565096'; });
      const premiumType = Number(state.user && state.user.premium_type) || 0;
      const nitroActive = !!nitro || (premiumType > 0 && premiumType !== 3);
      const nitroPlan = nitro ? (knownClassicPlan ? 'Nitro Classic' : 'Nitro') : (premiumType === 3 ? 'Server Boost' : (nitroActive ? nitroTier(premiumType) : 'None'));
      const nitroExpires = nitro ? subscriptionEnd(nitro) : null;

      const balance = results[1].data || {};
      const nestedBalance = balance.virtual_currency || balance.currency || {};
      const orbValue = balance.balance !== undefined ? balance.balance : (balance.orbs !== undefined ? balance.orbs : (balance.orbs_balance !== undefined ? balance.orbs_balance : (balance.virtual_currency_balance !== undefined ? balance.virtual_currency_balance : (balance.amount !== undefined ? balance.amount : (nestedBalance.balance !== undefined ? nestedBalance.balance : (nestedBalance.orbs !== undefined ? nestedBalance.orbs : nestedBalance.amount))))));
      const numericOrbValue = orbValue !== null && orbValue !== undefined && orbValue !== '' && isFinite(Number(orbValue)) ? Number(orbValue) : null;

      const collectionData = results[2].data;
      const collectibles = Array.isArray(collectionData) ? collectionData : ((collectionData && (collectionData.purchases || collectionData.items)) || []);
      const counts = { avatarDecorations: 0, profileEffects: 0, namePlates: 0, profileFrames: 0 };
      collectibles.forEach(function (item) {
        const id = String(item && (item.sku_id || item.id) || '').toLowerCase();
        const type = Number(item && item.type);
        if (type === 0 || id.indexOf('avatar_decoration') !== -1) counts.avatarDecorations += 1;
        else if (type === 1 || id.indexOf('profile_effect') !== -1) counts.profileEffects += 1;
        else if (type === 2 || id.indexOf('name_plate') !== -1) counts.namePlates += 1;
        else if (type === 3 || id.indexOf('profile_frame') !== -1) counts.profileFrames += 1;
      });

      const payments = Array.isArray(results[3].data) ? results[3].data : [];
      const giftIds = {};
      payments.forEach(function (payment) {
        const description = String(payment && payment.description || '').toLowerCase();
        const sku = String(payment && payment.sku_id || '').toLowerCase();
        const successful = payment && (payment.status === 1 || (payment.status === undefined && Number(payment.amount) > 0));
        if (successful && payment.id && (description.indexOf('gift') !== -1 || description.indexOf('gifting') !== -1 || sku.indexOf('gift') !== -1)) {
          giftIds[payment.id] = true;
        }
      });
      const giftCount = results[3].status >= 200 && results[3].status < 300 ? Object.keys(giftIds).length : (Number(state.user.gifts) || 0);
      state.user.gifts = giftCount;
      state.accountDetailsData = {
        nitroActive: nitroActive,
        nitroPlan: nitroPlan,
        nitroExpires: nitroExpires,
        orbs: numericOrbValue,
        orbsAvailable: numericOrbValue !== null,
        countsAvailable: results[2].status >= 200 && results[2].status < 300,
        avatarDecorations: counts.avatarDecorations,
        profileEffects: counts.profileEffects,
        namePlates: counts.namePlates,
        profileFrames: counts.profileFrames
      };
      renderDetailsView();
      renderProfileBadges();
      state.accountDetailsLoading = false;
      return state.accountDetailsData;
    }).catch(function () {
      state.accountDetailsLoading = false;
      return null;
    });
  }

  /* ---------- Dedicated Boost & Nitro Evolution Engine ---------- */

  const BOOST_MILESTONES = [
    { level: 1, months: 1, name: 'Level 1 Booster', image: 'assets/images/badges/boost_badges/discordboost1.svg', req: '', desc: 'Initial Server Booster milestone' },
    { level: 2, months: 2, name: 'Level 2 Booster', image: 'assets/images/badges/boost_badges/discordboost2.svg', req: '', desc: '2 months of consecutive server boosting' },
    { level: 3, months: 3, name: 'Level 3 Booster', image: 'assets/images/badges/boost_badges/discordboost3.svg', req: '', desc: '3 months of active server boosting' },
    { level: 4, months: 6, name: 'Level 4 Booster', image: 'assets/images/badges/boost_badges/discordboost4.svg', req: '', desc: 'Half-year server booster milestone' },
    { level: 5, months: 9, name: 'Level 5 Booster', image: 'assets/images/badges/boost_badges/discordboost5.svg', req: '', desc: '9 months of continuous server boosting' },
    { level: 6, months: 12, name: 'Level 6 Booster', image: 'assets/images/badges/boost_badges/discordboost6.svg', req: '', desc: '1 full year server booster achievement' },
    { level: 7, months: 15, name: 'Level 7 Booster', image: 'assets/images/badges/boost_badges/discordboost7.svg', req: '', desc: '15 months of dedicated server boosting' },
    { level: 8, months: 18, name: 'Level 8 Booster', image: 'assets/images/badges/boost_badges/discordboost8.svg', req: '', desc: '1.5 years of continuous boosting' },
    { level: 9, months: 24, name: 'Level 9 Booster', image: 'assets/images/badges/boost_badges/discordboost9.svg', req: '', desc: 'Supreme 2-year Server Booster badge' }
  ];

  const NITRO_MILESTONES = [
    { level: 1, months: 1, name: 'Bronze', image: 'assets/images/badges/nitro_badges/bronze.png', req: '', desc: '1 month of Discord Nitro tenure' },
    { level: 2, months: 3, name: 'Silver', image: 'assets/images/badges/nitro_badges/silver.png', req: '', desc: '3 months of Discord Nitro tenure' },
    { level: 3, months: 6, name: 'Gold', image: 'assets/images/badges/nitro_badges/gold.png', req: '', desc: '6 months of Discord Nitro tenure' },
    { level: 4, months: 12, name: 'Platinum', image: 'assets/images/badges/nitro_badges/platinum.png', req: '', desc: '1 full year of Discord Nitro tenure' },
    { level: 5, months: 24, name: 'Diamond', image: 'assets/images/badges/nitro_badges/diamond.png', req: '', desc: '2 years of Discord Nitro tenure' },
    { level: 6, months: 36, name: 'Emerald', image: 'assets/images/badges/nitro_badges/emerald.png', req: '', desc: '3 years of Discord Nitro tenure' },
    { level: 7, months: 60, name: 'Ruby', image: 'assets/images/badges/nitro_badges/ruby.png', req: '', desc: '5 years of Discord Nitro tenure' },
    { level: 8, months: 72, name: 'Opal', image: 'assets/images/badges/nitro_badges/opal.png', req: '', desc: 'Apex 6-year Discord Nitro subscriber badge' }
  ];

  function parseBadgeDate(desc) {
    if (!desc || typeof desc !== 'string') return null;
    const cleaned = desc.replace(/^.*?(since|منذ|from)\s+/i, '').trim();
    if (cleaned) {
      const d = new Date(cleaned);
      if (!isNaN(d.getTime())) {
        return d;
      }
    }
    const match = desc.match(/(?:since|منذ|from)\s+([A-Za-z]+ \d{1,2},? \d{4}|\d{1,2} [A-Za-z]+ \d{4}|[A-Za-z]+ \d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (match && match[1]) {
      const d = new Date(match[1]);
      if (!isNaN(d.getTime())) {
        return d;
      }
    }
    return null;
  }

  function getEvolutionData(type) {
    const u = state.user || {};
    const prof = state.profileData || {};
    const isBoost = type === 'boost';

    const pBadges = (Array.isArray(prof.badges) ? prof.badges : (Array.isArray(u.badges) ? u.badges : []));

    let detectedLevel = -1;
    let detectedStartDate = null;
    let hasBadgeFound = false;

    // Check direct ISO dates first
    const directDateIso = isBoost
      ? (u.premium_guild_since || prof.premium_guild_since || (prof.user && prof.user.premium_guild_since))
      : (u.premium_since || prof.premium_since || (prof.user && prof.user.premium_since));

    if (directDateIso) {
      const d = new Date(directDateIso);
      if (!isNaN(d.getTime())) {
        detectedStartDate = d;
      }
    }

    if (isBoost) {
      pBadges.forEach(function (b) {
        if (!b) return;
        const rawId = String(b.id || b.key || '').toLowerCase();
        const desc = String(b.description || b.title || '');

        if (rawId.indexOf('guild_booster') !== -1 || rawId.indexOf('boost') !== -1 || desc.toLowerCase().indexOf('booster') !== -1) {
          hasBadgeFound = true;

          if (!detectedStartDate) {
            const parsed = parseBadgeDate(desc);
            if (parsed) detectedStartDate = parsed;
          }

          if (rawId.indexOf('lvl1') !== -1 || rawId.indexOf('level_1') !== -1 || rawId.indexOf('level 1') !== -1) detectedLevel = Math.max(detectedLevel, 0);
          else if (rawId.indexOf('lvl2') !== -1 || rawId.indexOf('level_2') !== -1 || rawId.indexOf('level 2') !== -1) detectedLevel = Math.max(detectedLevel, 1);
          else if (rawId.indexOf('lvl3') !== -1 || rawId.indexOf('level_3') !== -1 || rawId.indexOf('level 3') !== -1) detectedLevel = Math.max(detectedLevel, 2);
          else if (rawId.indexOf('lvl4') !== -1 || rawId.indexOf('level_4') !== -1 || rawId.indexOf('level 4') !== -1) detectedLevel = Math.max(detectedLevel, 3);
          else if (rawId.indexOf('lvl5') !== -1 || rawId.indexOf('level_5') !== -1 || rawId.indexOf('level 5') !== -1) detectedLevel = Math.max(detectedLevel, 4);
          else if (rawId.indexOf('lvl6') !== -1 || rawId.indexOf('level_6') !== -1 || rawId.indexOf('level 6') !== -1) detectedLevel = Math.max(detectedLevel, 5);
          else if (rawId.indexOf('lvl7') !== -1 || rawId.indexOf('level_7') !== -1 || rawId.indexOf('level 7') !== -1) detectedLevel = Math.max(detectedLevel, 6);
          else if (rawId.indexOf('lvl8') !== -1 || rawId.indexOf('level_8') !== -1 || rawId.indexOf('level 8') !== -1) detectedLevel = Math.max(detectedLevel, 7);
          else if (rawId.indexOf('lvl9') !== -1 || rawId.indexOf('level_9') !== -1 || rawId.indexOf('level 9') !== -1) detectedLevel = Math.max(detectedLevel, 8);
          else if (detectedLevel === -1) {
            detectedLevel = 0;
          }
        }
      });
    } else {
      pBadges.forEach(function (b) {
        if (!b) return;
        const rawId = String(b.id || b.key || '').toLowerCase();
        const desc = String(b.description || b.title || '');

        if (rawId.indexOf('premium') !== -1 || rawId.indexOf('nitro') !== -1 || desc.toLowerCase().indexOf('subscriber') !== -1 || desc.toLowerCase().indexOf('nitro') !== -1) {
          hasBadgeFound = true;

          if (!detectedStartDate) {
            const parsed = parseBadgeDate(desc);
            if (parsed) detectedStartDate = parsed;
          }

          const lowerDesc = (desc + ' ' + rawId).toLowerCase();
          if (lowerDesc.indexOf('opal') !== -1) detectedLevel = Math.max(detectedLevel, 7);
          else if (lowerDesc.indexOf('ruby') !== -1) detectedLevel = Math.max(detectedLevel, 6);
          else if (lowerDesc.indexOf('emerald') !== -1) detectedLevel = Math.max(detectedLevel, 5);
          else if (lowerDesc.indexOf('diamond') !== -1) detectedLevel = Math.max(detectedLevel, 4);
          else if (lowerDesc.indexOf('platinum') !== -1) detectedLevel = Math.max(detectedLevel, 3);
          else if (lowerDesc.indexOf('gold') !== -1) detectedLevel = Math.max(detectedLevel, 2);
          else if (lowerDesc.indexOf('silver') !== -1) detectedLevel = Math.max(detectedLevel, 1);
          else if (lowerDesc.indexOf('bronze') !== -1) detectedLevel = Math.max(detectedLevel, 0);
        }
      });

      if (!hasBadgeFound && u.premium_type && u.premium_type > 0) {
        hasBadgeFound = true;
      }
    }

    const milestones = isBoost ? BOOST_MILESTONES : NITRO_MILESTONES;
    const hasActive = hasBadgeFound || !!detectedStartDate || (isBoost ? !!(u.premium_guild_since || prof.premium_guild_since) : !!(u.premium_type && u.premium_type > 0));
    const hasAnyMembershipData = !!(u.premium_type || u.premium_guild_since || prof.premium_type || prof.premium_guild_since || (prof.user && (prof.user.premium_type || prof.user.premium_guild_since)) || pBadges && pBadges.length);

    const now = new Date();
    let totalDays = 0;
    let totalMonths = 0;

    if (detectedStartDate) {
      const elapsedMs = Math.max(0, now.getTime() - detectedStartDate.getTime());
      totalDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
      totalMonths = Math.floor(totalDays / 30.4375);
    } else if (detectedLevel >= 0) {
      totalMonths = milestones[detectedLevel].months;
      totalDays = Math.round(totalMonths * 30.4375);
      detectedStartDate = new Date(now.getTime() - totalDays * 24 * 60 * 60 * 1000);
    }

    let activeTierIndex = -1;
    if (detectedStartDate) {
      for (let i = milestones.length - 1; i >= 0; i--) {
        if (totalMonths >= milestones[i].months) {
          activeTierIndex = i;
          break;
        }
      }
    }
    if (activeTierIndex === -1 && detectedLevel >= 0) {
      activeTierIndex = detectedLevel;
    }
    if (activeTierIndex === -1 && hasActive) {
      activeTierIndex = 0;
    }

    if (detectedLevel > activeTierIndex) {
      activeTierIndex = detectedLevel;
    }

    if (!hasAnyMembershipData && !hasActive) {
      activeTierIndex = -1;
    }

    const nextMilestoneIndex = (activeTierIndex >= 0 && activeTierIndex + 1 < milestones.length) ? activeTierIndex + 1 : -1;
    const nextMilestone = nextMilestoneIndex !== -1 ? milestones[nextMilestoneIndex] : null;

    let progressPct = 0;
    let nextRemainingDays = 0;
    let nextRemainingMonths = 0;
    let nextUnlockDate = null;

    if (nextMilestone && detectedStartDate) {
      const targetDate = new Date(detectedStartDate.getTime());
      targetDate.setMonth(targetDate.getMonth() + nextMilestone.months);
      nextUnlockDate = targetDate;
      const remMs = targetDate.getTime() - now.getTime();
      nextRemainingDays = Math.max(0, Math.ceil(remMs / (1000 * 60 * 60 * 24)));
      nextRemainingMonths = Math.floor(nextRemainingDays / 30.4375);

      const prevMonths = activeTierIndex >= 0 ? milestones[activeTierIndex].months : 0;
      const totalSpanMonths = Math.max(1, nextMilestone.months - prevMonths);
      const progressMonths = Math.max(0, totalMonths - prevMonths);
      progressPct = Math.max(4, Math.min(96, Math.round((progressMonths / totalSpanMonths) * 100)));
    } else if (activeTierIndex === milestones.length - 1) {
      progressPct = 100;
    }

    return {
      type: type,
      isBoost: isBoost,
      hasActive: hasActive,
      startDate: detectedStartDate,
      totalDays: totalDays,
      totalMonths: totalMonths,
      activeTierIndex: activeTierIndex,
      activeBadge: activeTierIndex >= 0 ? milestones[activeTierIndex] : null,
      nextMilestone: nextMilestone,
      nextMilestoneIndex: nextMilestoneIndex,
      nextUnlockDate: nextUnlockDate,
      nextRemainingDays: nextRemainingDays,
      nextRemainingMonths: nextRemainingMonths,
      progressPct: progressPct,
      milestones: milestones
    };
  }

  function formatTimeRemaining(daysTotal) {
    if (daysTotal <= 0) return 'Unlocked';
    return daysTotal + (daysTotal === 1 ? ' day' : ' days');
  }

  function getMilestoneCountdown(evoData, milestone) {
    if (!evoData.startDate) {
      return {
        status: 'No Active Subscription',
        timeText: 'Requires active ' + (evoData.isBoost ? 'Server Boost' : 'Discord Nitro'),
        dateText: 'Start date not detected in profile'
      };
    }
    const now = new Date();
    const targetDate = new Date(evoData.startDate.getTime());
    targetDate.setMonth(targetDate.getMonth() + milestone.months);

    const diffMs = targetDate.getTime() - now.getTime();
    if (diffMs <= 0) {
      const unlockedDays = Math.floor((now.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
      return {
        status: 'Achieved',
        timeText: 'Unlocked ' + (unlockedDays === 0 ? 'today!' : unlockedDays + ' days ago'),
        dateText: 'Achieved on ' + targetDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      };
    }

    const totalDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const timeFormatted = formatTimeRemaining(totalDays);

    return {
      status: 'Upcoming Milestone',
      timeText: timeFormatted + ' remaining (' + totalDays + ' days total)',
      dateText: 'Will unlock on ' + targetDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    };
  }

  function renderDashboardEvolution() {
    const nitroData = getEvolutionData('nitro');
    const boostData = getEvolutionData('boost');

    function setCardSummary(cardId, titleId, statusId, imageId, data, type) {
      const titleEl = byId(titleId);
      const statusEl = byId(statusId);
      const cardEl = byId(cardId);
      const imageEl = byId(imageId);
      const defaultImage = type === 'boost'
        ? 'assets/images/badges/boost_badges/discordboost1.svg'
        : 'assets/images/badges/discordnitro.svg';
      const nextBadge = data.nextMilestone || data.activeBadge || null;

      if (imageEl) {
        if (!data.hasActive) {
          imageEl.src = defaultImage;
          imageEl.style.display = 'block';
        } else if (nextBadge && nextBadge.image) {
          imageEl.src = nextBadge.image;
          imageEl.style.display = 'block';
        } else {
          imageEl.src = defaultImage;
          imageEl.style.display = 'block';
        }
      }

      if (titleEl) {
        if (!data.hasActive) {
          titleEl.textContent = type === 'boost' ? 'Level 1 Booster' : 'Bronze';
        } else if (nextBadge) {
          titleEl.textContent = nextBadge.name;
        } else {
          titleEl.textContent = type === 'boost' ? 'Boost Badge' : 'Nitro Badge';
        }
      }

      if (statusEl) {
        if (data.hasActive) {
          statusEl.textContent = data.nextMilestone
            ? (data.nextMilestone.name + ' in ' + formatTimeRemaining(data.nextRemainingDays))
            : 'Maximum tier reached';
          statusEl.classList.remove('inactive');
        } else {
          statusEl.textContent = type === 'boost' ? 'No active server boost' : 'No active Nitro';
          statusEl.classList.add('inactive');
        }
      }

      if (cardEl) {
        cardEl.classList.toggle('is-inactive', !data.hasActive);
      }
    }

    setCardSummary('boostProgressCard', 'boostCalcTitle', 'boostCalcStatus', 'boostBadgeImage', boostData, 'boost');
    setCardSummary('nitroProgressCard', 'nitroCalcTitle', 'nitroCalcStatus', 'nitroBadgeImage', nitroData, 'nitro');
  }


  function renderEvolutionDashboard() {
    const activeType = state.evolutionType || 'nitro';
    const evoData = getEvolutionData(activeType);
    const user = state.user || {};
    state.selectedEvolutionMilestone = null;
    const panel = document.querySelector('.evolution-panel');
    if (panel) {
      panel.classList.toggle('is-inactive', !evoData.hasActive);
    }

    const selectorButtons = document.querySelectorAll('[data-evolution-type]');
    selectorButtons.forEach(function (button) {
      const isActive = button.getAttribute('data-evolution-type') === activeType;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });

    const inactiveTitle = activeType === 'boost' ? 'Boost badge' : 'Nitro badge';
    let inactiveLabel = byId('evoInactiveTitle');
    if (!inactiveLabel) {
      inactiveLabel = document.createElement('div');
      inactiveLabel.id = 'evoInactiveTitle';
      inactiveLabel.className = 'evo-inactive-title';
      const header = document.querySelector('.evolution-header-center');
      if (header) {
        header.insertBefore(inactiveLabel, header.firstChild);
      }
    }
    if (inactiveLabel) {
      inactiveLabel.textContent = inactiveTitle;
      inactiveLabel.style.display = evoData.hasActive ? 'none' : 'block';
    }

    const avatarEl = byId('evoUserAvatar');
    if (avatarEl) {
      const avatar = avatarUrl(user, 128) || 'https://cdn.discordapp.com/embed/avatars/' + (((user.id || '0').split('').reduce(function (sum, ch) { return sum + ch.charCodeAt(0); }, 0) % 5) || 0) + '.png';
      avatarEl.style.backgroundImage = 'url("' + avatar + '")';
      avatarEl.style.backgroundSize = 'cover';
      avatarEl.style.backgroundPosition = 'center';
      avatarEl.setAttribute('title', user.global_name || user.username || 'Discord User');
    }

    const nameEl = byId('evoUserName');
    if (nameEl) {
      nameEl.textContent = user.global_name || user.username || 'Discord User';
    }

    const statusEl = byId('evoUserStatus');
    if (statusEl) {
      statusEl.textContent = evoData.hasActive
        ? (activeType === 'boost' ? 'Server boost active' : 'Nitro active')
        : 'No active cycle';
    }

    const fillEl = byId('evoProgressFill');
    if (fillEl) {
      fillEl.style.width = evoData.hasActive ? ((evoData.progressPct || 0) + '%') : '0%';
    }

    const valueEl = byId('evoProgressText');
    if (valueEl) {
      valueEl.textContent = evoData.hasActive ? ((evoData.progressPct || 0) + '%') : '0%';
    }

    const badgeEl = byId('evoCurrentBadge');
    const activeBadge = evoData.activeBadge || (evoData.milestones && evoData.milestones[0]);
    const fallbackMilestone = (evoData.milestones && evoData.milestones[0]) || null;
    const selectedMilestone = state.selectedEvolutionMilestone || null;
    const inactiveDefault = activeType === 'boost' ? 'Level 1 Booster' : 'Bronze';
    const displayMilestone = selectedMilestone || evoData.nextMilestone || activeBadge || fallbackMilestone;

    if (badgeEl) {
      if (!evoData.hasActive) {
        badgeEl.removeAttribute('src');
        badgeEl.alt = inactiveDefault;
        badgeEl.style.display = 'none';
      } else if (displayMilestone && displayMilestone.image) {
        badgeEl.src = displayMilestone.image;
        badgeEl.alt = displayMilestone.name || 'Next badge';
        badgeEl.style.display = 'block';
      }
    }

    const labelEl = byId('evoProgressLabel');
    if (labelEl) {
      if (!evoData.hasActive) {
        labelEl.textContent = 'No active ' + (activeType === 'boost' ? 'server boost' : 'Nitro');
      } else if (displayMilestone) {
        labelEl.textContent = displayMilestone.name;
      } else {
        labelEl.textContent = 'No badge';
      }
    }

    const metaEl = byId('evoProgressMeta');
    if (metaEl) {
      if (!evoData.hasActive) {
        metaEl.textContent = 'No active ' + (activeType === 'boost' ? 'server boost' : 'Nitro');
      } else if (selectedMilestone) {
        const targetDate = new Date((evoData.startDate || new Date()).getTime());
        targetDate.setMonth(targetDate.getMonth() + selectedMilestone.months);
        const diffMs = targetDate.getTime() - Date.now();
        const remainingDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        const badgeStatus = diffMs <= 0 ? 'Unlocked now' : formatTimeRemaining(remainingDays);
        metaEl.textContent = selectedMilestone.name + ' • ' + badgeStatus;
      } else if (evoData.nextMilestone) {
        const remaining = evoData.nextRemainingDays > 0 ? formatTimeRemaining(evoData.nextRemainingDays) : 'Unlocked now';
        metaEl.textContent = 'Next badge: ' + evoData.nextMilestone.name + ' • ' + remaining;
      } else if (activeBadge) {
        metaEl.textContent = 'Maximum tier reached • ' + activeBadge.name;
      } else {
        metaEl.textContent = 'No active ' + (activeType === 'boost' ? 'server boost' : 'Nitro');
      }
    }

    const timeline = byId('evoTimelineNodes');
    if (timeline) {
      timeline.innerHTML = '';
      (evoData.milestones || []).forEach(function (milestone, idx) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'evo-timeline-node';
        const isCurrent = idx === evoData.activeTierIndex;
        const isAchieved = idx <= (evoData.activeTierIndex || -1);
        const isSelected = !!state.selectedEvolutionMilestone && state.selectedEvolutionMilestone.name === milestone.name;

        if (isCurrent) {
          item.classList.add('current');
        } else if (isAchieved) {
          item.classList.add('achieved');
        }

        if (isSelected) {
          item.classList.add('selected');
        }

        item.innerHTML = [
          '<span class="evo-node-icon"><img src="' + milestone.image + '" alt="' + milestone.name + '" /></span>',
          '<span class="evo-node-copy">',
          '<span class="evo-node-title">' + milestone.name + '</span>',
          '</span>'
        ].join('');

        item.addEventListener('click', function () {
          state.evolutionType = activeType;
          state.selectedEvolutionMilestone = milestone;

          const detailBox = byId('evoSelectedMilestoneBox');
          if (detailBox) {
            detailBox.style.display = 'none';
          }

          renderEvolutionDashboard();
        });

        timeline.appendChild(item);
      });
    }
  }

  function initEvolutionDashboard() {
    const selector = byId('evolutionTypeSelector');
    const boostBtn = byId('calculateBoostBtn');
    const nitroBtn = byId('calculateNitroBtn');

    function applyEvolutionType(type) {
      state.evolutionType = type || 'nitro';
      state.selectedEvolutionMilestone = null;
      renderEvolutionDashboard();
    }

    if (selector) {
      selector.addEventListener('click', function (event) {
        const trigger = event.target && event.target.closest ? event.target.closest('[data-evolution-type]') : null;
        if (!trigger) {
          return;
        }
        applyEvolutionType(trigger.getAttribute('data-evolution-type') || 'nitro');
      });
    }

    if (boostBtn) {
      boostBtn.addEventListener('click', function () {
        applyEvolutionType('boost');
      });
    }

    if (nitroBtn) {
      nitroBtn.addEventListener('click', function () {
        applyEvolutionType('nitro');
      });
    }

    renderEvolutionDashboard();
  }

  function renderEvolutionView() {
    renderDashboardEvolution();
    renderEvolutionDashboard();
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

  function setCurrentOperation(title, summary) {
    state.currentOperationTitle = title || '';
    const bar = byId('currentOperationBar');
    const titleEl = byId('currentOperationTitle');
    const summaryEl = byId('currentOperationSummary');
    if (titleEl) titleEl.textContent = title || 'Operation';
    if (summaryEl) summaryEl.textContent = summary || 'Preparing...';
    if (bar) bar.hidden = !(state.running && title);
  }

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
    if (/^Left server:|^Removed relationship:|^Closed DM|^Completed:|^Operation completed/.test(text)) {
      li.classList.add('term-success');
    } else if (/^Could not |^Failed:/.test(text)) {
      li.classList.add('term-error');
    } else if (/^\[\d+\/\d+\]/.test(text)) {
      li.classList.add('term-progress');
    }
    li.innerHTML = '<span class="term-time">' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds()) + '</span><span class="term-text"></span>';
    li.querySelector('.term-text').textContent = text;
    terminalLog.appendChild(li);
    terminalLog.scrollTop = terminalLog.scrollHeight;
    state.opLines.push(text);
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
    if (state.currentOperationTitle) {
      setCurrentOperation(state.currentOperationTitle, cur + ' / ' + total + ' • ' + pct + '%');
    }
  }

  function resetTerminal(title) {
    state.opLines = [];
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

  function opHistoryKey() {
    const uid = state.user && state.user.id;
    return uid ? 'opHistory_' + uid : '';
  }

  function getOperationHistory() {
    const key = opHistoryKey();
    if (!key) {
      return [];
    }
    return jsonGet(localStorage, key) || [];
  }

  function recordOperationHistory(customTitle) {
    if (!state.opLines.length) {
      return;
    }
    const key = opHistoryKey();
    if (!key) {
      state.opLines = [];
      return;
    }
    const record = {
      id: Date.now(),
      ts: Date.now(),
      title: customTitle || '',
      lines: state.opLines.slice()
    };
    let history = getOperationHistory();
    history.unshift(record);
    if (history.length > 20) {
      history.length = 20;
    }
    history.forEach(function (rec) {
      if (rec.lines && rec.lines.length > 200) {
        rec.lines.length = 200;
      }
    });
    jsonSet(localStorage, key, history.slice(0, 20));
    state.opLines = [];
  }

  function openHistory() {
    openModal();
    const list = byId('historyList');
    const count = byId('historyCount');
    const accountsHost = byId('historyAccounts');
    const savedAccounts = loadAccounts();
    const accountSummaries = [];
    const allEntries = [];
    savedAccounts.forEach(function (account) {
      const user = account.user || {};
      const accountId = user.id ? String(user.id) : (parseUserIdFromToken(account.token) || '');
      const accountHistory = accountId ? (jsonGet(localStorage, 'opHistory_' + accountId) || []) : [];
      const actionCount = accountHistory.reduce(function (total, entry) {
        return total + (Array.isArray(entry.lines) ? entry.lines.length : Number(entry.items) || 0);
      }, 0);
      accountSummaries.push({
        username: account.username || user.global_name || user.username || 'Unknown account',
        id: accountId,
        operations: accountHistory.length,
        actions: actionCount
      });
      accountHistory.forEach(function (entry) {
        allEntries.push({ account: account.username || user.global_name || user.username || 'Unknown account', entry: entry });
      });
    });
    if (!accountSummaries.length && state.user && state.user.id) {
      const currentHistory = getOperationHistory();
      accountSummaries.push({
        username: state.user.global_name || state.user.username || 'Current account',
        id: String(state.user.id),
        operations: currentHistory.length,
        actions: currentHistory.reduce(function (total, entry) {
          return total + (Array.isArray(entry.lines) ? entry.lines.length : Number(entry.items) || 0);
        }, 0)
      });
      currentHistory.forEach(function (entry) {
        allEntries.push({ account: state.user.global_name || state.user.username || 'Current account', entry: entry });
      });
    }
    if (!allEntries.length) {
      const legacyHistory = jsonGet(localStorage, CONFIG.dsc.history) || [];
      legacyHistory.forEach(function (entry) {
        allEntries.push({ account: 'Current account', entry: entry });
      });
    }
    if (count) {
      count.textContent = allEntries.length + (allEntries.length === 1 ? ' record' : ' records');
    }
    if (accountsHost) {
      accountsHost.innerHTML = '';
      if (!accountSummaries.length) {
        const emptyAccounts = document.createElement('div');
        emptyAccounts.className = 'history-account-empty';
        emptyAccounts.textContent = 'No saved accounts found.';
        accountsHost.appendChild(emptyAccounts);
      } else {
        accountSummaries.forEach(function (summary) {
          const card = document.createElement('article');
          card.className = 'history-account';
          const name = document.createElement('strong');
          name.textContent = summary.username;
          const id = document.createElement('span');
          id.className = 'history-account-id';
          id.textContent = summary.id ? 'ID ' + summary.id : 'Account ID unavailable';
          const stats = document.createElement('span');
          stats.className = 'history-account-stats';
          stats.textContent = summary.operations + (summary.operations === 1 ? ' operation' : ' operations') + ' \u2022 ' + summary.actions + (summary.actions === 1 ? ' logged action' : ' logged actions');
          card.appendChild(name);
          card.appendChild(id);
          card.appendChild(stats);
          accountsHost.appendChild(card);
        });
      }
    }
    if (!list) {
      return;
    }
    list.innerHTML = '';
    if (!allEntries.length) {
      const empty = document.createElement('li');
      empty.className = 'modal-item';
      empty.textContent = 'No operations have run yet.';
      list.appendChild(empty);
      return;
    }
    allEntries.forEach(function (record) {
      const entry = record.entry;
      const li = document.createElement('li');
      li.className = 'modal-item';
      const when = new Date(entry.ts || entry.at || entry.id).toLocaleString();
      const detail = Array.isArray(entry.lines)
        ? entry.lines.length + (entry.lines.length === 1 ? ' line' : ' lines')
        : entry.items + (entry.items === 1 ? ' item' : ' items');
      li.innerHTML = '<span class="modal-item-main"><strong></strong><span class="modal-item-sub"></span></span>';
      li.querySelector('strong').textContent = entry.title;
      li.querySelector('.modal-item-sub').textContent = record.account + ' \u00b7 ' + when + ' \u00b7 ' + detail;
      list.appendChild(li);
    });
  }

  function currentDelay() {
    const speed = storageGet2(localStorage, CONFIG.dsc.speed, 'normal');
    return SPEED_MS[speed] || SPEED_MS.normal;
  }

  function loadWhitelists() {
    const empty = { servers: [], friends: [], dms: [] };
    const accountId = state.user && state.user.id ? String(state.user.id) : '';
    const all = jsonGet(localStorage, CONFIG.dsc.whitelistsByAccount) || {};
    if (!accountId) {
      return empty;
    }
    if (!all[accountId]) {
      const legacy = jsonGet(localStorage, CONFIG.dsc.whitelists);
      if (legacy && !storageGet(localStorage, CONFIG.dsc.whitelists + '.migrated')) {
        all[accountId] = {
          servers: Array.isArray(legacy.servers) ? legacy.servers.slice() : [],
          friends: Array.isArray(legacy.friends) ? legacy.friends.slice() : [],
          dms: Array.isArray(legacy.dms) ? legacy.dms.slice() : []
        };
        jsonSet(localStorage, CONFIG.dsc.whitelistsByAccount, all);
        storageSet(localStorage, CONFIG.dsc.whitelists + '.migrated', '1');
        localStorage.removeItem(CONFIG.dsc.whitelists);
      }
    }
    const accountWhitelist = all[accountId] || empty;
    return {
      servers: Array.isArray(accountWhitelist.servers) ? accountWhitelist.servers : [],
      friends: Array.isArray(accountWhitelist.friends) ? accountWhitelist.friends : [],
      dms: Array.isArray(accountWhitelist.dms) ? accountWhitelist.dms : []
    };
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

  function setWhitelist(kind, value, enabled) {
    if (!value) {
      return;
    }
    const wl = loadWhitelists();
    const list = Array.isArray(wl[kind]) ? wl[kind].slice() : [];
    const needle = String(value).trim().toLowerCase();
    const index = list.findIndex(function (entry) {
      return String(entry || '').trim().toLowerCase() === needle;
    });
    if (enabled && index === -1) {
      list.push(String(value));
    } else if (!enabled && index !== -1) {
      list.splice(index, 1);
    }
    wl[kind] = list;
    const accountId = state.user && state.user.id ? String(state.user.id) : '';
    if (!accountId) {
      toast('Log in before changing account whitelists.', 'warning');
      return;
    }
    const all = jsonGet(localStorage, CONFIG.dsc.whitelistsByAccount) || {};
    all[accountId] = wl;
    jsonSet(localStorage, CONFIG.dsc.whitelistsByAccount, all);
    applyWhitelists();
  }

  function whitelistKindForItem(item) {
    if (item.isServer) {
      return 'servers';
    }
    if (item.recipientId || item.isGroup) {
      return 'dms';
    }
    return 'friends';
  }

  function friendName(r) {
    return r && r.user && (r.user.username || 'user') + ' (' + r.id + ')';
  }

  function getRelationshipTypeLabel(type) {
    switch (Number(type)) {
      case 1:
        return 'Friend';
      case 2:
        return 'Blocked';
      case 3:
        return 'Pending In';
      case 4:
        return 'Pending Out';
      case 5:
        return 'Ignored';
      default:
        return 'Relationship';
    }
  }

  function getRelationshipActionLabel(type) {
    switch (Number(type)) {
      case 2:
        return 'Unblock';
      case 3:
        return 'Decline';
      case 4:
        return 'Cancel Request';
      case 5:
        return 'Unignore';
      default:
        return 'Remove Friend';
    }
  }

  function getRemoveFriendCandidates() {
    const whitelist = function (rel) {
      if (!rel || !rel.id) {
        return false;
      }
      if (inWl('friends', rel.id) || inWl('friends', rel.user && rel.user.username)) {
        return true;
      }
      return false;
    };

    return (state.rel || []).filter(function (r) {
      if (!r || !r.id || whitelist(r)) {
        return false;
      }
      return [1, 2, 3, 4, 5].indexOf(Number(r.type)) !== -1;
    }).map(function (r) {
      const user = r.user || {};
      const username = user.global_name || user.username || 'User';
      const discrim = (user.discriminator && user.discriminator !== '0') ? '#' + user.discriminator : '';
      const displayName = username + discrim;
      return {
        id: r.id,
        name: displayName,
        label: 'Remove ' + getRelationshipTypeLabel(r.type).toLowerCase() + ': ' + displayName + ' (' + r.id + ')',
        relationshipType: getRelationshipTypeLabel(r.type),
        type: Number(r.type),
        reason: 'Ready'
      };
    });
  }

  function getLeaveServerCandidates() {
    return (state.guilds || []).map(function (g) {
      const name = g.name || g.id;
      const leaveable = !g.owner && !inWl('servers', g.id);
      return {
        id: g.id,
        name: name,
        leaveable: leaveable,
        reason: g.owner ? 'Owned by account' : (inWl('servers', g.id) ? 'Whitelisted' : 'Ready')
      };
    });
  }

  function buildLeaveItems() {
    return getLeaveServerCandidates().filter(function (entry) {
      return entry.leaveable;
    }).map(function (entry) {
      return {
        label: 'Leave server: ' + entry.name + ' (' + entry.id + ')',
        name: entry.name,
        id: entry.id,
        action: function () {
          return apiCall('DELETE', '/users/@me/guilds/' + entry.id);
        }
      };
    });
  }

  function buildFriendItems() {
    return getRemoveFriendCandidates().map(function (entry) {
      return {
        label: entry.label,
        name: entry.name,
        id: entry.id,
        type: entry.type,
        action: function () {
          return apiCall('DELETE', '/users/@me/relationships/' + entry.id);
        }
      };
    });
  }

  function buildDmItems() {
    const items = [];
    const channels = (state.channels || []).filter(function (c) {
      const recipient = c.recipients && c.recipients[0];
      const name = c.type === 3 ? c.name : (recipient && (recipient.username || recipient.global_name));
      return (c.type === 1 || c.type === 3) && !inWl('dms', c.id) && !inWl('dms', name);
    });
    if (channels.length > 0) {
      channels.forEach(function (c) {
        const isGroup = c.type === 3;
        const recipientName = isGroup
          ? (c.name || 'Group Chat (' + ((c.recipients && c.recipients.length) || 0) + ' members)')
          : ((c.recipients && c.recipients[0] && (c.recipients[0].username || c.recipients[0].id)) || c.name || c.id);
        items.push({
          label: (isGroup ? 'Leave Group DM: ' : 'Close DM: ') + recipientName + ' (' + c.id + ')',
          dmName: recipientName,
          dmId: c.id,
          action: function () {
            return apiCall('DELETE', '/channels/' + c.id).then(function (res) {
              if (res.status >= 200 && res.status < 300) {
                state.channels = (state.channels || []).filter(function (channel) {
                  return channel.id !== c.id;
                });
                updateMetricsFrom(state);
              }
              return res;
            });
          }
        });
      });
    } else {
      (state.rel || []).forEach(function (r) {
        if (r.type === 1 && !inWl('dms', r.id) && !inWl('dms', r.user && r.user.username)) {
          items.push({
            label: 'Close DM: ' + friendName(r),
            skip: 'No active DM channel open'
          });
        }
      });
    }
    return items;
  }

  function deleteOwnMessagesInChannel(channelId, channelName, messages) {
    const queue = Array.isArray(messages) ? messages : [];
    let deleted = 0;
    emitLine('[' + channelName + '] ' + queue.length + ' message(s) will be deleted.');
    emitLine('[' + channelName + '] ' + queue.length + ' message(s) remaining.');
    let sequence = Promise.resolve();
    queue.forEach(function (message) {
      sequence = sequence.then(function () {
        return delay(150).then(function () {
          return apiCall('DELETE', '/channels/' + channelId + '/messages/' + message.id);
        }).then(function (res) {
          if (!res || res.status < 200 || res.status >= 300) {
            throw new Error('Could not delete message ' + message.id + '.');
          }
          deleted += 1;
          emitLine('[' + channelName + '] Deleted message ' + message.id + '.');
          emitLine('[' + channelName + '] ' + (queue.length - deleted) + ' message(s) remaining.');
        });
      });
    });
    return sequence.then(function () {
      emitLine('[' + channelName + '] Deleted ' + deleted + ' of ' + queue.length + ' message(s).');
    });
  }

  function buildDeleteAllDMsMessagesItems() {
    const items = [];
    const channels = (state.channels || []).filter(function (c) {
      return (c.type === 1 || c.type === 3) && !inWl('dms', c.id);
    });
    if (channels.length > 0) {
      channels.forEach(function (c) {
        const isGroup = c.type === 3;
        const recipientName = isGroup
          ? (c.name || 'Group Chat (' + ((c.recipients && c.recipients.length) || 0) + ' members)')
          : ((c.recipients && c.recipients[0] && (c.recipients[0].username || c.recipients[0].id)) || c.name || c.id);
        items.push({
          label: 'Delete own messages in: ' + recipientName + ' (' + c.id + ')',
          action: function () {
            return apiCall('GET', '/channels/' + c.id + '/messages?limit=100')
              .then(function (res) {
                if (res.status !== 200 || !Array.isArray(res.data) || !state.user || !state.user.id) {
                  throw new Error('Could not read messages in ' + recipientName + '.');
                }
                const myMessages = res.data.filter(function (m) {
                  return m && m.author && m.author.id === state.user.id;
                });
                return deleteOwnMessagesInChannel(c.id, recipientName, myMessages);
              });
          }
        });
      });
    }
    return items;
  }

  function buildDeleteTargetDMsItems(targetId) {
    if (!targetId) {
      return [];
    }
    const cleanId = targetId.trim();
    const ch = (state.channels || []).find(function (c) {
      const needle = cleanId.toLowerCase();
      return c.id === cleanId || (c.recipients && c.recipients.some(function (r) {
        return r.id === cleanId ||
          String(r.username || '').toLowerCase() === needle ||
          String(r.global_name || '').toLowerCase() === needle;
      }));
    });
    const channelId = ch ? ch.id : cleanId;
    const recipientName = ch
      ? (ch.type === 3 ? (ch.name || 'Group Chat') : ((ch.recipients && ch.recipients[0] && ch.recipients[0].username) || cleanId))
      : cleanId;

    return [{
      label: 'Delete own messages with ' + recipientName + ' (' + channelId + ')',
      action: function () {
        return apiCall('GET', '/channels/' + channelId + '/messages?limit=100')
          .then(function (res) {
            if (res.status !== 200 || !Array.isArray(res.data) || !state.user || !state.user.id) {
              throw new Error('Could not read messages in ' + recipientName + '.');
            }
            const myMessages = res.data.filter(function (m) {
              return m && m.author && m.author.id === state.user.id;
            });
            return deleteOwnMessagesInChannel(channelId, recipientName, myMessages);
          });
      }
    }];
  }

  function buildCleanDMsItems() {
    const items = [];
    const channels = (state.channels || []).filter(function (c) {
      return (c.type === 1 || c.type === 3) && !inWl('dms', c.id);
    });
    if (channels.length > 0) {
      channels.forEach(function (c) {
        const isGroup = c.type === 3;
        const recipientName = isGroup
          ? (c.name || 'Group Chat (' + ((c.recipients && c.recipients.length) || 0) + ' members)')
          : ((c.recipients && c.recipients[0] && (c.recipients[0].username || c.recipients[0].id)) || c.name || c.id);
        items.push({
          label: (isGroup ? 'Leave Group DM: ' : 'Close DM: ') + recipientName + ' (' + c.id + ')',
          action: function () {
            return apiCall('DELETE', '/channels/' + c.id).then(function (res) {
              if (res.status >= 200 && res.status < 300) {
                state.channels = (state.channels || []).filter(function (channel) { return channel.id !== c.id; });
                updateMetricsFrom(state);
              }
              return res;
            });
          }
        });
      });
    } else {
      (state.rel || []).forEach(function (r) {
        if (r.type === 1 && !inWl('dms', r.id) && !inWl('dms', r.user && r.user.username)) {
          items.push({
            label: 'Close DM: ' + friendName(r),
            skip: 'No active DM channel open'
          });
        }
      });
    }
    return items;
  }

  const opButtonIds = [
    'leaveServersBtn',
    'removeFriendsBtn',
    'badgeActionBtn',
    'closeDMsBtn',
    'deleteUserDMsBtn',
    'allInOneBtn',
    'accountDetailsBtn'
  ];

  function lockOperationButtons(activeBtn) {
    opButtonIds.forEach(function (id) {
      const btn = byId(id);
      if (btn) {
        if (btn === activeBtn) {
          setBusy(btn, true);
        } else {
          btn.classList.add('btn-disabled');
          btn.disabled = true;
        }
      }
    });
  }

  function unlockOperationButtons() {
    opButtonIds.forEach(function (id) {
      const btn = byId(id);
      if (btn) {
        setBusy(btn, false);
        btn.classList.remove('btn-disabled');
        btn.disabled = false;
      }
    });
  }

  function prepareOperation(title, buildFn, triggerBtn) {
    if (state.running) {
      toast('An operation is already running.', 'error');
      return;
    }
    state.running = true;
    state.stopped = false;
    setCurrentOperation(title, 'Preparing...');
    if (triggerBtn) {
      setBusy(triggerBtn, true);
    }
    lockOperationButtons(triggerBtn);
    loadAccountData()
      .then(function (data) {
        updateMetricsFrom(data);
      })
      .catch(function (err) {
        state.lastLoadError = err && err.message ? err.message : state.lastLoadError;
      })
      .finally(function () {
        if (state.stopped) {
          state.running = false;
          setCurrentOperation('', '');
          unlockOperationButtons();
          abortInFlight();
          toast('Operation stopped.', 'info');
          return;
        }
        try {
          const builtItems = typeof buildFn === 'function' ? buildFn() : [];
          runOperation(title, builtItems, triggerBtn, true);
        } catch (err) {
          state.running = false;
          setCurrentOperation('', '');
          unlockOperationButtons();
          abortInFlight();
          toast((err && err.message) || 'Could not build the operation list.', 'error');
        }
      });
  }

  function runLeaveServersOperation(targetServer) {
    const candidates = getLeaveServerCandidates();
    const leaveable = targetServer
      ? candidates.filter(function (server) { return String(server.id) === String(targetServer.id) && server.leaveable; })
      : candidates.filter(function (server) { return server.leaveable; });
    const results = candidates.map(function (server) {
      return {
        name: server.name,
        status: !server.leaveable ? 'skipped' : 'pending',
        reason: server.reason
      };
    });

    if (!leaveable.length) {
      closeLeaveServersConfirmModal();
      showView('operation', { persist: true });
      closeLeaveServersConfirmModal();
      resetTerminal('Leave Servers');
      emitLine('No leaveable servers found.');
      toast('No leaveable servers found.', 'info');
      return;
    }

    state.running = true;
    state.stopped = false;
    setCurrentOperation('Leave Servers', '0 / ' + leaveable.length + ' • 0%');
    closeLeaveServersConfirmModal();
    lockOperationButtons(byId('leaveServersBtn'));
    showView('operation', { persist: true });
    closeLeaveServersConfirmModal();
    resetTerminal('Leave Servers');
    emitLine('Starting Leave Servers');
    emitLine('Total leaveable servers: ' + leaveable.length);

    let index = 0;
    const step = function () {
      if (state.stopped || !state.running) {
        emitLine('Operation stopped by user.');
        if (opPill) {
          opPill.textContent = 'stopped';
        }
        state.running = false;
        setCurrentOperation('', '');
        unlockOperationButtons();
        if (state.user && state.user.id) {
          recordOperationHistory('Leave Servers');
        }
        toast('Operation stopped.', 'info');
        return;
      }
      if (index >= leaveable.length) {
        emitLine('Leave Servers completed.');
        if (opPill) {
          opPill.textContent = 'done';
        }
        updateProgress(leaveable.length, leaveable.length);
        state.running = false;
        setCurrentOperation('', '');
        unlockOperationButtons();
        recordOperationHistory('Leave Servers');
        toast('Leave Servers finished.', 'success');
        return;
      }
      const server = leaveable[index];
      index += 1;
      const resultIndex = results.findIndex(function (entry) { return entry.name === server.name; });
      if (resultIndex !== -1) {
        results[resultIndex].status = 'pending';
      }
      emitLine('[' + index + '/' + leaveable.length + '] Leaving server: ' + server.name);
      updateProgress(index, leaveable.length);
      apiCall('DELETE', '/users/@me/guilds/' + server.id)
        .then(function (res) {
          if (res.status >= 200 && res.status < 300) {
            if (resultIndex !== -1) {
              results[resultIndex].status = 'left';
              results[resultIndex].reason = 'Left successfully';
            }
            emitLine('Left server: ' + server.name);
            setTimeout(step, currentDelay());
          } else {
            if (resultIndex !== -1) {
              results[resultIndex].status = 'failed';
              results[resultIndex].reason = handleAuthError(res.data || {});
            }
            emitLine('Could not leave server: ' + server.name + ' (' + (handleAuthError(res.data || {}) || 'error') + ')');
            setTimeout(step, currentDelay());
          }
        })
        .catch(function () {
          if (resultIndex !== -1) {
            results[resultIndex].status = 'failed';
            results[resultIndex].reason = 'Cannot reach Discord API';
          }
          emitLine('Could not leave server: ' + server.name + ' (Cannot reach Discord API)');
          setTimeout(step, currentDelay());
        });
    };
    step();
  }

  function runRemoveFriendsOperation() {
    const candidates = getRemoveFriendCandidates();
    const results = candidates.map(function (entry) {
      return {
        name: entry.name + ' (' + entry.relationshipType + ')',
        status: 'pending'
      };
    });

    if (!candidates.length) {
      closeRemoveFriendsConfirmModal();
      showView('operation', { persist: true });
      closeRemoveFriendsConfirmModal();
      resetTerminal('Remove Friends');
      emitLine('No removable friends, blocked users, ignored users, or pending requests found.');
      toast('No removable friends, blocked users, ignored users, or pending requests found.', 'info');
      return;
    }

    state.running = true;
    state.stopped = false;
    setCurrentOperation('Remove Friends', '0 / ' + candidates.length + ' • 0%');
    closeRemoveFriendsConfirmModal();
    lockOperationButtons(byId('removeFriendsBtn'));
    showView('operation', { persist: true });
    closeRemoveFriendsConfirmModal();
    resetTerminal('Remove Friends');
    emitLine('Starting Remove Friends');
    emitLine('Total removable relationships: ' + candidates.length);
    emitLine('Estimated processing time: ~' + Math.max(1, Math.ceil((candidates.length * currentDelay()) / 1000)) + 's');

    let index = 0;
    const step = function () {
      if (state.stopped || !state.running) {
        emitLine('Operation stopped by user.');
        if (opPill) {
          opPill.textContent = 'stopped';
        }
        state.running = false;
        setCurrentOperation('', '');
        unlockOperationButtons();
        if (state.user && state.user.id) {
          recordOperationHistory('Remove Friends');
        }
        toast('Operation stopped.', 'info');
        return;
      }

      if (index >= candidates.length) {
        emitLine('Remove Friends completed.');
        if (opPill) {
          opPill.textContent = 'done';
        }
        updateProgress(candidates.length, candidates.length);
        state.running = false;
        setCurrentOperation('', '');
        unlockOperationButtons();
        recordOperationHistory('Remove Friends');
        toast('Remove Friends finished.', 'success');
        return;
      }

      const entry = candidates[index];
      index += 1;
      const resultIndex = results.findIndex(function (result) {
        return result.name === (entry.name + ' (' + entry.relationshipType + ')');
      });
      if (resultIndex !== -1) {
        results[resultIndex].status = 'pending';
      }
      emitLine('[' + index + '/' + candidates.length + '] Removing: ' + entry.name + ' (' + entry.relationshipType + ')');
      updateProgress(index, candidates.length);

      apiCall('DELETE', '/users/@me/relationships/' + entry.id)
        .then(function (res) {
          if (res.status >= 200 && res.status < 300) {
            if (resultIndex !== -1) {
              results[resultIndex].status = 'removed';
            }
            emitLine('Removed relationship: ' + entry.name + ' (' + entry.relationshipType + ')');
            state.rel = (state.rel || []).filter(function (r) { return r.id !== entry.id; });
            updateMetricsFrom(state);
            setTimeout(step, currentDelay());
          } else {
            if (resultIndex !== -1) {
              results[resultIndex].status = 'failed';
            }
            emitLine('Could not remove relationship: ' + entry.name + ' (' + (handleAuthError(res.data || {}) || 'error') + ')');
            setTimeout(step, currentDelay());
          }
        })
        .catch(function () {
          if (resultIndex !== -1) {
            results[resultIndex].status = 'failed';
          }
          emitLine('Could not remove relationship: ' + entry.name + ' (Cannot reach Discord API)');
          setTimeout(step, currentDelay());
        });
    };

    step();
  }

  function runOperation(title, items, triggerBtn, allowRunning) {
    const safeItems = Array.isArray(items) ? items.filter(function (entry) { return !!entry; }) : [];
    if (!allowRunning && state.running) {
      toast('An operation is already running.', 'error');
      if (triggerBtn) setBusy(triggerBtn, false);
      return;
    }
    if (!safeItems.length) {
      state.running = false;
      setCurrentOperation('', '');
      unlockOperationButtons();
      abortInFlight();
      if (!state.dataLoaded) {
        toast(state.lastLoadError || 'Could not load account data. Check your network and try again.', 'error');
      } else {
        toast('No matching targets found — nothing to do.', 'info');
      }
      return;
    }
    state.running = true;
    state.stopped = false;
    setCurrentOperation(title, '0 / ' + safeItems.length + ' • 0%');
    lockOperationButtons(triggerBtn);
    abortInFlight();
    inFlightController = new AbortController();

    resetTerminal(title);
    emitLine('Starting: ' + title);
    emitLine('Delay between calls: ' + currentDelay() + 'ms');
    const finish = function () {
      state.running = false;
      setCurrentOperation('', '');
      recordOperationHistory(title);
      unlockOperationButtons();
      abortInFlight();
      refreshAccountStateAfterOp();
    };

    let index = 0;
    const step = function () {
      if (state.stopped || !state.running) {
        emitLine('Operation stopped by user.');
        if (opPill) {
          opPill.textContent = 'stopped';
        }
        finish();
        toast('Operation stopped.', 'info');
        return;
      }
      const item = safeItems[index];
      if (!item) {
        emitLine('Operation completed (' + safeItems.length + ' items).');
        if (opPill) {
          opPill.textContent = 'done';
        }
        finish();
        toast('Operation completed.', 'success');
        return;
      }
      index += 1;
      emitLine('[' + index + '/' + safeItems.length + '] ' + item.label + (item.skip ? ' — ' + item.skip : ''));
      updateProgress(index, safeItems.length);

      const runAction = function () {
        if (!item.action) {
          return Promise.resolve();
        }
        return Promise.resolve().then(function () {
          return item.action();
        }).then(function (res) {
          if (res && typeof res.status === 'number' && (res.status < 200 || res.status >= 300)) {
            throw new Error(res.status === 429
              ? 'Discord rate limit persisted after retries.'
              : handleAuthError(res.data || {}));
          }
          return res;
        });
      };

      runAction()
        .then(function () {
          emitLine('Completed: ' + item.label);
          if (index >= safeItems.length) {
            emitLine('Operation completed (' + safeItems.length + ' items).');
            if (opPill) {
              opPill.textContent = 'done';
            }
            finish();
            toast('Operation completed.', 'success');
            return;
          }
          const nextItem = safeItems[index];
          const waitMs = nextItem && nextItem.operationBoundary ? state.allInOneCooldown : currentDelay();
          if (nextItem && nextItem.operationBoundary && waitMs > 0) {
            emitLine('Cooldown before ' + nextItem.operationName + ': ' + waitMs + 'ms');
          }
          setTimeout(step, waitMs);
        })
        .catch(function (err) {
          emitLine('Failed: ' + (item.label || 'item') + ' (' + (err && err.message ? err.message : 'request error') + ')');
          if (index >= safeItems.length) {
            emitLine('Operation completed (' + safeItems.length + ' items).');
            if (opPill) {
              opPill.textContent = 'done';
            }
            finish();
            toast('Operation completed with errors.', 'warning');
            return;
          }
          const nextItem = safeItems[index];
          const waitMs = nextItem && nextItem.operationBoundary ? state.allInOneCooldown : currentDelay();
          if (nextItem && nextItem.operationBoundary && waitMs > 0) {
            emitLine('Cooldown before ' + nextItem.operationName + ': ' + waitMs + 'ms');
          }
          setTimeout(step, waitMs);
        });
    };
    step();
  }

  function stopRunning() {
    state.stopped = true;
    abortInFlight();
  }

  function cancelOperationForExit() {
    const wasRunning = state.running;
    stopRunning();
    if (wasRunning && state.opLines.length && state.user && state.user.id) {
      emitLine('Operation stopped by user.');
      recordOperationHistory('Operation Stopped');
    }
    unlockOperationButtons();
    abortInFlight();
    refreshAccountStateAfterOp();
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

  function openDeleteDmModal() {
    const modal = byId('deleteDmModal');
    if (modal) {
      modal.classList.add('active');
    }
  }

  function closeDeleteDmModal() {
    const modal = byId('deleteDmModal');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  function closeCloseDmsConfirmModal() {
    const modal = byId('closeDmsConfirmModal');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  let pendingOperation = null;

  function buildAllInOneItems() {
    const groups = [
      { id: 'allInOneLeave', name: 'Leave Servers', build: buildLeaveItems },
      { id: 'allInOneFriends', name: 'Remove Friends', build: buildFriendItems },
      { id: 'allInOneDms', name: 'Close DMs', build: buildCleanDMsItems }
    ];
    const items = [];
    groups.forEach(function (group) {
      const checkbox = byId(group.id);
      if (!checkbox || !checkbox.checked) {
        return;
      }
      const groupItems = group.build();
      groupItems.forEach(function (item, index) {
        item.operationName = group.name;
        if (index === 0) {
          item.operationBoundary = items.length > 0;
        }
        items.push(item);
      });
    });
    return items;
  }

  function updateAllInOneSummary() {
    const items = buildAllInOneItems();
    const actionable = items.filter(function (item) { return item && !item.skip; });
    const countEl = byId('operationConfirmCount');
    const skippedEl = byId('operationConfirmSkipped');
    const estimateEl = byId('operationConfirmEstimate');
    const confirmBtn = byId('operationConfirmBtn');
    if (countEl) countEl.textContent = String(actionable.length);
    if (skippedEl) skippedEl.textContent = '• ' + (items.length - actionable.length) + ' protected/whitelisted';
    if (estimateEl) estimateEl.textContent = 'Estimated processing time: ~' + Math.max(0, Math.ceil((actionable.length * currentDelay()) / 1000)) + 's';
    if (confirmBtn) confirmBtn.disabled = actionable.length === 0;
  }

  function closeOperationConfirmModal() {
    const modal = byId('operationConfirmModal');
    if (modal) modal.classList.remove('active');
    pendingOperation = null;
  }

  function openOperationConfirmModal(title, buildFn, triggerBtn, description) {
    closeInspector();
    const modal = byId('operationConfirmModal');
    const countEl = byId('operationConfirmCount');
    const skippedEl = byId('operationConfirmSkipped');
    const estimateEl = byId('operationConfirmEstimate');
    const titleEl = byId('operationConfirmTitle');
    const descriptionEl = byId('operationConfirmDescription');
    const allInOneOptions = byId('allInOneOptions');
    const confirmBtn = byId('operationConfirmBtn');
    const items = typeof buildFn === 'function' ? buildFn() : [];
    const actionable = Array.isArray(items) ? items.filter(function (item) { return item && !item.skip; }) : [];
    const skipped = Array.isArray(items) ? items.length - actionable.length : 0;
    if (titleEl) titleEl.textContent = title;
    if (descriptionEl) descriptionEl.textContent = description || 'Review the operation before it starts.';
    if (allInOneOptions) allInOneOptions.hidden = title !== 'All-in-One Cleanup';
    if (title === 'All-in-One Cleanup' && allInOneOptions) {
      allInOneOptions.querySelectorAll('input, select').forEach(function (input) {
        input.onchange = updateAllInOneSummary;
      });
    }
    if (countEl) countEl.textContent = String(actionable.length);
    if (skippedEl) skippedEl.textContent = '• ' + skipped + ' protected/whitelisted';
    if (estimateEl) estimateEl.textContent = 'Estimated processing time: ~' + Math.max(0, Math.ceil((actionable.length * currentDelay()) / 1000)) + 's';
    pendingOperation = { title: title, buildFn: buildFn, triggerBtn: triggerBtn, allInOne: title === 'All-in-One Cleanup' };
    if (confirmBtn) confirmBtn.disabled = actionable.length === 0;
    if (modal) modal.classList.add('active');
  }

  function openCloseDmsConfirmModal() {
    const modal = byId('closeDmsConfirmModal');
    const summary = byId('closeDmsConfirmSummary');
    const estimate = byId('closeDmsConfirmEstimate');
    const readyText = byId('closeDmsReadyText');
    const directText = byId('closeDmsDirectText');
    const groupText = byId('closeDmsGroupText');
    const timeText = byId('closeDmsTimeText');
    const confirmBtn = byId('closeDmsConfirmBtn');
    if (!modal || !summary || !estimate) {
      return;
    }
    if (readyText) {
      readyText.textContent = 'Loading active DMs...';
      const oldSkippedText = summary.querySelector('.close-dms-skipped');
      if (oldSkippedText) {
        oldSkippedText.remove();
      }
    } else {
      summary.textContent = 'Loading active DMs...';
    }
    if (directText) directText.textContent = '';
    if (groupText) groupText.textContent = '';
    if (timeText) timeText.textContent = '';
    if (confirmBtn) {
      confirmBtn.disabled = true;
    }
    modal.classList.add('active');
    loadAccountData().then(function () {
      const allChannels = (state.channels || []).filter(function (channel) {
        return channel.type === 1 || channel.type === 3;
      });
      const closeable = buildDmItems();
      const oneToOne = allChannels.filter(function (channel) { return channel.type === 1; }).length;
      const groupChats = allChannels.filter(function (channel) { return channel.type === 3; }).length;
      const skipped = Math.max(0, allChannels.length - closeable.length);
      const seconds = Math.max(0, Math.ceil((closeable.length * currentDelay()) / 1000));
      if (readyText) {
        readyText.textContent = closeable.length + ' ready';
        const skippedText = document.createElement('span');
        skippedText.className = 'close-dms-skipped';
        skippedText.textContent = ' • ' + skipped + ' whitelisted';
        summary.appendChild(skippedText);
      } else {
        summary.textContent = closeable.length + ' ready • ' + skipped + ' whitelisted';
      }
      if (directText) directText.textContent = oneToOne + ' direct';
      if (groupText) groupText.textContent = ' • ' + groupChats + ' group chats';
      if (timeText) timeText.textContent = ' • Estimated time: ~' + seconds + 's';
      if (confirmBtn) {
        confirmBtn.disabled = closeable.length === 0;
      }
    }).catch(function (err) {
      if (readyText) {
        readyText.textContent = 'Could not load active DMs.';
      } else {
        summary.textContent = 'Could not load active DMs.';
      }
      if (estimate) {
        estimate.textContent = err && err.message ? err.message : 'Please try again.';
      }
    });
  }

  function openLeaveServersConfirmModal(targetServer) {
    closeInspector();
    const modal = byId('leaveServersConfirmModal');
    const countEl = byId('leaveServersConfirmCount');
    const whitelistCountEl = byId('leaveServersWhitelistCount');
    const estimateEl = byId('leaveServersEstimate');
    const candidates = getLeaveServerCandidates();
    const leaveable = targetServer
      ? candidates.filter(function (server) { return String(server.id) === String(targetServer.id) && server.leaveable; })
      : candidates.filter(function (server) { return server.leaveable; });
    if (countEl) {
      countEl.textContent = String(leaveable.length || (targetServer ? 1 : 0));
    }
    if (whitelistCountEl) {
      const protectedCount = targetServer
        ? (leaveable.length ? 0 : 1)
        : candidates.filter(function (server) { return !server.leaveable; }).length;
      whitelistCountEl.textContent = '• ' + protectedCount + ' protected/whitelisted';
    }
    if (estimateEl) {
      const count = leaveable.length || (targetServer ? 1 : 0);
      estimateEl.textContent = 'Estimated processing time: ~' + Math.max(0, Math.ceil((count * currentDelay()) / 1000)) + 's';
    }
    if (modal) {
      modal.hidden = false;
      modal.dataset.leaveTargetId = targetServer ? String(targetServer.id) : '';
      modal.dataset.leaveTargetRow = targetServer && targetServer.rowEl ? String(targetServer.rowEl.dataset.id || targetServer.id) : '';
      modal.classList.add('active');
    }
  }

  function closeLeaveServersConfirmModal() {
    const modal = byId('leaveServersConfirmModal');
    if (modal) {
      modal.classList.remove('active');
      modal.hidden = true;
    }
  }

  function openRemoveFriendsConfirmModal() {
    const modal = byId('removeFriendsConfirmModal');
    const countEl = byId('removeFriendsConfirmCount');
    const whitelistCountEl = byId('removeFriendsWhitelistCount');
    const estimateEl = byId('removeFriendsEstimate');
    const allRelationships = (state.rel || []).filter(function (relationship) {
      return relationship && relationship.id && [1, 2, 3, 4, 5].indexOf(Number(relationship.type)) !== -1;
    });
    const candidates = getRemoveFriendCandidates();
    const count = Math.max(candidates.length, 0);
    const delayMs = currentDelay();
    const estimatedSeconds = count ? Math.max(1, Math.ceil((count * delayMs) / 1000)) : 0;
    if (countEl) {
      countEl.textContent = String(count);
    }
    if (whitelistCountEl) {
      whitelistCountEl.textContent = '• ' + Math.max(0, allRelationships.length - candidates.length) + ' whitelisted';
    }
    if (estimateEl) {
      estimateEl.textContent = count
        ? 'Estimated processing time: ~' + estimatedSeconds + 's'
        : 'Estimated processing time: ~0s';
    }
    if (modal) {
      modal.hidden = false;
      modal.classList.add('active');
    }
  }

  function closeRemoveFriendsConfirmModal() {
    const modal = byId('removeFriendsConfirmModal');
    if (modal) {
      modal.classList.remove('active');
      modal.hidden = true;
    }
  }

  function openRemoveFriendsLogModal(results) {
    const modal = byId('removeFriendsLogModal');
    const list = byId('removeFriendsLogList');
    const summary = byId('removeFriendsSummary');
    if (!modal || !list) {
      return;
    }
    const total = Array.isArray(results) ? results.length : 0;
    const removed = (results || []).filter(function (item) { return item.status === 'removed'; }).length;
    const skipped = (results || []).filter(function (item) { return item.status === 'skipped'; }).length;
    const failed = (results || []).filter(function (item) { return item.status === 'failed'; }).length;
    if (summary) {
      summary.textContent = removed + ' removed • ' + skipped + ' skipped • ' + failed + ' failed';
    }
    list.innerHTML = '';
    (results || []).forEach(function (item) {
      const row = document.createElement('li');
      const name = document.createElement('span');
      const badge = document.createElement('span');
      name.className = 'leave-log-name';
      name.textContent = item.name || 'Unknown user';
      badge.className = 'leave-log-status ' + item.status;
      badge.textContent = item.status;
      row.appendChild(name);
      row.appendChild(badge);
      list.appendChild(row);
    });
    if (!total) {
      const empty = document.createElement('li');
      empty.className = 'leave-log-name';
      empty.style.width = '100%';
      empty.textContent = 'No relationship data available.';
      list.appendChild(empty);
    }
    modal.classList.add('active');
  }

  function closeRemoveFriendsLogModal() {
    const modal = byId('removeFriendsLogModal');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  function renderCloseDmsLog() {
    const list = byId('closeDmsLogList');
    const summary = byId('closeDmsLogSummary');
    if (!list) return;
    const results = state.closeDmResults || [];
    const closed = results.filter(function (item) { return item.status === 'closed'; }).length;
    const skipped = results.filter(function (item) { return item.status === 'skipped'; }).length;
    const failed = results.filter(function (item) { return item.status === 'failed'; }).length;
    if (summary) {
      summary.textContent = closed + ' closed • ' + skipped + ' skipped • ' + failed + ' failed';
    }
    list.innerHTML = '';
    results.forEach(function (item) {
      const row = document.createElement('li');
      const name = document.createElement('span');
      const badge = document.createElement('span');
      name.className = 'leave-log-name';
      name.textContent = item.name + ' (' + item.id + ')';
      badge.className = 'leave-log-status ' + item.status;
      badge.textContent = item.status;
      row.appendChild(name);
      row.appendChild(badge);
      list.appendChild(row);
    });
  }

  function openCloseDmsLogModal() {
    renderCloseDmsLog();
    const modal = byId('closeDmsLogModal');
    if (modal) modal.classList.add('active');
  }

  function closeCloseDmsLogModal() {
    const modal = byId('closeDmsLogModal');
    if (modal) modal.classList.remove('active');
  }

  function openLeaveServersLogModal(results) {
    const modal = byId('leaveServersLogModal');
    const list = byId('leaveServersLogList');
    const summary = byId('leaveServersSummary');
    if (!modal || !list) {
      return;
    }
    const total = Array.isArray(results) ? results.length : 0;
    const left = (results || []).filter(function (item) { return item.status === 'left'; }).length;
    const skipped = (results || []).filter(function (item) { return item.status === 'skipped'; }).length;
    const failed = (results || []).filter(function (item) { return item.status === 'failed'; }).length;
    if (summary) {
      summary.textContent = left + ' left • ' + skipped + ' skipped • ' + failed + ' failed';
    }
    list.innerHTML = '';
    (results || []).forEach(function (item) {
      const row = document.createElement('li');
      const name = document.createElement('span');
      const badge = document.createElement('span');
      name.className = 'leave-log-name';
      name.textContent = item.name || 'Unknown server';
      badge.className = 'leave-log-status ' + (item.status || 'pending');
      badge.textContent = item.status || 'pending';
      row.appendChild(name);
      row.appendChild(badge);
      list.appendChild(row);
    });
    if (!total) {
      const empty = document.createElement('li');
      empty.className = 'leave-log-name';
      empty.style.width = '100%';
      empty.textContent = 'No server data available.';
      list.appendChild(empty);
    }
    modal.classList.add('active');
  }

  function closeLeaveServersLogModal() {
    const modal = byId('leaveServersLogModal');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  /* ---------- Badge view ---------- */

  function patchLegacyUsernameBadge(enabled) {
    const payload = {
      settings: enabled ? 'QgWyAQIIAA==' : 'QgWyAQIIAQ=='
    };
    return apiCall('PATCH', '/users/@me/settings-proto/1', payload);
  }

  function getEquippedBadgeInfo() {
    const u = state.user || {};
    const prof = state.profileData || {};
    let equippedHouseId = null;
    const profileBadges = getUserBadges(u, prof);
    const profileShowsLegacyUsername = profileBadges.some(function (badge) {
      return badge && (badge.key === 'legacy_username' || badge.id === 'legacy_username');
    });
    const hasLegacyUsername = state.legacyUsernameOverride !== null
      ? state.legacyUsernameOverride
      : getLegacyUsernameSetting() === 'visible' ||
      profileShowsLegacyUsername ||
      !!(u.legacy_username || prof.legacy_username || (prof.user && prof.user.legacy_username));
    const flags = u.flags || u.public_flags || 0;
    if (flags & (1 << 6)) {
      equippedHouseId = 1;
    } else if (flags & (1 << 7)) {
      equippedHouseId = 2;
    } else if (flags & (1 << 8)) {
      equippedHouseId = 3;
    }
    const badgeList = Array.isArray(prof.badges) ? prof.badges : [];
    badgeList.forEach(function (b) {
      if (!b) return;
      const badgeId = String(b.id || b.key || b.name || '').toLowerCase();
      
      if (badgeId.indexOf('hypesquad_house_1') !== -1 || badgeId === 'bravery') {
        equippedHouseId = 1;
      } else if (badgeId.indexOf('hypesquad_house_2') !== -1 || badgeId === 'brilliance') {
        equippedHouseId = 2;
      } else if (badgeId.indexOf('hypesquad_house_3') !== -1 || badgeId === 'balance') {
        equippedHouseId = 3;
      }
    });
    
    return {
      equippedHouseId: equippedHouseId,
      hasLegacyUsername: hasLegacyUsername
    };
  }

  function pickHouse(houseId) {
    state.selectedHouse = houseId;
    state.selectedLegacy = null;
    const cards = document.querySelectorAll('.badge-card');
    cards.forEach(function (card) {
      card.classList.toggle('selected', card.getAttribute('data-house') === String(houseId));
    });
  }

  function pickLegacy(type) {
    state.selectedLegacy = type;
    state.selectedHouse = null;
    const cards = document.querySelectorAll('.badge-card');
    cards.forEach(function (card) {
      card.classList.toggle('selected', card.getAttribute('data-legacy') === type);
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
          if (tokenInput) tokenInput.focus();
          return;
        }
        setBusy(authBtn, true);
        validateToken(token)
          .then(function (res) {
            if (!res || !res.data || !res.data.id) {
              throw new Error('Token validation failed.');
            }
            setActiveAccount(token, res.data);
            upsertAccount(token, res.data);
            if (tokenInput) tokenInput.value = '';
            showView('dashboard');
            applyAccountState();
            toast('Logged in as ' + (res.data.global_name || res.data.username) + '.', 'success');
          })
          .catch(function (err) {
            clearActiveAccount();
            if (tokenInput) tokenInput.focus();
            toast(err && err.message ? err.message : 'Invalid token.', 'error');
          })
          .finally(function () {
            setBusy(authBtn, false);
          });
      });
    }

    if (tokenInput && authBtn) {
      tokenInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          authBtn.click();
        }
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
        const useBtn = e.target.closest('[data-account-use]');
        const delBtn = e.target.closest('[data-account-delete]');
        const accounts = loadAccounts();
        if (useBtn) {
          const accountIndex = Number(useBtn.getAttribute('data-account-use'));
          const acc = accounts[accountIndex];
          if (acc) {
            validateToken(acc.token)
              .then(function (res) {
                if (!res || !res.data || !res.data.id) {
                  throw new Error('Saved account validation failed.');
                }
                setActiveAccount(acc.token, res.data);
                showView('dashboard');
                applyAccountState();
                toast('Switched to ' + (res.data.global_name || res.data.username) + '.', 'success');
              })
              .catch(function (err) {
                toast(err && err.message ? err.message : 'Could not switch to saved account.', 'error');
              });
          }
        }
        if (delBtn) {
          const accountIndex = Number(delBtn.getAttribute('data-account-delete'));
          const next = accounts.filter(function (_, index) {
            return index !== accountIndex;
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
    const viewCurrentOperationBtn = byId('viewCurrentOperationBtn');

    if (viewCurrentOperationBtn) {
      viewCurrentOperationBtn.addEventListener('click', function () {
        if (state.currentOperationTitle) {
          showView('operation', { persist: true });
        } else {
          toast('No operation is running.', 'info');
        }
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', function () {
        setBusy(confirmBtn, true);
        validateToken(state.token)
          .then(function (res) {
            if (res.data && res.data.id) {
              state.user = res.data;
              jsonSet(localStorage, CONFIG.dsc.user, {
                username: res.data.global_name || res.data.username || 'Unknown',
                token: state.token
              });
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
        cancelOperationForExit();
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
        if (state.running) {
          toast('An operation is already running.', 'error');
          return;
        }
        openLeaveServersConfirmModal();
      },
      removeFriendsBtn: function () {
        openRemoveFriendsConfirmModal();
      },
      closeDMsBtn: function () {
        toggleDMs();
      },
      deleteUserDMsBtn: function () {
        if (!hasAccount()) {
          toast('Please log in first.', 'error');
          return;
        }
        openDeleteDmModal();
      },
      allInOneBtn: function () {
        const btn = byId('allInOneBtn');
        openOperationConfirmModal('All-in-One Cleanup', buildAllInOneItems, btn, 'Choose the operations and cooldown, then run them sequentially.');
      },
      badgeActionBtn: function () {
        showView('badges');
      },
      boostProgressCard: function () {
        state.evolutionType = 'boost';
        showView('evolution');
        renderEvolutionDashboard();
      },
      nitroProgressCard: function () {
        state.evolutionType = 'nitro';
        showView('evolution');
        renderEvolutionDashboard();
      },
      accountDetailsBtn: function () {
        showView('details');
      },
      badgeEvolutionBtn: function () {
        showView('evolution');
      },
    };
    Object.keys(handlers).forEach(function (id) {
      const btn = byId(id);
      if (btn) {
        btn.addEventListener('click', handlers[id]);
        if (btn.getAttribute('role') === 'button') {
          btn.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handlers[id]();
            }
          });
        }
      }
    });

    const specificBtn = byId('deleteDmSpecificBtn');
    const targetInput = byId('deleteDmTargetInput');
    const targetError = byId('deleteDmTargetError');
    if (specificBtn) {
      specificBtn.addEventListener('click', function () {
        const target = targetInput ? targetInput.value.trim() : '';
        if (!target) {
          if (targetError) targetError.textContent = 'Enter a user ID or username first.';
          if (targetInput) targetInput.focus();
          return;
        }
        if (targetError) targetError.textContent = '';
        closeDeleteDmModal();
        showView('operation', { persist: true });
        resetTerminal('Delete DM Messages');
        if (opPill) opPill.textContent = 'preparing';
        emitLine('Preparing targeted DM message deletion...');
        const btn = byId('deleteUserDMsBtn');
        openOperationConfirmModal('Delete DM Messages (' + target + ')', function () {
          return buildDeleteTargetDMsItems(target);
        }, btn, 'Delete your messages from the selected DM conversation.');
      });
    }

    if (targetInput && specificBtn) {
      targetInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          specificBtn.click();
        }
      });
      targetInput.addEventListener('input', function () {
        if (targetError) targetError.textContent = '';
      });
    }

    const allBtn = byId('deleteDmAllBtn');
    if (allBtn) {
      allBtn.addEventListener('click', function () {
        closeDeleteDmModal();
        showView('operation', { persist: true });
        resetTerminal('Delete All DM Messages');
        if (opPill) opPill.textContent = 'preparing';
        emitLine('Preparing all DM message deletion...');
        const btn = byId('deleteUserDMsBtn');
        openOperationConfirmModal('Delete All DM Messages', buildDeleteAllDMsMessagesItems, btn, 'Delete your messages from all non-whitelisted DM conversations.');
      });
    }

    const closeBtn = byId('deleteDmModalClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        closeDeleteDmModal();
        if (targetInput) targetInput.value = '';
        if (targetError) targetError.textContent = '';
      });
    }
  }

  function initBadges() {
    const backBtn = byId('badgeSelectionBackBtn');
    const grid = byId('badgeGrid');
    const equipBtn = byId('equipBadgeBtn');
    const removeBtn = byId('removeBadgeBtn');
    const hideBtn = byId('hideAllBadgesBtn');

    // Badge image paths
    const badgeImages = {
      '1': 'assets/images/badges/hypesquadbravery.svg',
      '2': 'assets/images/badges/hypesquadbrilliance.svg',
      '3': 'assets/images/badges/hypesquadbalance.svg',
      '4': 'assets/images/badges/goldenhypesquadbalance.svg'
    };

    function renderBadgeCards() {
      const badgeInfo = getEquippedBadgeInfo();
      const cards = document.querySelectorAll('.badge-card');
      
      cards.forEach(function (card) {
        const houseId = card.getAttribute('data-house');
        const isLegacyUsername = card.getAttribute('data-legacy') === 'username';
        const emblem = card.querySelector('.badge-emblem');
        
        if (emblem && !isLegacyUsername) {
          const imagePath = badgeImages[houseId];
          if (imagePath) {
            if (emblem.querySelector('img')) {
              emblem.querySelector('img').src = imagePath;
            } else {
              const img = document.createElement('img');
              img.src = imagePath;
              img.alt = card.querySelector('.badge-name')?.textContent || 'Badge';
              img.style.width = '100%';
              img.style.height = '100%';
              img.style.objectFit = 'contain';
              emblem.innerHTML = '';
              emblem.appendChild(img);
            }
          }
        }
        
        // Mark card as equipped if applicable
        let isEquipped = false;
        if (isLegacyUsername) {
          isEquipped = badgeInfo.hasLegacyUsername;
        } else if (houseId) {
          isEquipped = badgeInfo.equippedHouseId === Number(houseId);
        }
        card.classList.toggle('equipped', isEquipped);
      });
    }

    function updateButtonState() {
      const badgeInfo = getEquippedBadgeInfo();
      const selectedHouse = state.selectedHouse;
      const selectedLegacy = state.selectedLegacy;
      
      const isHypesquadSelected = !!selectedHouse;
      const isLegacySelected = !!selectedLegacy;
      
      let isSelectedEquipped = false;
      if (isLegacySelected) {
        isSelectedEquipped = badgeInfo.hasLegacyUsername;
      } else if (isHypesquadSelected) {
        isSelectedEquipped = badgeInfo.equippedHouseId === Number(selectedHouse);
      }
      
      const hasAnyEquipped = badgeInfo.equippedHouseId !== null || badgeInfo.hasLegacyUsername;
      
      if (equipBtn) {
        if (isLegacySelected) {
          equipBtn.style.display = isSelectedEquipped ? 'none' : 'block';
        } else if (!selectedHouse) {
          equipBtn.style.display = 'none';
        } else if (isSelectedEquipped) {
          equipBtn.style.display = 'none';
        } else {
          equipBtn.style.display = 'block';
        }
      }
      
      if (removeBtn) {
        removeBtn.style.display = isSelectedEquipped ? 'block' : 'none';
        if (removeBtn.style.display === 'block') {
          const btnText = removeBtn.querySelector('span');
          if (btnText) {
            if (isLegacySelected) {
              btnText.textContent = 'Remove Legacy Username Badge';
            } else {
              btnText.textContent = 'Remove HypeSquad Badge';
            }
          }
        }
      }
      
      if (hideBtn) {
        hideBtn.style.display = hasAnyEquipped ? 'block' : 'none';
      }
    }

    window.refreshBadgeView = function () {
      renderBadgeCards();
      updateButtonState();
    };

    if (backBtn) {
      backBtn.addEventListener('click', function () {
        showView('dashboard');
      });
    }

    renderBadgeCards();
    updateButtonState();

    if (grid) {
      grid.addEventListener('click', function (e) {
        const card = e.target && e.target.closest ? e.target.closest('.badge-card') : null;
        if (card) {
          const houseId = card.getAttribute('data-house');
          const legacyType = card.getAttribute('data-legacy');
          
          if (legacyType) {
            pickLegacy(legacyType);
          } else if (houseId) {
            pickHouse(houseId);
          }
          updateButtonState();
        }
      });
    }

    if (equipBtn) {
      equipBtn.addEventListener('click', function () {
        if (state.selectedLegacy === 'username') {
          if (getEquippedBadgeInfo().hasLegacyUsername) {
            toast('Legacy username badge is already equipped.', 'info');
            return;
          }
          setBusy(equipBtn, true);
          patchLegacyUsernameBadge(true)
            .then(function (res) {
              if (res.status >= 200 && res.status < 300) {
                toast('Legacy username badge equipped.', 'success');
                state.legacyUsernameOverride = true;
                state.protobufSettings = { settings: 'QgWyAQIIAA==' };
                renderBadgeCards();
                updateButtonState();
                return loadAccountData().then(function () {
                  renderBadgeCards();
                  updateButtonState();
                });
              } else {
                toast((res.data && res.data.message) || 'Failed to equip legacy username badge.', 'error');
              }
            })
            .catch(function () {
              toast('Cannot reach Discord API.', 'error');
            })
            .finally(function () {
              setBusy(equipBtn, false);
            });
          return;
        }

        if (!state.selectedHouse) {
          toast('Select a badge card first.', 'error');
          return;
        }
        setBusy(equipBtn, true);
        apiCall('POST', '/hypesquad/online', { house_id: Number(state.selectedHouse) })
          .then(function (res) {
            if (res.status >= 200 && res.status < 300) {
              toast('HypeSquad badge equipped.', 'success');
              const equippedHouse = Number(state.selectedHouse);
              const houseFlags = { 1: 1 << 6, 2: 1 << 7, 3: 1 << 8 };
              state.user.flags = (state.user.flags || 0) | (houseFlags[equippedHouse] || 0);
              state.user.public_flags = (state.user.public_flags || 0) | (houseFlags[equippedHouse] || 0);
              state.selectedHouse = null;
              renderBadgeCards();
              updateButtonState();
              // Refresh account data to get updated profile
              return loadAccountData().then(function () {
                renderBadgeCards();
                updateButtonState();
              });
            } else {
              toast(handleAuthError(res.data || {}), 'error');
            }
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
        const isLegacy = state.selectedLegacy === 'username';
        
        setBusy(removeBtn, true);
        
        if (isLegacy) {
          patchLegacyUsernameBadge(false)
            .then(function (res) {
              if (res.status >= 200 && res.status < 300) {
                toast('Legacy username badge hidden.', 'success');
                state.legacyUsernameOverride = false;
                if (Array.isArray(state.profileData.badges)) {
                  state.profileData.badges = state.profileData.badges.filter(function (badge) {
                    const badgeId = String(badge && (badge.id || badge.key || badge.name) || '').toLowerCase();
                    return badgeId !== 'legacy_username' && badgeId.indexOf('legacy') === -1 && badgeId.indexOf('username') === -1;
                  });
                }
                if (state.profileData.user) {
                  delete state.profileData.user.legacy_username;
                }
                if (state.user) {
                  delete state.user.legacy_username;
                }
                state.protobufSettings = { settings: 'QgWyAQIIAQ==' };
                state.selectedLegacy = null;
                renderBadgeCards();
                updateButtonState();
                return loadAccountData().then(function () {
                  renderBadgeCards();
                  updateButtonState();
                });
              } else {
                toast((res.data && res.data.message) || 'Failed to hide legacy username badge.', 'error');
              }
            })
            .catch(function () {
              toast('Cannot reach Discord API.', 'error');
            })
            .finally(function () {
              setBusy(removeBtn, false);
            });
        } else {
          // HypeSquad badges are removed via /hypesquad/online
          apiCall('DELETE', '/hypesquad/online')
            .then(function (res) {
              if (res.status >= 200 && res.status < 300) {
                toast('HypeSquad badge removed.', 'success');
                // Refresh account data to get updated profile
                return loadAccountData().then(function () {
                  state.selectedHouse = null;
                  renderBadgeCards();
                  updateButtonState();
                });
              } else {
                toast(handleAuthError(res.data || {}), 'error');
              }
            })
            .catch(function () {
              toast('Cannot reach Discord API.', 'error');
            })
            .finally(function () {
              setBusy(removeBtn, false);
            });
        }
      });
    }

    if (hideBtn) {
      hideBtn.addEventListener('click', function () {
        const badgeInfo = getEquippedBadgeInfo();
        
        const hasHypesquad = badgeInfo.equippedHouseId !== null;
        const hasLegacy = badgeInfo.hasLegacyUsername;
        
        if (!hasHypesquad && !hasLegacy) {
          toast('No equipped badges to remove.', 'info');
          return;
        }

        setBusy(hideBtn, true);
        
        let completed = 0;
        let total = (hasHypesquad ? 1 : 0) + (hasLegacy ? 1 : 0);
        let successCount = 0;
        
        function checkIfDone() {
          completed += 1;
          if (completed === total) {
            // Refresh account data to ensure all state is in sync
            loadAccountData().then(function () {
              renderBadgeCards();
              updateButtonState();
              setBusy(hideBtn, false);
              
              if (successCount === total) {
                const msg = (hasHypesquad && hasLegacy) ? 'All badges removed.' : 
                           (hasHypesquad ? 'HypeSquad badge removed.' : 'Legacy username badge hidden.');
                toast(msg, 'success');
              } else {
                toast('Some badges could not be removed.', 'error');
              }
            }).catch(function () {
              renderBadgeCards();
              updateButtonState();
              setBusy(hideBtn, false);
              toast('Badges removed but profile refresh failed.', 'warning');
            });
          }
        }
        
        if (hasHypesquad) {
          apiCall('DELETE', '/hypesquad/online')
            .then(function (res) {
              if (res.status >= 200 && res.status < 300) {
                const houseFlags = (1 << 6) | (1 << 7) | (1 << 8);
                if (state.user) {
                  state.user.flags = (state.user.flags || 0) & ~houseFlags;
                  state.user.public_flags = (state.user.public_flags || 0) & ~houseFlags;
                }
                if (state.profileData && Array.isArray(state.profileData.badges)) {
                  state.profileData.badges = state.profileData.badges.filter(function (badge) {
                    const badgeId = String(badge && (badge.id || badge.key || badge.name) || '').toLowerCase();
                    return badgeId.indexOf('hypesquad') === -1 && badgeId.indexOf('house_') === -1;
                  });
                }
                successCount += 1;
              }
              checkIfDone();
            })
            .catch(function () {
              console.error('Failed to remove HypeSquad badge');
              checkIfDone();
            });
        }
        
        if (hasLegacy) {
          patchLegacyUsernameBadge(false)
            .then(function (res) {
              if (!res || res.status < 200 || res.status >= 300) {
                checkIfDone();
                return;
              }
              state.legacyUsernameOverride = false;
              // Update local state with the hidden payload
              if (!state.protobufSettings) {
                state.protobufSettings = {};
              }
              state.protobufSettings.settings = 'QgWyAQIIAQ==';
              // Also update profile to remove the legacy_username badge
              if (state.profileData && state.profileData.user) {
                delete state.profileData.user.legacy_username;
              }
              if (state.user && state.user.legacy_username) {
                delete state.user.legacy_username;
              }
              if (Array.isArray(state.profileData.badges)) {
                state.profileData.badges = state.profileData.badges.filter(function (badge) {
                  const badgeId = String(badge && (badge.id || badge.key || badge.name) || '').toLowerCase();
                  return badgeId !== 'legacy_username' && badgeId.indexOf('legacy') === -1 && badgeId.indexOf('username') === -1;
                });
              }
              successCount += 1;
              checkIfDone();
            })
            .catch(function () {
              console.error('Failed to hide legacy username badge');
              checkIfDone();
            });
        }
        
        if (total === 0) {
          setBusy(hideBtn, false);
        }
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
    const closeDmsConfirmBtn = byId('closeDmsConfirmBtn');
    const closeDmsCancelBtn = byId('closeDmsCancelBtn');
    const closeDmsConfirmModal = byId('closeDmsConfirmModal');
    const operationConfirmBtn = byId('operationConfirmBtn');
    const operationCancelBtn = byId('operationCancelBtn');
    const operationConfirmModal = byId('operationConfirmModal');
    const closeDmsLogClose = byId('closeDmsLogClose');
    const closeDmsLogModal = byId('closeDmsLogModal');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
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
    if (closeDmsConfirmBtn) {
      closeDmsConfirmBtn.addEventListener('click', function () {
        closeCloseDmsConfirmModal();
        showView('operation', { persist: true });
        resetTerminal('Close DMs');
        if (opPill) {
          opPill.textContent = 'preparing';
        }
        emitLine('Preparing Close DMs...');
        prepareOperation('Close DMs', buildDmItems, byId('closeDMsBtn'));
      });
    }
    if (closeDmsCancelBtn) {
      closeDmsCancelBtn.addEventListener('click', closeCloseDmsConfirmModal);
    }
    if (closeDmsConfirmModal) {
      closeDmsConfirmModal.addEventListener('click', function (e) {
        if (e.target === closeDmsConfirmModal) {
          closeCloseDmsConfirmModal();
        }
      });
    }
    if (operationConfirmBtn) {
      operationConfirmBtn.addEventListener('click', function () {
        if (!pendingOperation) return;
        const operation = pendingOperation;
        closeOperationConfirmModal();
        if (operation.allInOne) {
          state.allInOneCooldown = Number((byId('allInOneCooldown') || {}).value) || 0;
        }
        showView('operation', { persist: true });
        resetTerminal(operation.title);
        if (opPill) opPill.textContent = 'preparing';
        emitLine('Preparing ' + operation.title + '...');
        prepareOperation(operation.title, operation.buildFn, operation.triggerBtn);
      });
    }
    if (operationCancelBtn) {
      operationCancelBtn.addEventListener('click', closeOperationConfirmModal);
    }
    if (operationConfirmModal) {
      operationConfirmModal.addEventListener('click', function (e) {
        if (e.target === operationConfirmModal) closeOperationConfirmModal();
      });
    }
    if (closeDmsLogClose) {
      closeDmsLogClose.addEventListener('click', closeCloseDmsLogModal);
    }
    if (closeDmsLogModal) {
      closeDmsLogModal.addEventListener('click', function (e) {
        if (e.target === closeDmsLogModal) closeCloseDmsLogModal();
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

    const leaveConfirmModal = byId('leaveServersConfirmModal');
    const leaveConfirmBtn = byId('leaveServersConfirmBtn');
    const leaveCancelBtn = byId('leaveServersCancelBtn');
    if (leaveConfirmBtn) {
      leaveConfirmBtn.addEventListener('click', function () {
        const modal = byId('leaveServersConfirmModal');
        const targetId = modal && modal.dataset.leaveTargetId ? modal.dataset.leaveTargetId : '';
        const targetRowId = modal && modal.dataset.leaveTargetRow ? modal.dataset.leaveTargetRow : '';
        const targetServer = targetId ? {
          id: targetId,
          name: (state.guilds || []).find(function (server) { return String(server.id) === String(targetId); })?.name || targetId,
          rowEl: targetRowId ? document.querySelector('[data-id="' + targetRowId + '"]') : null
        } : null;
        closeLeaveServersConfirmModal();
        if (targetServer && targetServer.rowEl) {
          targetServer.rowEl.classList.add('removing');
        }
        runLeaveServersOperation(targetServer);
      });
    }
    if (leaveCancelBtn) {
      leaveCancelBtn.addEventListener('click', closeLeaveServersConfirmModal);
    }
    if (leaveConfirmModal) {
      leaveConfirmModal.addEventListener('click', function (e) {
        if (e.target === leaveConfirmModal) {
          closeLeaveServersConfirmModal();
        }
      });
    }

    const removeFriendsConfirmModal = byId('removeFriendsConfirmModal');
    const removeFriendsConfirmBtn = byId('removeFriendsConfirmBtn');
    const removeFriendsCancelBtn = byId('removeFriendsCancelBtn');
    if (removeFriendsConfirmBtn) {
      removeFriendsConfirmBtn.addEventListener('click', function () {
        closeRemoveFriendsConfirmModal();
        runRemoveFriendsOperation();
      });
    }
    if (removeFriendsCancelBtn) {
      removeFriendsCancelBtn.addEventListener('click', closeRemoveFriendsConfirmModal);
    }
    if (removeFriendsConfirmModal) {
      removeFriendsConfirmModal.addEventListener('click', function (e) {
        if (e.target === removeFriendsConfirmModal) {
          closeRemoveFriendsConfirmModal();
        }
      });
    }

    const removeFriendsLogModal = byId('removeFriendsLogModal');
    const removeFriendsLogClose = byId('removeFriendsLogClose');
    if (removeFriendsLogClose) {
      removeFriendsLogClose.addEventListener('click', closeRemoveFriendsLogModal);
    }
    if (removeFriendsLogModal) {
      removeFriendsLogModal.addEventListener('click', function (e) {
        if (e.target === removeFriendsLogModal) {
          closeRemoveFriendsLogModal();
        }
      });
    }

    const leaveLogModal = byId('leaveServersLogModal');
    const leaveLogClose = byId('leaveServersLogClose');
    if (leaveLogClose) {
      leaveLogClose.addEventListener('click', closeLeaveServersLogModal);
    }
    if (leaveLogModal) {
      leaveLogModal.addEventListener('click', function (e) {
        if (e.target === leaveLogModal) {
          closeLeaveServersLogModal();
        }
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (historyModal && historyModal.classList.contains('active')) {
          closeModal();
        }
        if (leaveConfirmModal && leaveConfirmModal.classList.contains('active')) {
          closeLeaveServersConfirmModal();
        }
        if (removeFriendsConfirmModal && removeFriendsConfirmModal.classList.contains('active')) {
          closeRemoveFriendsConfirmModal();
        }
        if (leaveLogModal && leaveLogModal.classList.contains('active')) {
          closeLeaveServersLogModal();
        }
        if (removeFriendsLogModal && removeFriendsLogModal.classList.contains('active')) {
          closeRemoveFriendsLogModal();
        }
        if (closeDmsConfirmModal && closeDmsConfirmModal.classList.contains('active')) {
          closeCloseDmsConfirmModal();
        }
        if (operationConfirmModal && operationConfirmModal.classList.contains('active')) {
          closeOperationConfirmModal();
        }
        if (closeDmsLogModal && closeDmsLogModal.classList.contains('active')) {
          closeCloseDmsLogModal();
        }
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
        const accountId = state.user && state.user.id ? String(state.user.id) : '';
        if (!accountId) {
          toast('Log in before saving account whitelists.', 'warning');
          return;
        }
        const all = jsonGet(localStorage, CONFIG.dsc.whitelistsByAccount) || {};
        all[accountId] = wl;
        jsonSet(localStorage, CONFIG.dsc.whitelistsByAccount, all);
        toast('Whitelist saved for this account.', 'success');
      });
    }
    if (deactivate) {
      deactivate.addEventListener('click', function () {
        if (!window.confirm('Deactivate the current session and keep saved accounts?')) {
          return;
        }
        cancelOperationForExit();
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
            if (key.indexOf('opHistory_') === 0) {
              localStorage.removeItem(key);
            }
          });
          Object.keys(sessionStorage).forEach(function (key) {
            if (key.indexOf('dmt.') === 0) {
              sessionStorage.removeItem(key);
            }
          });
        } catch (e) { }
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

  /* ---------- Inspector Module (Friends / Servers / DMs) ---------- */

  function openInspector(type) {
    if (!hasAccount()) {
      toast('Please log in to your Discord account first.', 'error');
      return;
    }
    state.inspectType = type || 'friends';
    state.inspectSelected = [];
    state.inspectSelectMode = false;
    state.inspectSearchQuery = '';

    const searchInput = byId('inspectorSearchInput');
    if (searchInput) {
      searchInput.value = '';
    }
    const clearSearchBtn = byId('inspectorClearSearch');
    if (clearSearchBtn) {
      clearSearchBtn.style.display = 'none';
    }

    const modal = byId('inspectorModal');
    if (modal) {
      modal.classList.add('active');
      modal.classList.remove('selection-mode');
    }

    renderInspector();

    const MAX_DATA_AGE = 5 * 60 * 1000;
    const stale = !state.dataLoaded || !state.lastDataLoad || (Date.now() - state.lastDataLoad) > MAX_DATA_AGE;
    if (stale) {
      const list = byId('inspectorList');
      if (list && (!state.guilds.length && !state.rel.length && !state.channels.length)) {
        list.innerHTML = '<li class="inspector-empty"><div class="brand-dot" style="margin-bottom:8px;"></div><span>Fetching fresh data from Discord...</span></li>';
      }
      loadAccountData()
        .then(function (data) {
          updateMetricsFrom(data);
          renderInspector();
        })
        .catch(function (err) {
          toast(err.message || 'Failed to load Discord data.', 'error');
          renderInspector();
        });
    }
  }

  function closeInspector() {
    const modal = byId('inspectorModal');
    if (modal) {
      modal.classList.remove('active');
      modal.classList.remove('selection-mode');
    }
    state.inspectType = null;
    state.inspectSelected = [];
    state.inspectSelectMode = false;
    state.inspectSearchQuery = '';
  }

  function setInspectorSelectMode(active) {
    state.inspectSelectMode = !!active;
    if (!state.inspectSelectMode) {
      state.inspectSelected = [];
    }
    renderInspector();
  }

  function toggleInspectItem(id, forceSelect) {
    const idx = state.inspectSelected.indexOf(id);
    if (forceSelect === true) {
      if (idx === -1) {
        state.inspectSelected.push(id);
      }
    } else {
      if (idx !== -1) {
        state.inspectSelected.splice(idx, 1);
      } else {
        state.inspectSelected.push(id);
      }
    }
    renderInspector();
  }

  function getInspectableItems(type) {
    const q = (state.inspectSearchQuery || '').toLowerCase().trim();
    let items = [];

    if (type === 'friends') {
      items = (state.rel || []).filter(function (r) {
        return r && r.id && [1, 2, 3, 4, 5].indexOf(Number(r.type)) !== -1;
      }).map(function (r) {
        const u = r.user || {};
        const name = u.global_name || u.username || 'Friend';
        const handle = u.username || 'user';
        const discrim = (u.discriminator && u.discriminator !== '0') ? '#' + u.discriminator : '';
        const sub = getRelationshipTypeLabel(r.type) + ' \u00b7 @' + handle + discrim + ' \u00b7 ID: ' + r.id;
        return {
          id: r.id,
          raw: r,
          title: name,
          subtitle: sub,
          avatar: avatarUrl(u, 128),
          initials: (name || handle).slice(0, 1).toUpperCase(),
          isServer: false,
          isOwned: false,
          relationshipType: getRelationshipTypeLabel(r.type)
        };
      });
    } else if (type === 'servers') {
      items = (state.guilds || []).map(function (g) {
        return {
          id: g.id,
          raw: g,
          title: g.name || 'Server',
          subtitle: 'ID: ' + g.id,
          avatar: guildIconUrl(g, 128),
          initials: (g.name || 'S').slice(0, 1).toUpperCase(),
          isServer: true,
          isOwned: !!g.owner,
          relationshipType: g.owner ? 'Owner' : 'Member'
        };
      });
    } else if (type === 'owned') {
      items = (state.guilds || []).filter(function (g) {
        return !!g.owner;
      }).map(function (g) {
        return {
          id: g.id,
          raw: g,
          title: g.name || 'Server',
          subtitle: 'ID: ' + g.id,
          avatar: guildIconUrl(g, 128),
          initials: (g.name || 'S').slice(0, 1).toUpperCase(),
          isServer: true,
          isOwned: true
        };
      });
    } else if (type === 'dms') {
      items = (state.channels || []).filter(function (c) {
        return c.type === 1 || c.type === 3;
      }).map(function (c) {
        let title = '';
        let sub = '';
        let avatar = '';
        let initials = 'DM';
        let recipientId = null;

        if (c.type === 3) {
          title = c.name || (c.recipients || []).map(function (r) { return r.username; }).join(', ') || 'Group DM';
          sub = (c.recipients || []).length + ' Members \u00b7 ID: ' + c.id;
          initials = 'GD';
        } else {
          const r = (c.recipients && c.recipients[0]) || {};
          recipientId = r.id;
          title = r.global_name || r.username || 'Direct Message';
          const discrim = (r.discriminator && r.discriminator !== '0') ? '#' + r.discriminator : '';
          sub = '@' + (r.username || r.id || 'user') + discrim + ' \u00b7 Channel: ' + c.id;
          avatar = avatarUrl(r, 128);
          initials = (title || 'D').slice(0, 1).toUpperCase();
        }
        return {
          id: c.id,
          recipientId: recipientId,
          raw: c,
          title: title,
          subtitle: sub,
          avatar: avatar,
          initials: initials,
          isServer: false,
          isOwned: false,
          isGroup: c.type === 3
        };
      });
    }

    if (q) {
      items = items.filter(function (item) {
        return item.title.toLowerCase().indexOf(q) !== -1 ||
          item.subtitle.toLowerCase().indexOf(q) !== -1 ||
          item.id.toLowerCase().indexOf(q) !== -1;
      });
    }

    return items;
  }

  function renderInspector() {
    const modal = byId('inspectorModal');
    const titleEl = byId('inspectorTitle');
    const subtitleEl = byId('inspectorSubtitle');
    const iconEl = byId('inspectorIcon');
    const countBadge = byId('inspectorCountBadge');
    const listEl = byId('inspectorList');
    const toggleBtn = byId('inspectorSelectToggleBtn');
    const toggleText = byId('inspectorSelectToggleText');
    const selCountText = byId('inspectorSelectedCount');
    const dynamicBatchBtns = byId('inspectorDynamicBatchBtns');

    if (!modal || !listEl) return;

    const type = state.inspectType || 'friends';
    modal.classList.toggle('selection-mode', !!state.inspectSelectMode);
    if (toggleBtn) {
      toggleBtn.classList.toggle('active', !!state.inspectSelectMode);
    }
    if (toggleText) {
      toggleText.textContent = state.inspectSelectMode ? 'Cancel Select' : 'Select';
    }

    if (type === 'friends') {
      if (titleEl) titleEl.textContent = 'Friends List';
      if (subtitleEl) subtitleEl.textContent = 'Manage friends, remove or block mutual connections';
      if (iconEl) iconEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
    } else if (type === 'servers') {
      if (titleEl) titleEl.textContent = 'Joined Servers';
      if (subtitleEl) subtitleEl.textContent = 'Manage and leave community servers';
      if (iconEl) iconEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
    } else if (type === 'owned') {
      if (titleEl) titleEl.textContent = 'Owned Servers';
      if (subtitleEl) subtitleEl.textContent = 'Servers where you have ownership privileges';
      if (iconEl) iconEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/></svg>';
    } else if (type === 'dms') {
      if (titleEl) titleEl.textContent = 'Private DMs';
      if (subtitleEl) subtitleEl.textContent = 'Direct messages and group conversations';
      if (iconEl) iconEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    }

    const items = getInspectableItems(type);
    if (countBadge) {
      countBadge.textContent = items.length + ' ' + (items.length === 1 ? 'item' : 'items');
    }

    if (selCountText) {
      selCountText.textContent = state.inspectSelected.length + ' selected';
    }

    if (dynamicBatchBtns) {
      dynamicBatchBtns.innerHTML = '';
      if (type === 'friends') {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn btn-small btn-batch-remove';
        removeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M18 8l3 3M21 8l-3 3"/></svg><span>Remove Relationships</span>';
        removeBtn.addEventListener('click', handleBatchRemoveFriends);
        dynamicBatchBtns.appendChild(removeBtn);

        const blockBtn = document.createElement('button');
        blockBtn.type = 'button';
        blockBtn.className = 'btn btn-small btn-batch-block';
        blockBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14"/></svg><span>Block Selected</span>';
        blockBtn.addEventListener('click', handleBatchBlockFriends);
        dynamicBatchBtns.appendChild(blockBtn);
      } else if (type === 'servers') {
        const leaveBtn = document.createElement('button');
        leaveBtn.type = 'button';
        leaveBtn.className = 'btn btn-small btn-batch-leave';
        leaveBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg><span>Leave Selected</span>';
        leaveBtn.addEventListener('click', handleBatchLeaveServers);
        dynamicBatchBtns.appendChild(leaveBtn);
      } else if (type === 'owned') {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-small btn-batch-remove';
        delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg><span>Delete Selected</span>';
        delBtn.addEventListener('click', handleBatchDeleteOwnedServers);
        dynamicBatchBtns.appendChild(delBtn);
      } else if (type === 'dms') {
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn btn-small btn-batch-close';
        closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg><span>Close Selected DMs</span>';
        closeBtn.addEventListener('click', handleBatchCloseDMs);
        dynamicBatchBtns.appendChild(closeBtn);

        const ignoreBtn = document.createElement('button');
        ignoreBtn.type = 'button';
        ignoreBtn.className = 'btn btn-small btn-batch-ignore';
        ignoreBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14"/></svg><span>Ignore Selected</span>';
        ignoreBtn.addEventListener('click', handleBatchIgnoreDMs);
        dynamicBatchBtns.appendChild(ignoreBtn);
      }
    }

    listEl.innerHTML = '';
    if (!items.length) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'inspector-empty';
      emptyLi.innerHTML = '<div class="inspector-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg></div><span>No ' + type + ' found matching your search.</span>';
      listEl.appendChild(emptyLi);
      return;
    }

    items.forEach(function (item) {
      const isSelected = state.inspectSelected.indexOf(item.id) !== -1;
      const li = document.createElement('li');
      li.className = 'inspector-item' + (isSelected ? ' selected' : '') + (type === 'dms' ? (item.isGroup ? ' dm-group' : ' dm-direct') : '');
      li.setAttribute('data-id', item.id);

      const circle = document.createElement('span');
      circle.className = 'inspector-select-circle';
      circle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';
      li.appendChild(circle);

      const avatar = document.createElement('div');
      avatar.className = item.isServer ? 'inspector-guild-icon' : 'inspector-avatar';
      if (item.avatar) {
        avatar.style.backgroundImage = 'url("' + item.avatar + '")';
      } else {
        avatar.textContent = item.initials;
      }
      li.appendChild(avatar);

      const info = document.createElement('div');
      info.className = 'inspector-item-info';
      const nameEl = document.createElement('div');
      nameEl.className = 'inspector-primary-name';
      nameEl.textContent = item.title;
      if (item.isOwned) {
        const badge = document.createElement('span');
        badge.className = 'inspector-tag-badge owner';
        badge.textContent = 'Owner';
        nameEl.appendChild(badge);
      }
      if (item.relationshipType && !item.isOwned) {
        const relationBadge = document.createElement('span');
        relationBadge.className = 'inspector-tag-badge';
        relationBadge.textContent = item.relationshipType;
        nameEl.appendChild(relationBadge);
      }
      if (type === 'dms') {
        const dmBadge = document.createElement('span');
        dmBadge.className = 'inspector-tag-badge dm-type ' + (item.isGroup ? 'group' : 'direct');
        dmBadge.textContent = item.isGroup ? 'Group' : 'Direct';
        nameEl.appendChild(dmBadge);
      }
      if (inWl(whitelistKindForItem(item), item.id)) {
        const whitelistBadge = document.createElement('span');
        whitelistBadge.className = 'inspector-tag-badge whitelist';
        whitelistBadge.textContent = 'Whitelisted';
        nameEl.appendChild(whitelistBadge);
      }
      const subEl = document.createElement('div');
      subEl.className = 'inspector-secondary-sub';
      subEl.textContent = item.subtitle;
      info.appendChild(nameEl);
      info.appendChild(subEl);
      li.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'inspector-item-actions';

      if (type === 'friends' || type === 'servers' || type === 'dms') {
        const whitelistBtn = document.createElement('button');
        const itemKind = whitelistKindForItem(item);
        const whitelisted = inWl(itemKind, item.id);
        whitelistBtn.type = 'button';
        whitelistBtn.className = 'btn btn-action-whitelist btn-small' + (whitelisted ? ' active' : '');
        whitelistBtn.textContent = whitelisted ? 'Un whitelist' : 'Whitelist';
        whitelistBtn.title = whitelisted ? 'Allow this item in operations' : 'Protect this item from operations';
        whitelistBtn.setAttribute('aria-pressed', String(whitelisted));
        whitelistBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          setWhitelist(itemKind, item.id, !whitelisted);
          renderInspector();
          toast((!whitelisted ? 'Added to ' : 'Removed from ') + itemKind + ' whitelist.', 'success');
        });
        actions.appendChild(whitelistBtn);
      }

      if (type === 'friends') {
        const relationshipType = Number(item.raw && item.raw.type);
        const relationshipAction = getRelationshipActionLabel(relationshipType);
        if (relationshipType === 1) {
          const blockBtn = document.createElement('button');
          blockBtn.type = 'button';
          blockBtn.className = 'btn btn-action-block btn-small';
          blockBtn.textContent = 'Block';
          blockBtn.title = 'Block this user';
          blockBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            handleSingleBlockFriend(item.id, item.title, li);
          });
          actions.appendChild(blockBtn);
        }

        const relationshipBtn = document.createElement('button');
        relationshipBtn.type = 'button';
        relationshipBtn.className = 'btn btn-action-remove btn-small';
        relationshipBtn.textContent = relationshipAction;
        relationshipBtn.title = relationshipAction + ' this relationship';
        relationshipBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          handleSingleRemoveFriend(item.id, item.title, li, relationshipAction);
        });
        actions.appendChild(relationshipBtn);
      } else if (type === 'servers') {
        if (!item.isOwned) {
          const leaveBtn = document.createElement('button');
          leaveBtn.type = 'button';
          leaveBtn.className = 'btn btn-action-leave btn-small';
          leaveBtn.textContent = 'Leave';
          leaveBtn.title = 'Leave this server';
          leaveBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            handleSingleLeaveServer(item.id, item.title, li);
          });
          actions.appendChild(leaveBtn);
        }
      } else if (type === 'owned') {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-action-remove btn-small';
        delBtn.textContent = 'Delete Server';
        delBtn.title = 'Delete owned server';
        delBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          handleSingleDeleteServer(item.id, item.title, li);
        });
        actions.appendChild(delBtn);
      } else if (type === 'dms') {
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn btn-action-close btn-small';
        closeBtn.textContent = 'Close DM';
        closeBtn.title = 'Close this DM conversation';
        closeBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          handleSingleCloseDM(item.id, item.title, li);
        });

        const ignoreBtn = document.createElement('button');
        ignoreBtn.type = 'button';
        ignoreBtn.className = 'btn btn-action-ignore btn-small';
        ignoreBtn.textContent = 'Ignore';
        ignoreBtn.title = 'Block recipient & close conversation';
        ignoreBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          handleSingleIgnoreDM(item.id, item.recipientId, item.title, li);
        });

        actions.appendChild(closeBtn);
        actions.appendChild(ignoreBtn);
      }

      li.appendChild(actions);
      attachItemInteractions(li, item.id);
      listEl.appendChild(li);
    });
  }

  function attachItemInteractions(rowEl, itemId) {
    let pressTimer = null;
    let isLongPress = false;

    // Right-Click handler
    rowEl.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (!state.inspectSelectMode) {
        setInspectorSelectMode(true);
      }
      toggleInspectItem(itemId, true);
    });

    // Long-press handlers (touch & mouse)
    const startPress = function (e) {
      if (e.type === 'mousedown' && e.button !== 0) return;
      if (state.inspectSelectMode) return;
      isLongPress = false;
      pressTimer = setTimeout(function () {
        isLongPress = true;
        if (navigator.vibrate) {
          try { navigator.vibrate(40); } catch (err) { }
        }
        setInspectorSelectMode(true);
        toggleInspectItem(itemId, true);
      }, 420);
    };

    const cancelPress = function () {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };

    rowEl.addEventListener('mousedown', startPress);
    rowEl.addEventListener('mouseup', cancelPress);
    rowEl.addEventListener('mouseleave', cancelPress);

    rowEl.addEventListener('touchstart', startPress, { passive: true });
    rowEl.addEventListener('touchend', cancelPress);
    rowEl.addEventListener('touchcancel', cancelPress);
    rowEl.addEventListener('touchmove', cancelPress);

    // Click handler
    rowEl.addEventListener('click', function (e) {
      if (isLongPress) {
        isLongPress = false;
        return;
      }
      if (e.target && e.target.closest && e.target.closest('.inspector-item-actions')) {
        return;
      }
      if (state.inspectSelectMode) {
        toggleInspectItem(itemId);
      }
    });
  }

  /* Single Item Action Handlers */

  function handleSingleRemoveFriend(id, name, rowEl, actionLabel) {
    if (inWl('friends', id)) {
      toast('This friend is whitelisted. Remove the whitelist first.', 'warning');
      return;
    }
    const action = actionLabel || 'Remove Friend';
    openOperationConfirmModal(action, function () {
      return [{
        label: action + ': ' + name,
        action: function () {
          if (rowEl) {
            rowEl.classList.add('removing');
          }
          return apiCall('DELETE', '/users/@me/relationships/' + id).then(function (res) {
            if (res && res.status >= 200 && res.status < 300) {
              state.rel = (state.rel || []).filter(function (r) { return r.id !== id; });
              updateMetricsFrom(state);
              setTimeout(renderInspector, 200);
              return res;
            }
            if (rowEl) {
              rowEl.classList.remove('removing');
            }
            return Promise.reject(new Error(handleAuthError((res && res.data) || {}) || 'Could not remove relationship.'));
          }).catch(function (err) {
            if (rowEl) {
              rowEl.classList.remove('removing');
            }
            throw err;
          });
        }
      }];
    }, rowEl, 'Confirm removing this relationship.');
  }

  function handleSingleBlockFriend(id, name, rowEl) {
    if (inWl('friends', id)) {
      toast('This friend is whitelisted. Remove the whitelist first.', 'warning');
      return;
    }
    if (!window.confirm('Block user "' + name + '"?')) return;
    rowEl.classList.add('removing');
    apiCall('PUT', '/users/@me/relationships/' + id, { type: 2 })
      .then(function (res) {
        if (res.status >= 200 && res.status < 300) {
          state.rel = (state.rel || []).filter(function (r) { return r.id !== id; });
          updateMetricsFrom(state);
          setTimeout(renderInspector, 200);
          toast('Blocked user: ' + name, 'success');
        } else {
          rowEl.classList.remove('removing');
          toast(handleAuthError(res.data || {}), 'error');
        }
      })
      .catch(function () {
        rowEl.classList.remove('removing');
        toast('Cannot reach Discord API.', 'error');
      });
  }

  function handleSingleLeaveServer(id, name, rowEl) {
    const server = (state.guilds || []).filter(function (g) { return g.id === id; })[0];
    if ((server && server.owner) || inWl('servers', id)) {
      toast(server && server.owner ? 'Owned servers cannot be left.' : 'This server is whitelisted. Remove the whitelist first.', 'warning');
      return;
    }
    openLeaveServersConfirmModal({ id: id, name: name, rowEl: rowEl });
  }

  function handleSingleDeleteServer(id, name, rowEl) {
    if (!window.confirm('Permanently delete owned server "' + name + '"? This cannot be undone.')) return;
    rowEl.classList.add('removing');
    apiCall('DELETE', '/guilds/' + id)
      .then(function (res) {
        if (res.status >= 200 && res.status < 300) {
          state.guilds = (state.guilds || []).filter(function (g) { return g.id !== id; });
          updateMetricsFrom(state);
          setTimeout(renderInspector, 200);
          toast('Deleted server: ' + name, 'success');
        } else {
          rowEl.classList.remove('removing');
          toast(handleAuthError(res.data || {}), 'error');
        }
      })
      .catch(function () {
        rowEl.classList.remove('removing');
        toast('Cannot reach Discord API.', 'error');
      });
  }

  function closeDmChannel(channelId) {
    return apiCall('DELETE', '/channels/' + channelId).then(function (res) {
      if (res.status >= 200 && res.status < 300) {
        state.channels = (state.channels || []).filter(function (c) { return c.id !== channelId; });
        return { ok: true, status: res.status };
      }
      return { ok: false, status: res.status, data: res.data };
    });
  }

  function handleSingleCloseDM(channelId, name, rowEl) {
    if (inWl('dms', channelId) || inWl('dms', name)) {
      toast('This DM is whitelisted. Remove the whitelist first.', 'warning');
      return;
    }
    rowEl.classList.add('removing');
    closeDmChannel(channelId)
      .then(function (res) {
        if (res.ok) {
          updateMetricsFrom(state);
          setTimeout(renderInspector, 200);
          toast('Closed DM with ' + name, 'success');
        } else {
          rowEl.classList.remove('removing');
          toast(handleAuthError(res.data || {}), 'error');
        }
      })
      .catch(function () {
        rowEl.classList.remove('removing');
        toast('Cannot reach Discord API.', 'error');
      });
  }

  function handleSingleIgnoreDM(channelId, recipientId, name, rowEl) {
    if (inWl('dms', channelId) || inWl('dms', name)) {
      toast('This DM is whitelisted. Remove the whitelist first.', 'warning');
      return;
    }
    rowEl.classList.add('removing');
    const blockPromise = recipientId ? apiCall('PUT', '/users/@me/relationships/' + recipientId, { type: 2 }) : Promise.resolve();
    blockPromise.then(function () {
      return closeDmChannel(channelId);
    }).then(function (res) {
      if (res.ok) {
        if (recipientId) {
          state.rel = (state.rel || []).filter(function (r) { return r.id !== recipientId; });
        }
        updateMetricsFrom(state);
        setTimeout(renderInspector, 200);
        toast('Ignored & closed DM with ' + name, 'success');
      } else {
        rowEl.classList.remove('removing');
        toast(handleAuthError(res.data || {}), 'error');
      }
    }).catch(function () {
      rowEl.classList.remove('removing');
      toast('Cannot reach Discord API.', 'error');
    });
  }

  /* Batch Actions */

  function executeBatchAction(title, items, processFn, onFinish) {
    if (!items || !items.length) {
      toast('Select at least one item first.', 'info');
      return;
    }
    if (!window.confirm('Confirm ' + title + ' for ' + items.length + ' item(s)?')) {
      return;
    }
    let index = 0;
    toast('Starting: ' + title + ' (' + items.length + ')...', 'info');

    const step = function () {
      if (index >= items.length) {
        toast('Completed: ' + title, 'success');
        state.inspectSelected = [];
        state.inspectSelectMode = false;
        updateMetricsFrom(state);
        renderInspector();
        if (onFinish) onFinish();
        return;
      }
      const currentId = items[index];
      index += 1;
      processFn(currentId).catch(function () { }).finally(function () {
        setTimeout(step, currentDelay());
      });
    };
    step();
  }

  function handleBatchRemoveFriends() {
    const ids = state.inspectSelected.filter(function (id) {
      return !inWl('friends', id);
    });
    if (ids.length !== state.inspectSelected.length) {
      toast('Whitelisted friends were skipped.', 'warning');
    }
    executeBatchAction('Remove Friends', ids, function (id) {
      return apiCall('DELETE', '/users/@me/relationships/' + id).then(function (res) {
        if (res.status >= 200 && res.status < 300) {
          state.rel = (state.rel || []).filter(function (r) { return r.id !== id; });
        }
      });
    });
  }

  function handleBatchBlockFriends() {
    const ids = state.inspectSelected.filter(function (id) {
      const rel = (state.rel || []).filter(function (r) { return r.id === id; })[0];
      return rel && Number(rel.type) === 1 && !inWl('friends', id);
    });
    if (ids.length !== state.inspectSelected.length) {
      toast('Non-friends and whitelisted friends were skipped.', 'warning');
    }
    executeBatchAction('Block Friends', ids, function (id) {
      return apiCall('PUT', '/users/@me/relationships/' + id, { type: 2 }).then(function (res) {
        if (res.status >= 200 && res.status < 300) {
          state.rel = (state.rel || []).filter(function (r) { return r.id !== id; });
        }
      });
    });
  }

  function handleBatchLeaveServers() {
    const ids = state.inspectSelected.filter(function (id) {
      const server = (state.guilds || []).filter(function (g) { return g.id === id; })[0];
      return server && !server.owner && !inWl('servers', id);
    });
    if (ids.length !== state.inspectSelected.length) {
      toast('Owned or whitelisted servers were skipped.', 'warning');
    }
    executeBatchAction('Leave Servers', ids, function (id) {
      return apiCall('DELETE', '/users/@me/guilds/' + id).then(function (res) {
        if (res.status >= 200 && res.status < 300) {
          state.guilds = (state.guilds || []).filter(function (g) { return g.id !== id; });
        }
      });
    });
  }

  function handleBatchDeleteOwnedServers() {
    const ids = state.inspectSelected.slice();
    executeBatchAction('Delete Servers', ids, function (id) {
      return apiCall('DELETE', '/guilds/' + id).then(function (res) {
        if (res.status >= 200 && res.status < 300) {
          state.guilds = (state.guilds || []).filter(function (g) { return g.id !== id; });
        }
      });
    });
  }

  function handleBatchCloseDMs() {
    const ids = state.inspectSelected.filter(function (id) {
      return !inWl('dms', id);
    });
    if (ids.length !== state.inspectSelected.length) {
      toast('Whitelisted DMs were skipped.', 'warning');
    }
    executeBatchAction('Hide / Close DMs', ids, function (id) {
      return closeDmChannel(id).then(function (res) {
        if (!res.ok) {
          throw new Error('Close DM failed');
        }
      });
    });
  }

  function handleBatchIgnoreDMs() {
    const ids = state.inspectSelected.filter(function (id) {
      return !inWl('dms', id);
    });
    if (ids.length !== state.inspectSelected.length) {
      toast('Whitelisted DMs were skipped.', 'warning');
    }
    executeBatchAction('Ignore & Close DMs', ids, function (channelId) {
      const ch = (state.channels || []).filter(function (c) { return c.id === channelId; })[0];
      const recId = (ch && ch.recipients && ch.recipients[0]) ? ch.recipients[0].id : null;
      const blockPromise = recId ? apiCall('PUT', '/users/@me/relationships/' + recId, { type: 2 }) : Promise.resolve();
      return blockPromise.then(function () {
        return closeDmChannel(channelId);
      }).then(function (res) {
        if (res.ok) {
          if (recId) {
            state.rel = (state.rel || []).filter(function (r) { return r.id !== recId; });
          }
        }
      });
    });
  }

  function initInspector() {
    const closeBtn = byId('inspectorCloseBtn');
    const modal = byId('inspectorModal');
    const toggleBtn = byId('inspectorSelectToggleBtn');
    const searchInput = byId('inspectorSearchInput');
    const clearSearchBtn = byId('inspectorClearSearch');
    const selectAllBtn = byId('inspectorSelectAllBtn');
    const deselectAllBtn = byId('inspectorDeselectAllBtn');
    const cancelSelectBtn = byId('inspectorCancelSelectBtn');

    if (closeBtn) {
      closeBtn.addEventListener('click', closeInspector);
    }
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) {
          closeInspector();
        }
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
        closeInspector();
      }
    });

    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        setInspectorSelectMode(!state.inspectSelectMode);
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        state.inspectSearchQuery = searchInput.value || '';
        if (clearSearchBtn) {
          clearSearchBtn.style.display = searchInput.value ? 'inline-flex' : 'none';
        }
        renderInspector();
      });
    }

    if (clearSearchBtn && searchInput) {
      clearSearchBtn.addEventListener('click', function () {
        searchInput.value = '';
        state.inspectSearchQuery = '';
        clearSearchBtn.style.display = 'none';
        renderInspector();
        searchInput.focus();
      });
    }

    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', function () {
        const items = getInspectableItems(state.inspectType);
        state.inspectSelected = items.map(function (i) { return i.id; });
        renderInspector();
      });
    }

    if (deselectAllBtn) {
      deselectAllBtn.addEventListener('click', function () {
        state.inspectSelected = [];
        renderInspector();
      });
    }

    if (cancelSelectBtn) {
      cancelSelectBtn.addEventListener('click', function () {
        setInspectorSelectMode(false);
      });
    }

    const grid = byId('summaryGrid');
    if (grid) {
      grid.addEventListener('click', function (e) {
        const card = e.target && e.target.closest ? e.target.closest('.stat-card[data-inspect]') : null;
        if (card) {
          const inspectType = card.getAttribute('data-inspect');
          if (inspectType) {
            openInspector(inspectType);
          }
        }
      });
      grid.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          const card = e.target && e.target.closest ? e.target.closest('.stat-card[data-inspect]') : null;
          if (card) {
            e.preventDefault();
            const inspectType = card.getAttribute('data-inspect');
            if (inspectType) {
              openInspector(inspectType);
            }
          }
        }
      });
    }
  }

  /* ---------- Boot ---------- */

  function refreshActiveAccountFromToken() {
    const token = normalizeToken(state.token || storageGet(localStorage, CONFIG.dsc.token));
    if (!token) {
      return Promise.resolve(false);
    }

    return validateToken(token)
      .then(function (res) {
        const profile = res && res.data && res.data.id ? res.data : null;
        if (!profile) {
          return false;
        }
        const stale = !state.user || !state.user.id || isSyntheticUser(state.user);
        const fromTokenMissing = state.user && state.user.id && profile.id && state.user.id !== profile.id;
        const needsRefresh = stale || fromTokenMissing || state.user.username !== profile.username || state.user.global_name !== profile.global_name || state.user.avatar !== profile.avatar;
        if (!needsRefresh) {
          return true;
        }
        setActiveAccount(token, profile);
        jsonSet(localStorage, CONFIG.dsc.user, {
          username: profile.global_name || profile.username || 'Unknown',
          token: token
        });
        return true;
      })
      .catch(function () {
        if (state.user && isSyntheticUser(state.user)) {
          clearActiveAccount();
        }
        return false;
      });
  }

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
    initInspector();
    initEvolutionDashboard();
    initSettings();

    refreshActiveAccountFromToken().finally(function () {
      if (state.user && isSyntheticUser(state.user)) {
        clearActiveAccount();
      }
      if (hasAccount()) {
        applyAccountState();
        showView('dashboard', { persist: false });
      } else {
        showView('login', { persist: false });
      }
      applyAccountLock();
      setTimeout(applyBadge, 0);
    });
  }

  boot();
})();