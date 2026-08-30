(function () {
  const CONFIG = window.CONFIG;

  const el = {
    appScreen: document.getElementById('appScreen'),
    glassPanel: document.querySelector('#appScreen .glass-panel'),
    sessionPlan: document.getElementById('sessionPlan'),
    toastContainer: document.getElementById('toastContainer')
  };

  const TOAST_ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg>'
  };

  function animateEntrance(node) {
    if (!node) {
      return;
    }
    node.classList.remove('animate-entrance');
    void node.offsetWidth;
    node.classList.add('animate-entrance');
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

  function clearLegacyKeys() {
    try {
      const keys = [CONFIG.storage.license, CONFIG.storage.trialStarted, CONFIG.storage.trialUsed];
      keys.forEach(function (k) {
        if (k) {
          localStorage.removeItem(k);
        }
      });
    } catch (e) {}
  }

  function boot() {
    clearLegacyKeys();
    if (el.sessionPlan) {
      el.sessionPlan.textContent = 'Open Access';
    }
    if (el.appScreen) {
      el.appScreen.classList.add('active');
    }
    if (el.glassPanel) {
      animateEntrance(el.glassPanel);
    }
  }

  window.appToast = toast;
  window.appSetBusy = function (node, busy) {
    if (!node) {
      return;
    }
    node.classList.toggle('loading', busy);
    node.disabled = busy;
  };

  boot();
})();