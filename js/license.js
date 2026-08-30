(function () {
  const manager = window.manager;
  const CONFIG = window.CONFIG;

  const el = {
    licenseScreen: document.getElementById('licenseScreen'),
    licenseCard: document.querySelector('#licenseScreen .license-card'),
    appScreen: document.getElementById('appScreen'),
    glassPanel: document.querySelector('#appScreen .glass-panel'),
    licenseKeyInput: document.getElementById('licenseKeyInput'),
    licensePasteBtn: document.getElementById('licensePasteBtn'),
    licenseActivateBtn: document.getElementById('licenseActivateBtn'),
    licenseTrialBtn: document.getElementById('licenseTrialBtn'),
    licenseBuyBtn: document.getElementById('licenseBuyBtn'),
    licenseMsg: document.getElementById('licenseMsg'),
    sessionPlan: document.getElementById('sessionPlan'),
    trialCountdown: document.getElementById('trialCountdown'),
    lockBtn: document.getElementById('lockBtn'),
    renewalModal: document.getElementById('renewalModal'),
    renewalMsg: document.getElementById('renewalMsg'),
    renewalGrace: document.getElementById('renewalGrace'),
    renewalCheckBtn: document.getElementById('renewalCheckBtn'),
    toastContainer: document.getElementById('toastContainer')
  };

  const state = { mode: null, interval: null };

  const TOAST_ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg>'
  };

  function showScreen(name) {
    el.licenseScreen.classList.toggle('active', name === 'license');
    el.appScreen.classList.toggle('active', name === 'app');
    if (name === 'license' && el.licenseCard) {
      animateEntrance(el.licenseCard);
    }
    if (name === 'app' && el.glassPanel) {
      animateEntrance(el.glassPanel);
    }
  }

  function showRenewalModal(show) {
    el.renewalModal.classList.toggle('active', show);
  }

  function setMsg(text, kind) {
    el.licenseMsg.textContent = text;
    el.licenseMsg.className = 'msg' + (kind ? ' ' + kind : '');
    if (kind && kind === 'error') {
      shake(el.licenseCard);
    }
  }

  function animateEntrance(node) {
    if (!node) {
      return;
    }
    node.classList.remove('animate-entrance');
    void node.offsetWidth;
    node.classList.add('animate-entrance');
  }

  function shake(node) {
    if (!node) {
      return;
    }
    node.classList.remove('shake');
    void node.offsetWidth;
    node.classList.add('shake');
    setTimeout(function () {
      node.classList.remove('shake');
    }, 450);
  }

  function ripple(node) {
    if (!node || node.disabled) {
      return;
    }
    node.classList.remove('rippling');
    void node.offsetWidth;
    node.classList.add('rippling');
    setTimeout(function () {
      node.classList.remove('rippling');
    }, 320);
  }

  function setBusy(btn, busy) {
    btn.classList.toggle('loading', busy);
    btn.disabled = busy;
  }

  function toast(message, kind) {
    if (!el.toastContainer) {
      return;
    }
    const node = document.createElement('div');
    node.className = 'toast ' + kind;
    node.innerHTML =
      '<div class="toast-icon">' + TOAST_ICONS[kind] + '</div>' +
      '<div class="toast-text"></div>' +
      '<div class="toast-bar"></div>';
    node.querySelector('.toast-text').textContent = message;
    el.toastContainer.appendChild(node);
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

  function fmt(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  }

  function toEpoch(value) {
    if (typeof value === 'number') {
      return value;
    }
    const n = Number(value);
    if (!Number.isNaN(n)) {
      return n;
    }
    return Date.parse(value);
  }

  async function validateKey(key) {
    const res = await fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    if (!res.ok) {
      throw new Error('Server error ' + res.status);
    }
    return res.json();
  }

  function ensurePositive() {
    el.licenseTrialBtn.disabled = manager.trialUsed();
  }

  function renderSession() {
    const cache = manager.getLicenseCache();
    if (cache && cache.expiresAt > Date.now()) {
      state.mode = 'licensed';
      el.sessionPlan.textContent = 'Plan: ' + (cache.plan || 'Pro');
      el.trialCountdown.textContent = '';
    } else {
      state.mode = 'trial';
      el.sessionPlan.textContent = 'Trial';
      updateTrialClock();
    }
  }

  function updateTrialClock() {
    const rem = manager.trialRemaining();
    el.trialCountdown.textContent = 'Trial remaining: ' + fmt(rem);
  }

  function stopSessionTimer() {
    if (state.interval) {
      clearInterval(state.interval);
      state.interval = null;
    }
  }

  function tick() {
    if (state.mode === 'trial') {
      updateTrialClock();
      if (manager.trialRemaining() <= 0) {
        lockToLicenseScreen('Trial time is up. Trial mode is permanently disabled on this browser.');
        return;
      }
    }
    const cache = manager.getLicenseCache();
    if (!cache || state.mode !== 'licensed') {
      return;
    }
    if (cache.expiresAt > Date.now()) {
      showRenewalModal(false);
      return;
    }
    const grace = manager.offlineGraceRemaining();
    if (grace > 0) {
      showRenewalModal(true);
      el.renewalMsg.textContent = 'Your license has expired. Renew it to keep using the app.';
      el.renewalGrace.textContent = 'Offline grace remaining: ' + fmt(grace);
    } else {
      lockToLicenseScreen('Your license expired with no grace time left.');
    }
  }

  function startSessionTimer() {
    stopSessionTimer();
    state.interval = setInterval(tick, 500);
  }

  function unlock(mode) {
    state.mode = mode;
    renderSession();
    showRenewalModal(false);
    showScreen('app');
    startSessionTimer();
  }

  function lockToLicenseScreen(reason) {
    stopSessionTimer();
    state.mode = null;
    showRenewalModal(false);
    manager.clearLicenseCache();
    ensurePositive();
    showScreen('license');
    setMsg(reason, reason ? 'error' : '');
    if (reason) {
      toast(reason, 'error');
    }
  }

  function onActivate() {
    ripple(el.licenseActivateBtn);
    const key = el.licenseKeyInput.value.trim();
    if (!key) {
      setMsg('Enter your license key first.', 'error');
      toast('Enter your license key first.', 'error');
      return;
    }
    setMsg('Validating license...');
    setBusy(el.licenseActivateBtn, true);
    validateKey(key)
      .then(function (data) {
        if (data.valid) {
          manager.setLicenseCache({
            key: key,
            plan: data.plan,
            activatedAt: Date.now(),
            lastVerified: Date.now(),
            expiresAt: toEpoch(data.expiresAt)
          });
          setMsg('');
          toast('License activated successfully.', 'success');
          unlock('licensed');
        } else {
          setMsg(data.message || 'Invalid license key.', 'error');
          toast(data.message || 'Invalid license key.', 'error');
        }
      })
      .catch(function () {
        setMsg('Cannot reach the license server. Check your connection and try again.', 'error');
        toast('Cannot reach the license server.', 'error');
      })
      .finally(function () {
        setBusy(el.licenseActivateBtn, false);
      });
  }

  function onStartTrial() {
    ripple(el.licenseTrialBtn);
    if (manager.trialUsed()) {
      setMsg('Trial mode has already been used on this browser.', 'error');
      toast('Trial already used on this browser.', 'error');
      return;
    }
    localStorage.setItem(CONFIG.storage.trialStarted, String(Date.now()));
    localStorage.setItem(CONFIG.storage.trialUsed, '1');
    manager.clearLicenseCache();
    setMsg('');
    toast('Trial started — 10 minutes of free access.', 'info');
    unlock('trial');
  }

  function onLock() {
    ripple(el.lockBtn);
    lockToLicenseScreen('');
  }

  function onRenewalCheck() {
    ripple(el.renewalCheckBtn);
    const cache = manager.getLicenseCache();
    if (!cache) {
      showRenewalModal(false);
      return;
    }
    el.renewalMsg.textContent = 'Checking license status...';
    el.renewalGrace.textContent = '';
    setBusy(el.renewalCheckBtn, true);
    validateKey(cache.key)
      .then(function (data) {
        if (data.valid) {
          manager.setLicenseCache({
            key: cache.key,
            plan: data.plan,
            activatedAt: cache.activatedAt,
            lastVerified: Date.now(),
            expiresAt: toEpoch(data.expiresAt)
          });
          showRenewalModal(false);
          toast('License renewed successfully.', 'success');
          unlock('licensed');
        } else {
          showRenewalModal(false);
          lockToLicenseScreen(data.message || 'License revoked. Please buy a new code.');
        }
      })
      .catch(function () {
        el.renewalMsg.textContent = 'Cannot reach the license server. Please try again.';
        toast('Cannot reach the license server. Please try again.', 'error');
      })
      .finally(function () {
        setBusy(el.renewalCheckBtn, false);
      });
  }

  function boot() {
    ensurePositive();
    const cache = manager.getLicenseCache();
    if (cache && cache.expiresAt > Date.now()) {
      unlock('licensed');
    } else if (manager.offlineGraceRemaining() > 0) {
      unlock('licensed');
      showRenewalModal(true);
      el.renewalMsg.textContent = 'Your license has expired. Renew it to keep using the app.';
      el.renewalGrace.textContent = 'Offline grace remaining: ' + fmt(manager.offlineGraceRemaining());
    } else if (manager.trialStarted() && manager.trialRemaining() > 0) {
      unlock('trial');
    } else {
      showScreen('license');
    }
  }

  window.appToast = toast;
  window.appSetBusy = setBusy;

  el.licenseActivateBtn.addEventListener('click', onActivate);
  el.licenseTrialBtn.addEventListener('click', onStartTrial);
  el.renewalCheckBtn.addEventListener('click', onRenewalCheck);
  el.lockBtn.addEventListener('click', onLock);
  el.licenseKeyInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      onActivate();
    }
  });
  el.licensePasteBtn.addEventListener('click', function () {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      el.licenseKeyInput.focus();
      toast('Paste manually with Ctrl+V.', 'info');
      return;
    }
    navigator.clipboard.readText()
      .then(function (text) {
        if (text && text.trim()) {
          el.licenseKeyInput.value = text.trim();
          toast('Key pasted from clipboard.', 'info');
        } else {
          toast('Clipboard is empty.', 'info');
        }
      })
      .catch(function () {
        el.licenseKeyInput.focus();
        toast('Clipboard access blocked. Paste manually with Ctrl+V.', 'info');
      });
  });

  boot();
})();