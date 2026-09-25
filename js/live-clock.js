/*
 * Live clock.
 *
 * A ticking date/time for the admin console and the summary dashboard.
 * Loaded by both pages so the format matches. Exposes window.LiveClock.
 *
 * Notes:
 * - The module is a singleton: mount() can be called any number of times
 *   (the admin console re-runs it on refresh) but only ever drives one timer
 *   and one node list, so timers cannot stack up and duplicate the work.
 * - Renders a fixed English date and a 24-hour time so it matches the
 *   currency formatting used elsewhere in the app.
 * - The ticking text lives in a <time> element carrying a machine-readable
 *   datetime attribute, so the accessible value stays exact.
 * - Seconds are dropped when the visitor prefers reduced motion.
 * - Ticks pause while the tab is hidden and resync on return, so a background
 *   tab does no work and never shows a stale time.
 */
(function (global) {
  'use strict';

  var nodes = [];
  var timer = null;
  var withSeconds = true;
  var bound = false;

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function prefersReducedMotion() {
    try {
      return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function format(d, seconds) {
    var date = DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    var time = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (seconds) time += ':' + pad(d.getSeconds());
    return date + ' · ' + time;
  }

  function render(node) {
    var now = new Date();
    node.textContent = format(now, withSeconds);
    node.setAttribute('datetime', now.toISOString());
  }

  function renderAll() {
    for (var i = 0; i < nodes.length; i++) {
      // The node may have been removed from the DOM by a view switch.
      if (nodes[i] && nodes[i].isConnected) render(nodes[i]);
    }
  }

  function interval() {
    return withSeconds ? 1000 : 60000;
  }

  function schedule() {
    if (timer !== null) return;
    var ms = interval();
    // Fire on a whole-second boundary so the seconds digit does not stutter.
    var delay = ms - (Date.now() % ms);
    timer = setTimeout(function () {
      timer = null;
      renderAll();
      if (!global.document || !global.document.hidden) schedule();
    }, delay);
  }

  function onVisibility() {
    if (global.document.hidden) {
      if (timer !== null) { clearTimeout(timer); timer = null; }
      return;
    }
    renderAll();
    schedule();
  }

  function mount(selector) {
    var doc = global.document;
    if (!doc || typeof doc.querySelectorAll !== 'function') return nodes;

    withSeconds = !prefersReducedMotion();
    nodes = Array.prototype.slice.call(doc.querySelectorAll(selector || '.live-clock'));
    if (!nodes.length) return nodes;

    nodes.forEach(function (node) {
      node.setAttribute('role', 'timer');
      // The clock changes every second; announcing it would flood a screen
      // reader, so it stays silent and is readable on demand instead.
      node.setAttribute('aria-live', 'off');
      render(node);
    });

    if (!bound) {
      bound = true;
      doc.addEventListener('visibilitychange', onVisibility);
    }
    renderAll();
    schedule();
    return nodes;
  }

  global.LiveClock = { mount: mount, format: format, stop: function () {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  } };
})(typeof window !== 'undefined' ? window : globalThis);
