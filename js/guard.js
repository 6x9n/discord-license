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
  var detected = false;
  function interval() {
    var widthThreshold = window.outerWidth - window.innerWidth > 160;
    var heightThreshold = window.outerHeight - window.innerHeight > 160;
    var pre = document.documentElement.offsetTop || 1;
    document.documentElement.setAttribute('style', 'position: fixed;');
    var widthDiff = window.outerWidth - window.innerWidth;
    var heightDiff = window.outerHeight - window.innerHeight;
    document.documentElement.setAttribute('style', '');
    var docked = widthDiff > 200 || heightDiff > 200;
    if (widthThreshold || heightThreshold || Math.abs(widthDiff) < pre || docked) {
      if (!detected) {
        detected = true;
        try {
          window.console && console.clear && console.clear();
        } catch (e2) {}
        if (window.alert) {
          window.setTimeout(function () {
            window.alert('Please close developer tools to continue using this tool.');
          }, 80);
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