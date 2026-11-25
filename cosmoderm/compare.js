// Before/after compare
// Props (data attributes on [data-compare]):
//   data-before-src / data-after-src     image URLs (if missing: coloured placeholder with a label)
//   data-before-label / data-after-label label text (default "До" / "Після")
//   data-demo-veil                       soft white veil on "before" — only for the demo, while both
//                                        sides use the same photo; drop it once real photos are in
// The "after" image sits on top and is revealed from the left with clip-path while a divider with a
// round handle sweeps left → right (eased). Labels fade in on their sides. Sequence: 0 → middle,
// hold 0.5 s, sweep back a little, then all the way to fully "after". Plays once when the card
// comes into view; afterwards the divider can be dragged (pointer or arrow keys).
(() => {
  const roots = document.querySelectorAll('[data-compare]');
  if (!roots.length) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // easeInOutCubic

  // Timeline: [from, to, seconds] segments; a "hold" keeps the value.
  const TIMELINE = [
    { to: 0.5, dur: 1.1 },
    { hold: 0.5 },
    { to: 0.32, dur: 0.55 },
    { to: 1, dur: 1.2 },
  ];

  const layer = (src, label, cls) => {
    if (src) return `<img class="cmp__img ${cls}" src="${src}" alt="" draggable="false">`;
    const bg = cls === 'cmp__after' ? '#dfe7f7' : '#f3dcd4';
    return `<div class="cmp__img cmp__placeholder ${cls}" style="background:${bg}"><span>${label}</span></div>`;
  };

  roots.forEach((root) => {
    const beforeLabel = root.dataset.beforeLabel || 'До';
    const afterLabel = root.dataset.afterLabel || 'Після';
    root.innerHTML = `
      ${layer(root.dataset.beforeSrc, beforeLabel, 'cmp__before')}
      ${'demoVeil' in root.dataset ? '<div class="cmp__veil"></div>' : ''}
      ${layer(root.dataset.afterSrc, afterLabel, 'cmp__after')}
      <span class="cmp__label cmp__label--after">${afterLabel}</span>
      <span class="cmp__label cmp__label--before">${beforeLabel}</span>
      <div class="cmp__divider"><span class="cmp__handle" role="slider" tabindex="0"
        aria-label="Порівняння: ${beforeLabel} / ${afterLabel}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></span></div>`;
    root.classList.add('cmp');

    const after = root.querySelector('.cmp__after');
    const divider = root.querySelector('.cmp__divider');
    const handle = root.querySelector('.cmp__handle');
    const lAfter = root.querySelector('.cmp__label--after');
    const lBefore = root.querySelector('.cmp__label--before');
    let p = 0;           // 0 = all "before", 1 = all "after"
    let playing = false;
    let played = false;

    const render = () => {
      const pc = (p * 100).toFixed(2);
      after.style.clipPath = `inset(0 ${(100 - p * 100).toFixed(2)}% 0 0)`;
      divider.style.left = `${pc}%`;
      // Keep the round handle fully inside the photo at the edges (the line itself still reaches them).
      const W = root.clientWidth, x = p * W, pad = handle.offsetWidth / 2 + 6;
      handle.style.left = `${(Math.min(W - pad, Math.max(pad, x)) - x).toFixed(1)}px`;
      handle.setAttribute('aria-valuenow', Math.round(p * 100));
      handle.setAttribute('aria-valuetext', p > 0.98 ? afterLabel : p < 0.02 ? beforeLabel : `${Math.round(p * 100)}% ${afterLabel}`);
      // Labels fade in on their own side once that side is showing; fade out when their side is gone.
      lAfter.style.opacity = Math.min(1, Math.max(0, (p - 0.12) / 0.18)).toFixed(3);
      lBefore.style.opacity = Math.min(1, Math.max(0, (0.88 - p) / 0.18)).toFixed(3);
    };

    const play = () => {
      if (played) return;
      played = true;
      if (reduce) { p = 1; render(); return; }
      playing = true;
      let seg = 0, t0 = performance.now(), from = p;
      const tick = (now) => {
        if (!playing) return;
        const s = TIMELINE[seg];
        const dur = (s.hold ?? s.dur) * 1000;
        const k = Math.min(1, (now - t0) / dur);
        if (!s.hold) p = from + (s.to - from) * ease(k);
        render();
        if (k >= 1) {
          seg++; t0 = now; from = p;
          if (seg >= TIMELINE.length) { playing = false; return; }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    render();
    new IntersectionObserver(([en], obs) => {
      if (en.isIntersecting) { play(); obs.disconnect(); }
    }, { threshold: 0.6 }).observe(root);

    // Drag to compare (interrupts the intro).
    const setFromX = (x) => {
      const r = root.getBoundingClientRect();
      p = Math.min(1, Math.max(0, (x - r.left) / r.width));
      render();
    };
    root.addEventListener('pointerdown', (e) => {
      // On touch, only the handle drags — so a finger scrolling the page doesn't jump the divider.
      if (e.pointerType === 'touch' && !e.target.closest('.cmp__handle')) return;
      playing = false; played = true;
      root.setPointerCapture(e.pointerId);
      root.classList.add('is-dragging');
      setFromX(e.clientX);
    });
    root.addEventListener('pointermove', (e) => { if (root.hasPointerCapture?.(e.pointerId)) setFromX(e.clientX); });
    const end = (e) => { root.classList.remove('is-dragging'); if (root.hasPointerCapture?.(e.pointerId)) root.releasePointerCapture(e.pointerId); };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    handle.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: -0.05, ArrowRight: 0.05, Home: -1, End: 1 }[e.key];
      if (d === undefined) return;
      e.preventDefault(); playing = false; played = true;
      p = Math.min(1, Math.max(0, p + d)); render();
    });
  });
})();
