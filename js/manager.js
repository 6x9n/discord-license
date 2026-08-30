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

(function () {
  const CONFIG = window.CONFIG;
  const root = document.getElementById('appScreen');
  const pageTitle = document.getElementById('pageTitle');
  const menuToggle = document.getElementById('menuToggle');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const themeToggle = document.getElementById('themeToggle');
  const drawerBackdrop = document.getElementById('drawerBackdrop');

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

  applyTheme();
  applySidebar();
  setActiveTab(storageGet(sessionStorage, CONFIG.nav.tabKey) || 'dashboard');
})();