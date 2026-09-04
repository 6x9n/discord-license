(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fineOrHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (reduceMotion || !fineOrHover) {
    return;
  }

  const cursorEl = document.getElementById('customCursor');
  if (!cursorEl) {
    return;
  }

  const ring = cursorEl.querySelector('.cursor-ring');

  let x = -100;
  let y = -100;
  let ringX = -100;
  let ringY = -100;
  let visible = false;
  let rafId = null;

  const FOLLOW = 0.7;
  const SNAP_DIST = 80;

  const CS_STYLE = getComputedStyle(document.documentElement);
  const accent = CS_STYLE.getPropertyValue('--accent').trim() || '#5865f2';

  if (ring) {
    ring.style.borderColor = accent;
  }

  function setVisible(show) {
    if (show === visible) {
      return;
    }
    visible = show;
    cursorEl.classList.toggle('visible', show);
  }

  function onMove(e) {
    x = e.clientX;
    y = e.clientY;
    setVisible(true);
    const dX = x - ringX;
    const dY = y - ringY;
    if (dX * dX + dY * dY > SNAP_DIST * SNAP_DIST) {
      ringX = x;
      ringY = y;
    }
    if (!rafId) {
      rafId = requestAnimationFrame(frame);
    }
  }

  function frame() {
    rafId = null;
    if (!visible) {
      return;
    }
    ringX += (x - ringX) * FOLLOW;
    ringY += (y - ringY) * FOLLOW;

    const dX = x - ringX;
    const dY = y - ringY;
    const dist = Math.sqrt(dX * dX + dY * dY);

    ring.style.left = (ringX - 12) + 'px';
    ring.style.top = (ringY - 12) + 'px';

    const scale = Math.min(1.2, 1 + dist * 0.003);
    ring.style.transform = 'translate(0,0) scale(' + scale.toFixed(3) + ')';

    if (dist > 0.25) {
      rafId = requestAnimationFrame(frame);
    }
  }

  function onLeave() {
    setVisible(false);
  }

  function snapToPointer() {
    ringX = x;
    ringY = y;
    if (!visible) {
      return;
    }
    ring.style.left = (ringX - 12) + 'px';
    ring.style.top = (ringY - 12) + 'px';
    ring.style.transform = 'translate(0,0) scale(1)';
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function onMouseDown() {
    snapToPointer();
    cursorEl.classList.add('active');
  }

  function onMouseUp() {
    cursorEl.classList.remove('active');
    if (!rafId && visible) {
      rafId = requestAnimationFrame(frame);
    }
  }

  function onOver(e) {
    const t = e.target;
    const interactive = t && (
      t.closest && (
        t.closest('a, button, input, select, textarea, label, [role="button"], [data-tab], .nav-link, .btn, .stat-card, .modal, .lic-form') ||
        /INPUT|TEXTAREA|SELECT|BUTTON|A/.test(t.tagName)
      )
    );
    cursorEl.classList.toggle('interactive', !!interactive);
  }

  document.addEventListener('mousemove', onMove, { passive: true });
  document.addEventListener('mouseleave', onLeave);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('mouseover', onOver, { passive: true });
  document.addEventListener('DOMContentLoaded', function () {
    cursorEl.classList.add('enabled');
    document.documentElement.classList.add('cursor-enabled');
  });
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    cursorEl.classList.add('enabled');
    document.documentElement.classList.add('cursor-enabled');
  }
})();