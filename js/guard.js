// Lightweight client-side hardening to discourage casual copying of the
// dashboard/scripts. This is best-effort only; it cannot stop a determined
// attacker (any code shipped to the browser can be retrieved).
(function () {
  'use strict';

  function blockEvent(e) {
    if (e.preventDefault) {
      e.preventDefault();
    }
    if (e.stopPropagation) {
      e.stopPropagation();
    }
    return false;
  }

  // Block right-click outside editable fields.
  document.addEventListener('contextmenu', function (e) {
    var t = e && e.target;
    var editable = t && (t.closest ? t.closest('input, textarea, select, [contenteditable="true"]') : false);
    if (!editable) {
      return blockEvent(e);
    }
    return true;
  }, false);

  // Block common keyboard shortcuts that open devtools / view source / save.
  document.addEventListener('keydown', function (e) {
    var k = e.key || '';
    var ctrl = e.ctrlKey || e.metaKey;
    var shift = e.shiftKey;
    var code = k.toUpperCase();

    // F12
    if (k === 'F12') {
      return blockEvent(e);
    }
    // Ctrl+Shift+I / J / C / K, Ctrl+U, Ctrl+S
    if (ctrl && shift && (code === 'I' || code === 'J' || code === 'C' || code === 'K')) {
      return blockEvent(e);
    }
    if (ctrl && (code === 'U' || code === 'S')) {
      return blockEvent(e);
    }
    // Ctrl+Shift+C (inspect) handled above; Ctrl+p is common too
    if (ctrl && (code === 'P')) {
      return blockEvent(e);
    }
    return true;
  }, false);

  // Devtools-open detection (approximate, best-effort).
  // Only treat the window as "popped out" when the shrink is clearly the size of
  // a devtools panel (>= MIN_GAP). A small or zero diff (maximized/fullscreen
  // browser, normal scrollbar) must NOT trigger a popup.
  var detected = false;
  var MIN_GAP = 140;

  // Build and show an in-app modal popup instead of the native browser alert,
  // so the message matches the dashboard's styling and no system dialog appears.
  function showDevtoolsModal() {
    if (document.getElementById('devtoolsBlockModal')) {
      return;
    }
    var styleId = 'devtoolsBlockStyle';
    if (!document.getElementById(styleId)) {
      var s = document.createElement('style');
      s.id = styleId;
      s.textContent =
        '#devtoolsBlockModal{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
        'padding:24px;background:rgba(5,7,12,.7);backdrop-filter:blur(8px);z-index:9999;animation:dtFade .2s ease}' +
        '@keyframes dtFade{from{opacity:0}to{opacity:1}}' +
        '#devtoolsBlockCard{width:100%;max-width:360px;background:var(--surface,#101522);color:var(--text,#e7ecf3);' +
        'border:1px solid var(--border-glass,rgba(255,255,255,.12));border-radius:var(--radius,16px);' +
        'padding:30px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.5);' +
        'display:flex;flex-direction:column;gap:10px}' +
        '#devtoolsBlockCard .dt-icon{font-size:34px;line-height:1}' +
        '#devtoolsBlockCard h3{margin:0;font-size:1.1rem}' +
        '#devtoolsBlockCard p{margin:0;font-size:.9rem;color:var(--muted,#9aa7b5);line-height:1.5}' +
        '#devtoolsBlockCard button{margin-top:8px;background:var(--accent,#5865f2);color:#fff;border:0;' +
        'border-radius:12px;padding:11px 16px;font:inherit;font-weight:600;cursor:pointer}' +
        '#devtoolsBlockCard button:hover{opacity:.92}';
      document.head.appendChild(s);
    }
    var modal = document.createElement('div');
    modal.id = 'devtoolsBlockModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    var card = document.createElement('div');
    card.id = 'devtoolsBlockCard';
    var icon = document.createElement('div');
    icon.className = 'dt-icon';
    icon.textContent = '🔒';
    var title = document.createElement('h3');
    title.textContent = 'Developer tools detected';
    var msg = document.createElement('p');
    msg.textContent = 'Please close developer tools to continue using this tool.';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Got it';
    btn.addEventListener('click', function () {
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
    });
    card.appendChild(icon);
    card.appendChild(title);
    card.appendChild(msg);
    card.appendChild(btn);
    modal.appendChild(card);
    document.body.appendChild(modal);
  }

  function interval() {
    var widthDiff = window.outerWidth - window.innerWidth;
    var heightDiff = window.outerHeight - window.innerHeight;
    var popped = widthDiff >= MIN_GAP || heightDiff >= MIN_GAP;
    if (popped) {
      if (!detected) {
        detected = true;
        try {
          window.console && console.clear && console.clear();
        } catch (e2) {}
        if (window.setTimeout) {
          window.setTimeout(showDevtoolsModal, 80);
        }
      }
    } else {
      detected = false;
    }
  }
  if (window.setInterval) {
    window.setInterval(interval, 3000);
  }
})();