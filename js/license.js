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
    // Reset the submit button so a stale "Activating..." loading state from a
    // previous attempt/session never leaves the button stuck on this screen.
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('loading');
    }
    if (msg) {
      msg.textContent = '';
      msg.className = 'lic-msg';
    }
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

  let activationInFlight = false;

  function activate(key) {
    // Guard against a double activation (Enter pressed twice, or a click while
    // the request is in flight). Two concurrent /api/activate calls could each
    // insert a device row and inflate devicesUsed toward max_devices.
    if (activationInFlight) {
      return Promise.resolve(false);
    }
    activationInFlight = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('loading');
    }
    setMsg('Validating key...', 'info');

    const payload = { key: String(key || '').trim(), deviceId: deviceId() };
    const apiBase = String((CONFIG && CONFIG.apiBase) || '').replace(/\/+$/, '');

    return Promise.resolve()
      .then(function () {
        return fetch(apiBase + '/api/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      })
      .then(function (res) {
        return res.text().then(function (text) {
          var body = null;
          try {
            body = text ? JSON.parse(text) : null;
          } catch (e) {
            body = null;
          }
          return { status: res.status, body: body };
        });
      })
      .then(function (result) {
        const body = result.body;
        if (result.status >= 200 && result.status < 300 && body && body.success) {
          const data = body.data || {};
          // Number(undefined) is NaN, and NaN is falsy, so a missing or
          // ISO-string expiry used to be silently treated as a lifetime
          // license. Coerce explicitly and only accept a real future stamp.
          let expiresAt = 0;
          if (data.expiresAt !== undefined && data.expiresAt !== null && data.expiresAt !== '') {
            const parsed = typeof data.expiresAt === 'number'
              ? data.expiresAt
              : Date.parse(data.expiresAt);
            if (!Number.isNaN(parsed)) {
              expiresAt = parsed;
            }
          }
          if (expiresAt && expiresAt <= Date.now()) {
            throw new Error('License is not valid for this session.');
          }
          // A license with no expiry is a lifetime license. Re-check it on a
          // short interval instead of caching for a year and letting the gate
          // reappear with no way to clear it.
          const cacheExpires = expiresAt || (Date.now() + 60000);
          const licenseInfo = {
            expiresAt: cacheExpires,
            lifetime: !expiresAt,
            endsAt: data.endsAt || null,
            activatedAt: Date.now(),
            plan: data.plan || data.label || 'Unknown',
            owner: data.owner || null,
            key: String(key || '').trim(),
            notes: data.notes || '',
            maxActivations: data.maxActivations || 1,
            maxDevices: data.maxDevices || 1,
            activationsUsed: data.activationsUsed || 0,
            devicesUsed: data.devicesUsed || 0
          };
          if (manager && typeof manager.setLicenseCache === 'function') {
            try {
              manager.setLicenseCache(licenseInfo);
            } catch (e) {}
          }
          try {
            localStorage.setItem('dmt.welcome.pending', JSON.stringify(licenseInfo));
          } catch (e) {}
          setMsg('License activated. Welcome back.', 'success');
          return true;
        }
        let err = (body && (body.error || body.message)) || '';
        if (!err) {
          if (result.status >= 500) {
            err = 'The server could not validate this key right now. Please try again.';
          } else if (result.status === 429) {
            err = 'Too many attempts. Please wait a moment and try again.';
          } else {
            err = 'Invalid license key.';
          }
        }
        const errObj = new Error(err);
        if (body && (body.code === 'DEVICE_LIMIT')) {
          errObj.deviceLimit = true;
        }
        throw errObj;
      })
      .catch(function (err) {
        let message = (err && err.message) ? err.message : 'Unable to validate key. Check your connection.';
        setMsg(message, 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.classList.remove('loading');
        }
        return false;
      })
      .then(function (result) {
        activationInFlight = false;
        return result;
      });
  }

  function renderNotes(host, notesText) {
    if (!host) {
      return;
    }
    host.innerHTML = '';
    const label = document.createElement('div');
    label.className = 'welcome-block-label';
    label.textContent = 'Your plan instructions';
    host.appendChild(label);

    const body = document.createElement('div');
    body.className = 'welcome-notes-body';
    host.appendChild(body);

    const lines = String(notesText || '').split(/\r?\n/);
    let list = null;
    lines.forEach(function (raw) {
      const line = String(raw).trimEnd();
      if (line.trim() === '') {
        if (list) {
          list = null;
        }
        return;
      }
      if (/^##\s+/.test(line)) {
        list = null;
        const head = document.createElement('div');
        head.className = 'note-head';
        head.textContent = line.replace(/^##\s+/, '').trim();
        body.appendChild(head);
        return;
      }
      if (/^-\s+/.test(line)) {
        if (!list) {
          list = document.createElement('ul');
          list.className = 'note-list';
          body.appendChild(list);
        }
        const item = document.createElement('li');
        item.className = 'note-li';
        const text = line.replace(/^-\s+/, '').trim();
        const boldMatch = text.match(/^(.+?):\s+(.+)$/);
        if (boldMatch) {
          const strong = document.createElement('strong');
          strong.textContent = boldMatch[1] + ':';
          item.appendChild(strong);
          item.appendChild(document.createTextNode(' ' + boldMatch[2]));
        } else {
          item.textContent = text;
        }
        list.appendChild(item);
        return;
      }
      list = null;
      const para = document.createElement('p');
      para.className = 'note-line';
      para.textContent = line.trim();
      body.appendChild(para);
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
        renderNotes(notes, info.notes);
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
      startLicenseCheck();
    } else {
      showGate();
      if (keyInput) {
        keyInput.focus();
      }
    }
  }

  // ---- Periodic license health check (~every 10 minutes) ----
  let licenseTimer = null;

  function startLicenseCheck() {
    if (licenseTimer) {
      return;
    }
    // First check shortly after boot, then keep polling.
    licenseTimer = setInterval(runLicenseCheck, 600000);
    setTimeout(runLicenseCheck, 8000);
  }

  // Re-arm the health poll. A manual logout (or the settings "deactivate"
  // flow) clears the cache and locks the gate, but used to leave the poll
  // stopped for the rest of the tab session - so re-entering a key gave no
  // revocation checks at all until a full page reload.
  function resumeLicenseCheck() {
    startLicenseCheck();
  }

  function forceLicenseLogout(message) {
    if (licenseTimer) {
      clearInterval(licenseTimer);
      licenseTimer = null;
    }
    try {
      if (manager && typeof manager.clearLicenseCache === 'function') {
        manager.clearLicenseCache();
      }
    } catch (e) {}
    try {
      if (manager && typeof manager.forceLicenseLogout === 'function') {
        manager.forceLicenseLogout();
      }
    } catch (e) {
      // A teardown failure must not leave the dashboard interactive with no
      // license. Fall back to putting the gate back up.
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[license] session teardown failed:', e);
      }
    }
    showGate();
    setMsg(message, 'error');
  }

  function runLicenseCheck() {
    if (!manager || typeof manager.getLicenseCache !== 'function') {
      return;
    }
    let cache;
    try {
      cache = manager.getLicenseCache();
    } catch (e) {
      return;
    }
    if (!cache || !cache.key || !hasValidLicense()) {
      return;
    }
    const url = String((CONFIG && CONFIG.apiBase) || '').replace(/\/+$/, '') + '/api/validate';
    let accountId = '';
    if (manager && typeof manager.activeAccountId === 'function') {
      accountId = manager.activeAccountId() || '';
    }
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: String(cache.key || '').trim(),
        deviceId: deviceId(),
        accountId: String(accountId || '').trim()
      })
    })
      .then(function (res) {
        return res.text().then(function (text) {
          var body = null;
          try {
            body = text ? JSON.parse(text) : null;
          } catch (e) {
            body = null;
          }
          return { status: res.status, body: body, text: text };
        });
      })
      .then(function (result) {
        const status = result.status;
        const body = result.body;

        // A transport-level or infrastructure failure must never be treated as
        // "license invalid". Previously the status was ignored, so any 5xx, any
        // HTML error page from a proxy, or a Supabase outage (which /api/validate
        // reports as 502/503) force-logged the user out and told them their
        // license was bad. Only an explicit, well-formed rejection should do that.
        var isServerError = status >= 500;
        var isGatewayError = status === 429 || status === 408;
        var isNetworkShape = !body || typeof body !== 'object';

        if (isServerError || isGatewayError || (isNetworkShape && status >= 400)) {
          // Keep the user signed in and let the next poll try again.
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[license] health check unavailable (HTTP ' + status + '), staying signed in.');
          }
          return;
        }

        if (status === 401 || status === 403 || status === 404) {
          const code = (body && body.code) || '';
          let message = ((body && body.error) || 'This license is no longer valid.').replace(/\.+$/, '') + '.';
          if (code === 'EXPIRED') {
            message = 'Your license has expired. Please renew it to continue.';
          } else if (code === 'REVOKED') {
            message = 'This license has been revoked. Contact Mythic for help.';
          } else if (code === 'INVALID') {
            message = 'This license key is no longer valid.';
          }
          forceLicenseLogout(message);
          return;
        }

        if (!body || !body.success) {
          // A 2xx that does not assert success is not a verdict we can trust.
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[license] health check returned an unusable body (HTTP ' + status + '), staying signed in.');
          }
          return;
        }

        const d = body.data || {};
        if (d.devicesFull) {
          forceLicenseLogout('This license is already active on another device. Logged out automatically.');
          return;
        }
        if (d.accountsFull) {
          forceLicenseLogout('This license has reached its account limit. Logged out automatically.');
          return;
        }
        if (d && (d.activationsUsed !== undefined || d.activationsTotal !== undefined)) {
          if (d.activationsUsed !== undefined) cache.activationsUsed = d.activationsUsed;
          if (d.activationsTotal !== undefined) cache.maxActivations = d.activationsTotal;
          if (d.devicesUsed !== undefined) cache.devicesUsed = d.devicesUsed;
          if (d.devicesTotal !== undefined) cache.maxDevices = d.devicesTotal;
          if (d.expiresAt) cache.expiresAt = d.expiresAt;
          try {
            manager.setLicenseCache(cache);
          } catch (e) {}
        }
      })
      .catch(function () {
        // Transient network error - leave the user logged in.
      });
  }

  if (form) {
    form.addEventListener('submit', handleSubmit);
  }
  if (keyInput) {
    keyInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Respect the in-flight guard. Dispatching submit unconditionally let a
        // second Enter key start a duplicate /api/activate while the first was
        // still running.
        if (submitBtn && submitBtn.disabled) {
          return;
        }
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
    resumeCheck: resumeLicenseCheck,
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