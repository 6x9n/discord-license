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

/* ---------------- Phase 2 — Responsive Web Shell & Navigation ---------------- */

(function () {
  const CONFIG = window.CONFIG;
  const root = document.getElementById('appScreen');
  const pageTitle = document.getElementById('pageTitle');
  const menuToggle = document.getElementById('menuToggle');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const themeToggle = document.getElementById('themeToggle');
  const drawerBackdrop = document.getElementById('drawerBackdrop');
  const mainCanvas = document.getElementById('mainCanvas');

  const TABS = {
    dashboard: { title: 'Dashboard', panel: 'viewDashboard' },
    manager: { title: 'Manager', panel: 'viewManager' },
    settings: { title: 'Settings', panel: 'viewSettings' }
  };

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

  function setActiveTab(name, opts) {
    const tab = Object.prototype.hasOwnProperty.call(TABS, name) ? name : 'dashboard';
    const spec = TABS[tab];
    const navLinks = document.querySelectorAll('.nav-link[data-tab]');
    const panels = document.querySelectorAll('.view-panel');

    panels.forEach(function (panel) {
      panel.classList.toggle('active', panel.id === spec.panel);
    });
    navLinks.forEach(function (link) {
      const active = link.getAttribute('data-tab') === tab;
      link.classList.toggle('active', active);
      if (active) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
    if (pageTitle) {
      pageTitle.textContent = spec.title;
    }
    if (mainCanvas) {
      mainCanvas.scrollTop = 0;
    }
    if (!opts || opts.persist !== false) {
      storageSet(sessionStorage, CONFIG.nav.tabKey, tab);
    }
  }

  function openDrawer() {
    document.body.classList.add('drawer-open');
  }

  function closeDrawer() {
    document.body.classList.remove('drawer-open');
  }

  function toggleTheme() {
    const htmlEl = document.documentElement;
    const next = htmlEl.getAttribute('data-theme') === 'light' ? '' : 'light';
    if (next) {
      htmlEl.setAttribute('data-theme', 'light');
    } else {
      htmlEl.removeAttribute('data-theme');
    }
    storageSet(localStorage, CONFIG.nav.themeKey, next);
  }

  function applyTheme() {
    if (storageGet(localStorage, CONFIG.nav.themeKey) === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }

  function applySidebar() {
    if (root && storageGet(localStorage, CONFIG.nav.sidebarKey) === '1') {
      root.classList.add('sidebar-collapsed');
    }
  }

  document.addEventListener('click', function (e) {
    if (!(e.target && e.target.closest)) {
      return;
    }
    const tabLink = e.target.closest('.nav-link[data-tab]');
    if (tabLink) {
      e.preventDefault();
      setActiveTab(tabLink.getAttribute('data-tab'));
      closeDrawer();
    }
  });

  if (menuToggle) {
    menuToggle.addEventListener('click', openDrawer);
  }
  if (drawerBackdrop) {
    drawerBackdrop.addEventListener('click', closeDrawer);
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.classList.contains('drawer-open')) {
      closeDrawer();
    }
  });

  if (sidebarToggle && root) {
    sidebarToggle.addEventListener('click', function () {
      const collapsed = root.classList.toggle('sidebar-collapsed');
      storageSet(localStorage, CONFIG.nav.sidebarKey, collapsed ? '1' : '0');
    });
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  window.appNav = { setActiveTab: setActiveTab };

  applyTheme();
  applySidebar();
  setActiveTab(storageGet(sessionStorage, CONFIG.nav.tabKey) || 'dashboard');
})();

/* ---------------- Phase 3 — Dashboard, Manager Workspace, Settings ---------------- */

(function () {
  const CONFIG = window.CONFIG;

  function byId(id) {
    return document.getElementById(id);
  }

  function storageGet(store, key, fallback) {
    try {
      const raw = store.getItem(key);
      return raw === null || raw === undefined ? fallback : raw;
    } catch (e) {
      return fallback;
    }
  }

  function storageSet(store, key, value) {
    try {
      store.setItem(key, value);
    } catch (e) {}
  }

  function toast(message, kind) {
    if (window.appToast) {
      window.appToast(message, kind || 'info');
    }
  }

  /* ---------- Activity log ---------- */

  const logEl = byId('dashboardActivityLog');
  const logCountEl = byId('logCount');
  const LOG_MAX = 60;

  function renderActivityLog(event, kind) {
    if (!logEl) {
      return;
    }
    const empty = logEl.querySelector('.log-empty');
    if (empty) {
      empty.remove();
    }
    const now = new Date();
    const pad = function (n) {
      return String(n).padStart(2, '0');
    };
    const li = document.createElement('li');
    li.className = 'log-item';
    li.innerHTML =
      '<span class="log-time">' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds()) + '</span>' +
      '<span class="log-dot ' + (kind || 'info') + '"></span>' +
      '<span class="log-msg"></span>';
    li.querySelector('.log-msg').textContent = event;
    logEl.insertBefore(li, logEl.firstChild);
    while (logEl.children.length > LOG_MAX) {
      logEl.removeChild(logEl.lastChild);
    }
    if (logCountEl) {
      logCountEl.textContent = logEl.children.length + (logEl.children.length === 1 ? ' event' : ' events');
    }
  }

  /* ---------- Dashboard stats ---------- */

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function jitter(value, minJ, maxJ, minV, maxV) {
    return clamp(value + Math.floor(minJ + Math.random() * (maxJ - minJ + 1)), minV, maxV);
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function fmtUptime(ms) {
    if (ms <= 0) {
      return '0s';
    }
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (d > 0) {
      return d + 'd ' + pad2(h) + 'h ' + pad2(m) + 'm';
    }
    if (h > 0) {
      return pad2(h) + ':' + pad2(m) + ':' + pad2(sec);
    }
    return m + ':' + pad2(sec);
  }

  function startedAtMs() {
    let raw = NaN;
    try {
      raw = Number(sessionStorage.getItem(CONFIG.prefs.startedAt));
    } catch (e) {}
    if (!raw) {
      raw = Date.now();
      try {
        sessionStorage.setItem(CONFIG.prefs.startedAt, String(raw));
      } catch (e) {}
    }
    return raw;
  }

  const sim = {
    sessions: 14,
    load: 34,
    latency: 41,
    upSince: startedAtMs()
  };

  const statNodes = {
    sessions: byId('statSessions'),
    load: byId('statLoad'),
    latency: byId('statLatency'),
    uptime: byId('statUptime')
  };

  function renderDashboardStats() {
    sim.sessions = jitter(sim.sessions, -2, 3, 4, 48);
    sim.load = jitter(sim.load, -6, 7, 8, 92);
    sim.latency = jitter(sim.latency, -9, 11, 12, 140);

    if (statNodes.sessions) {
      statNodes.sessions.textContent = sim.sessions;
    }
    if (statNodes.load) {
      statNodes.load.textContent = Math.round(sim.load) + '%';
    }
    if (statNodes.latency) {
      statNodes.latency.textContent = Math.round(sim.latency) + ' ms';
    }
    if (statNodes.uptime) {
      statNodes.uptime.textContent = fmtUptime(Date.now() - sim.upSince);
    }
  }

  /* ---------- Manager workspace ---------- */

  const STATUS_META = {
    active: { label: 'Active', cls: 'active' },
    standby: { label: 'Standby', cls: 'standby' },
    error: { label: 'Error', cls: 'error' },
    offline: { label: 'Offline', cls: 'offline' }
  };

  const ACTION_ICONS = {
    view: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
    remove: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>'
  };

  const RECORDS = [
    { id: 'gateway-core-01', name: 'gateway-core-01', type: 'Service', status: 'active', region: 'fra1', updatedAt: -120000 },
    { id: 'webhooks-relay', name: 'webhooks-relay', type: 'Runner', status: 'active', region: 'iad1', updatedAt: -4000 },
    { id: 'member-scraper', name: 'member-scraper', type: 'Runner', status: 'standby', region: 'sin1', updatedAt: -660000 },
    { id: 'token-refresher', name: 'token-refresher', type: 'Service', status: 'active', region: 'fra1', updatedAt: -18000 },
    { id: 'voicestate-watcher', name: 'voicestate-watcher', type: 'Monitor', status: 'error', region: 'iad1', updatedAt: -240000 },
    { id: 'role-sync', name: 'role-sync', type: 'Service', status: 'offline', region: 'gru1', updatedAt: -3600000 },
    { id: 'presence-monitor', name: 'presence-monitor', type: 'Monitor', status: 'standby', region: 'sin1', updatedAt: -1920000 },
    { id: 'audit-collector', name: 'audit-collector', type: 'Runner', status: 'active', region: 'gru1', updatedAt: -40000 }
  ];

  const tableBody = byId('managerTableBody');
  const emptyState = byId('managerEmpty');
  const searchInput = byId('managerSearch');
  const statusFilter = byId('managerStatusFilter');
  const refreshBtn = byId('managerRefreshBtn');
  const clearBtn = byId('managerClearBtn');
  const managerWrap = byId('managerTableWrap');

  let searchTimer = null;

  function fmtAgo(msAgo) {
    const sec = Math.max(0, Math.round(-msAgo / 1000));
    if (sec < 60) {
      return sec <= 5 ? 'just now' : sec + 's ago';
    }
    const min = Math.round(sec / 60);
    if (min < 60) {
      return min + 'm ago';
    }
    const hr = Math.round(min / 60);
    if (hr < 24) {
      return hr + 'h ago';
    }
    return Math.round(hr / 24) + 'd ago';
  }

  function renderManagerRows() {
    if (!tableBody) {
      return;
    }
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const status = statusFilter ? statusFilter.value : 'all';

    const matches = RECORDS.filter(function (rec) {
      const okStatus = status === 'all' || rec.status === status;
      const haystack = (rec.name + ' ' + rec.type).toLowerCase();
      const okQuery = !query || haystack.indexOf(query) !== -1;
      return okStatus && okQuery;
    });

    tableBody.innerHTML = '';

    matches.forEach(function (rec) {
      const meta = STATUS_META[rec.status] || STATUS_META.offline;
      const tr = document.createElement('tr');

      const nameTd = document.createElement('td');
      nameTd.className = 'cell-name';
      nameTd.textContent = rec.name;

      const typeTd = document.createElement('td');
      typeTd.className = 'cell-type';
      typeTd.textContent = rec.type;

      const statusTd = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = 'status-badge status-' + meta.cls;
      badge.textContent = meta.label;
      statusTd.appendChild(badge);

      const regionTd = document.createElement('td');
      regionTd.className = 'cell-meta';
      regionTd.textContent = rec.region;

      const updatedTd = document.createElement('td');
      updatedTd.className = 'cell-meta';
      updatedTd.textContent = fmtAgo(rec.updatedAt);

      const actionsTd = document.createElement('td');
      actionsTd.className = 'td-actions';
      ['view', 'edit', 'remove'].forEach(function (action) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'icon-btn row-btn';
        btn.setAttribute('aria-label', action + ' ' + rec.name);
        btn.setAttribute('data-id', rec.id);
        btn.setAttribute('data-action', action);
        btn.innerHTML = ACTION_ICONS[action];
        actionsTd.appendChild(btn);
      });

      tr.appendChild(nameTd);
      tr.appendChild(typeTd);
      tr.appendChild(statusTd);
      tr.appendChild(regionTd);
      tr.appendChild(updatedTd);
      tr.appendChild(actionsTd);

      tableBody.appendChild(tr);
    });

    if (emptyState) {
      emptyState.classList.toggle('show', matches.length === 0);
    }
  }

  function refreshRecords() {
    RECORDS.forEach(function (rec) {
      rec.updatedAt = -Math.floor(Math.random() * 120000);
    });
    const victim = RECORDS[Math.floor(Math.random() * RECORDS.length)];
    if (victim.status === 'error' || victim.status === 'offline') {
      victim.status = 'active';
    } else if (Math.random() < 0.35) {
      victim.status = victim.status === 'active' ? 'standby' : 'active';
    }
    renderManagerRows();
  }

  function initManagerWorkspace() {
    const runSearch = function () {
      renderManagerRows();
    };

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(runSearch, 200);
      });
    }
    if (statusFilter) {
      statusFilter.addEventListener('change', runSearch);
    }
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        refreshRecords();
        renderActivityLog('Manager records refreshed.', 'ok');
        toast('Manager records refreshed.', 'success');
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (searchInput) {
          searchInput.value = '';
        }
        if (statusFilter) {
          statusFilter.value = 'all';
        }
        renderManagerRows();
      });
    }

    if (managerWrap && managerWrap.addEventListener) {
      managerWrap.addEventListener('click', function (e) {
        if (!(e.target && e.target.closest)) {
          return;
        }
        const btn = e.target.closest('button[data-action]');
        if (!btn) {
          return;
        }
        const rec = RECORDS.find(function (r) {
          return r.id === btn.getAttribute('data-id');
        });
        const action = btn.getAttribute('data-action');
        renderActivityLog(action + ' ' + (rec ? rec.name : 'record') + '.', 'info');
        toast(action.charAt(0).toUpperCase() + action.slice(1) + ' requested for ' + (rec ? rec.name : 'record') + '.', 'info');
      });
    }

    renderManagerRows();
  }

  /* ---------- Settings ---------- */

  const prefsNodes = {
    density: document.querySelectorAll('input[name="density"]'),
    notifDashboard: byId('notifDashboard'),
    notifSound: byId('notifSound'),
    notifEmail: byId('notifEmail'),
    resetBtn: byId('settingsResetBtn')
  };

  function loadPrefs() {
    let prefs = { density: 'comfortable', notif: { dashboard: true, sound: true, email: false } };
    const raw = storageGet(localStorage, CONFIG.prefs.key, null);
    if (raw) {
      try {
        prefs = Object.assign({}, prefs, JSON.parse(raw));
      } catch (e) {}
    }
    return prefs;
  }

  function savePrefs(prefs) {
    storageSet(localStorage, CONFIG.prefs.key, JSON.stringify(prefs));
  }

  function applyPrefs() {
    const prefs = loadPrefs();
    document.body.classList.toggle('density-compact', prefs.density === 'compact');

    prefsNodes.density.forEach(function (input) {
      input.checked = input.value === prefs.density;
    });
    if (prefsNodes.notifDashboard) {
      prefsNodes.notifDashboard.checked = !!prefs.notif.dashboard;
    }
    if (prefsNodes.notifSound) {
      prefsNodes.notifSound.checked = !!prefs.notif.sound;
    }
    if (prefsNodes.notifEmail) {
      prefsNodes.notifEmail.checked = !!prefs.notif.email;
    }
  }

  function bindSettings() {
    const syncPrefs = function () {
      const prefs = loadPrefs();
      prefsNodes.density.forEach(function (input) {
        if (input.checked) {
          prefs.density = input.value;
        }
      });
      if (prefsNodes.notifDashboard) {
        prefs.notif.dashboard = prefsNodes.notifDashboard.checked;
      }
      if (prefsNodes.notifSound) {
        prefs.notif.sound = prefsNodes.notifSound.checked;
      }
      if (prefsNodes.notifEmail) {
        prefs.notif.email = prefsNodes.notifEmail.checked;
      }
      savePrefs(prefs);
      applyPrefs();
    };

    prefsNodes.density.forEach(function (input) {
      input.addEventListener('change', syncPrefs);
    });
    [prefsNodes.notifDashboard, prefsNodes.notifSound, prefsNodes.notifEmail].forEach(function (input) {
      if (input) {
        input.addEventListener('change', function () {
          syncPrefs();
          renderActivityLog('Preference updated: ' + (input.id || 'toggle'), 'info');
        });
      }
    });

    if (prefsNodes.resetBtn) {
      prefsNodes.resetBtn.addEventListener('click', function () {
        if (!window.confirm('Clear all local settings, caches and preferences? This cannot be undone.')) {
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

  /* ---------- Quick actions ---------- */

  function bindQuickActions() {
    const refreshStatsBtn = byId('quickRefresh');
    const newSessionBtn = byId('quickNewSession');
    const purgeBtn = byId('quickPurge');
    const toManagerBtn = byId('quickToManager');

    if (refreshStatsBtn) {
      refreshStatsBtn.addEventListener('click', function () {
        renderDashboardStats();
        renderActivityLog('Dashboard stats refreshed.', 'info');
      });
    }
    if (newSessionBtn) {
      newSessionBtn.addEventListener('click', function () {
        sim.sessions = clamp(sim.sessions + 1, 4, 48);
        renderDashboardStats();
        renderActivityLog('New session requested.', 'ok');
        toast('New session queued.', 'success');
      });
    }
    if (purgeBtn) {
      purgeBtn.addEventListener('click', function () {
        try {
          localStorage.removeItem(CONFIG.storage.license);
          localStorage.removeItem(CONFIG.storage.trialStarted);
          localStorage.removeItem(CONFIG.storage.trialUsed);
        } catch (e) {}
        renderActivityLog('Local cache purged.', 'warn');
        toast('Cache purged.', 'info');
      });
    }
    if (toManagerBtn) {
      toManagerBtn.addEventListener('click', function () {
        if (window.appNav) {
          window.appNav.setActiveTab('manager');
        }
      });
    }
  }

  /* ---------- Boot ---------- */

  const HEARTBEAT_POOL = [
    'Gateway heartbeat OK.',
    'Webhook relay synced.',
    '1 session reconnected.',
    'Stats snapshot complete.',
    'Presence cache refreshed.',
    'Audit batch flushed.'
  ];
  let heartbeatTick = 0;

  function boot() {
    renderDashboardStats();
    renderActivityLog('Dashboard initialised.', 'info');
    renderActivityLog('Gateway connected.', 'ok');
    renderActivityLog('4 services reporting healthy.', 'ok');
    initManagerWorkspace();
    applyPrefs();
    bindSettings();
    bindQuickActions();

    setInterval(renderDashboardStats, 3000);
    setInterval(function () {
      const msg = HEARTBEAT_POOL[heartbeatTick % HEARTBEAT_POOL.length];
      heartbeatTick += 1;
      renderActivityLog(msg, 'info');
    }, 20000);
  }

  boot();
})();