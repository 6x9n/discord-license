(function () {
  const CONFIG = window.CONFIG;
  const manager = window.manager;

  const gate = document.getElementById('licenseGate');
  const form = document.getElementById('licForm');
  const keyInput = document.getElementById('licKey');
  const msg = document.getElementById('licMsg');
  const submitBtn = document.getElementById('licSubmit');

  function setMsg(text, kind) {
    if (!msg) {
      return;
    }
    msg.textContent = text || '';
    msg.className = 'lic-msg' + (kind ? ' lic-msg-' + kind : '');
  }

  function showGate() {
    if (!gate) {
      return;
    }
    gate.hidden = false;
    gate.classList.add('active');
  }

  function hideGate() {
    if (!gate) {
      return;
    }
    gate.classList.remove('active');
    setTimeout(function () {
      gate.hidden = true;
    }, 180);
  }

  function hasValidLicense() {
    try {
      if (manager && typeof manager.getLicenseCache === 'function') {
        const cache = manager.getLicenseCache();
        if (cache && typeof cache.expiresAt === 'number' && cache.expiresAt > Date.now()) {
          return true;
        }
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  function deviceId() {
    const storageKey = 'dmt.device.id';
    try {
      let id = localStorage.getItem(storageKey);
      if (!id) {
        id = 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(storageKey, id);
      }
      return id;
    } catch (e) {
      return 'dev-unknown';
    }
  }

  function activate(key) {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('loading');
    }
    setMsg('Validating key...', 'info');

    const payload = { key: String(key || '').trim() };

    return fetch(String(CONFIG.apiBase).replace(/\/+$/, '') + '/api/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().catch(function () {
          return null;
        }).then(function (body) {
          return { status: res.status, body: body };
        });
      })
      .then(function (result) {
        const body = result.body || {};
        if (result.status >= 200 && result.status < 300 && body && body.success) {
          const data = body.data || {};
          const expiresAt = Number(data.expiresAt);
          if (expiresAt && expiresAt <= Date.now()) {
            throw new Error('License is not valid for this session.');
          }
          const cacheExpires = expiresAt || (Date.now() + 31536000000);
          const licenseInfo = {
            expiresAt: cacheExpires,
            endsAt: data.endsAt || null,
            activatedAt: Date.now(),
            plan: data.plan || data.label || 'Unknown',
            owner: data.owner || null,
            key: String(key || '').trim(),
            notes: data.notes || '',
            maxActivations: data.maxActivations || 1,
            activationsUsed: data.activationsUsed || 0
          };
          if (manager && typeof manager.setLicenseCache === 'function') {
            manager.setLicenseCache(licenseInfo);
          }
          try {
            localStorage.setItem('dmt.welcome.pending', JSON.stringify(licenseInfo));
          } catch (e) {}
          setMsg('License activated. Welcome back.', 'success');
          return true;
        }
        const err = (body && (body.error || body.message)) || 'Invalid license key.';
        throw new Error(err);
      })
      .catch(function (err) {
        const message = (err && err.message) ? err.message : 'Unable to validate key. Check your connection.';
        setMsg(message, 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.classList.remove('loading');
        }
        return false;
      });
  }

  function showWelcome(info) {
    const modal = document.getElementById('welcomeModal');
    if (!modal) {
      return false;
    }
    const set = function (id, val) {
      const n = document.getElementById(id);
      if (n) {
        n.textContent = val;
      }
    };
    set('welcomeOwner', info.owner ? ' ' + info.owner : '');
    set('welcomePlan', info.plan || 'Standard');
    set('welcomeKey', info.key || '');

    const exp = document.getElementById('welcomeExpires');
    if (exp) {
      if (info.endsAt || (info.expiresAt && info.expiresAt > Date.now() + 31536000000)) {
        exp.textContent = info.endsAt ? 'Ends ' + new Date(info.endsAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Lifetime';
      } else {
        exp.textContent = info.endsAt ? 'Ends ' + new Date(info.endsAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Lifetime';
      }
    }

    const used = info.activationsUsed || 0;
    const max = info.maxActivations || 1;
    const accText = document.getElementById('welcomeAccText');
    if (accText) {
      accText.textContent = used + ' of ' + max + ' account' + (max === 1 ? '' : 's') + ' using this key' + (used >= max ? ' — limit reached.' : '.');
    }
    const accFill = document.getElementById('welcomeAccFill');
    if (accFill) {
      accFill.style.width = Math.min(100, Math.round((used / max) * 100)) + '%';
    }

    const notes = document.getElementById('welcomeNotes');
    if (notes) {
      if (info.notes) {
        notes.hidden = false;
        notes.innerHTML = '<div class="welcome-block-label">Your plan instructions</div>';
        const p = document.createElement('p');
        p.className = 'welcome-block-sub';
        p.textContent = info.notes;
        notes.appendChild(p);
      } else {
        notes.hidden = true;
        notes.innerHTML = '';
      }
    }

    modal.hidden = false;
    modal.classList.add('active');
    return true;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const key = keyInput ? keyInput.value.trim() : '';
    if (!key) {
      setMsg('Please enter a license key.', 'error');
      return;
    }
    activate(key).then(function (ok) {
      if (ok) {
        try {
          const pendingRaw = localStorage.getItem('dmt.welcome.pending');
          if (pendingRaw) {
            const info = JSON.parse(pendingRaw);
            localStorage.removeItem('dmt.welcome.pending');
            showWelcome(info);
          }
        } catch (e) {}
        hideGate();
      }
    });
  }

  function boot() {
    if (hasValidLicense()) {
      hideGate();
    } else {
      showGate();
      if (keyInput) {
        keyInput.focus();
      }
    }
  }

  if (form) {
    form.addEventListener('submit', handleSubmit);
  }
  if (keyInput) {
    keyInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (form) {
          form.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      }
    });
  }

  if (gate && manager && CONFIG && CONFIG.storage && CONFIG.storage.license) {
    window.addEventListener('storage', function (e) {
      if (e.key === CONFIG.storage.license || e.key === null) {
        if (!hasValidLicense() && gate.hidden) {
          showGate();
        }
      }
    });
  }

  window.licenseGate = {
    lock: showGate,
    unlock: hideGate,
    isLocked: function () {
      return gate ? !gate.hidden : false;
    }
  };

  const welcomeOk = document.getElementById('welcomeOk');
  if (welcomeOk) {
    welcomeOk.addEventListener('click', function () {
      const modal = document.getElementById('welcomeModal');
      if (modal) {
        modal.classList.remove('active');
        setTimeout(function () {
          modal.hidden = true;
        }, 180);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    boot();
  }
})();