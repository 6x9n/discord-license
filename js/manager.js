window.CONFIG = {
  apiBase: 'https://discord-license-server-mythic5.vercel.app',
  trialDuration: 10 * 60 * 1000,
  offlineGraceMs: 24 * 60 * 60 * 1000,
  storage: {
    license: 'dmt.license.cache',
    trialStarted: 'dmt.trial.started',
    trialUsed: 'dmt.trial.used'
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