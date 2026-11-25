// Weight wave — ported from DesignBookmark "Weight wave" (motion-src/weight-wave + shared/motion.js).
// Each letter's weight is a spring pulled toward a bell curve around the pointer, so a swell of
// bold rolls through the heading as you move. With nobody pointing, the swell sweeps by itself.
// Springs are kept from the original: letters 260/22, swell position 150/22, 4 sub-steps per frame.
(() => {
  const els = document.querySelectorAll('[data-weight-wave]');
  if (!els.length) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; // static heading

  /* --- tiny spring engine (same maths as shared/motion.js) --- */
  const S = (x, k = 400, c = 30) => ({ x, v: 0, t: x, k, c });
  const step = (s, dt) => { const a = -s.k * (s.x - s.t) - s.c * s.v; s.v += a * dt; s.x += s.v * dt; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Familjen Grotesk (brand heading font) is variable from 400 to 700.
  const LIGHT = 400, BOLD = 700;
  const SPREAD = 0.13;     // width of the swell, share of the heading width (original value)
  const ROWS = 0.9;        // vertical reach of the swell in line-heights (multi-line headings)
  const MIN_OPACITY = 0.72; // original fades to .42; kept higher so white text stays readable on the photo
  const PERIOD = 4.6;      // seconds for one idle sweep (original value)

  const comps = [];

  els.forEach((el) => {
    const label = el.textContent.replace(/\s+/g, ' ').trim();
    el.setAttribute('aria-label', label);

    // Rebuild text as letters, keeping <br> line breaks and word wrapping.
    const letters = [];
    const nodes = [...el.childNodes];
    el.textContent = '';
    nodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') { el.appendChild(node); return; }
      const text = node.textContent;
      // Split on ordinary whitespace only, so non-breaking spaces (з&nbsp;вашим) stay inside a word.
      text.split(/([ \t\n\r]+)/).forEach((part) => {
        if (!part) return;
        if (/^[ \t\n\r]+$/.test(part)) { el.appendChild(document.createTextNode(' ')); return; }
        const word = document.createElement('span');
        word.className = 'ww-word';
        word.setAttribute('aria-hidden', 'true');
        [...part].forEach((ch) => {
          const s = document.createElement('span');
          s.className = 'ww-ch';
          s.textContent = ch;
          word.appendChild(s);
          letters.push({ el: s, w: S(LIGHT, 260, 22) });
        });
        el.appendChild(word);
      });
    });

    const fx = S(-0.2, 150, 22); // swell position across the width: 0 = left edge, 1 = right edge
    const fy = S(0.5, 150, 22);  // swell position down the heading: 0 = top, 1 = bottom
    // Optional per-heading floor for light letters: data-weight-wave-min="0.55"
    const minOpacity = parseFloat(el.dataset.weightWaveMin) || MIN_OPACITY;
    const comp = { el, letters, fx, fy, minOpacity, hover: false, t: 0, visible: false };
    const host = el.closest('section') || el;

    host.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const r = el.getBoundingClientRect();
      // Follow the pointer only near the text; elsewhere in the section keep the idle sweep.
      const near = e.clientY > r.top - 60 && e.clientY < r.bottom + 60;
      if (!near) { if (comp.hover) { comp.hover = false; comp.t = 0; } return; }
      comp.hover = true;
      fx.t = (e.clientX - r.left) / r.width;
      fy.t = (e.clientY - r.top) / r.height;
    });
    host.addEventListener('pointerleave', () => { comp.hover = false; comp.t = 0; });

    // Only animate while the heading is on screen.
    new IntersectionObserver(([en]) => { comp.visible = en.isIntersecting; }).observe(el);
    comps.push(comp);
  });

  const frame = (c, dt) => {
    if (!c.hover) {
      c.t += dt;
      c.fx.t = -0.06 + 1.12 * (0.5 - 0.5 * Math.cos((c.t * Math.PI * 2) / PERIOD));
      c.fy.t = 0.5; // idle: the swell runs through every line at once
    }
    step(c.fx, dt);
    step(c.fy, dt);
    c.letters.forEach((l) => step(l.w, dt));
  };

  const render = (c) => {
    // Read all positions first, then write, so the heading lays out once per frame.
    const W = c.el.offsetWidth || 1;
    const H = c.el.offsetHeight || 1;
    const lineH = parseFloat(getComputedStyle(c.el).lineHeight) || H;
    const pos = c.letters.map((l) => l.el.getBoundingClientRect());
    const box = c.el.getBoundingClientRect();
    c.letters.forEach((l, k) => {
      const r = pos[k];
      const cx = (r.left + r.width / 2 - box.left) / W;
      const cy = (r.top + r.height / 2 - box.top) / H;
      const dx = (cx - c.fx.x) / SPREAD;
      const dy = c.hover ? ((cy - c.fy.x) * H) / (lineH * ROWS) : 0;
      const g = Math.exp(-(dx * dx + dy * dy));
      l.w.t = LIGHT + (BOLD - LIGHT) * g;
      const wv = clamp(l.w.x, LIGHT, BOLD);
      l.el.style.fontVariationSettings = `"wght" ${wv.toFixed(1)}`;
      l.el.style.opacity = (c.minOpacity + (1 - c.minOpacity) *clamp((l.w.x - LIGHT) / (BOLD - LIGHT), 0, 1)).toFixed(3);
    });
  };

  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    const sub = 4;
    comps.forEach((c) => {
      if (!c.visible) return;
      for (let k = 0; k < sub; k++) frame(c, dt / sub);
      render(c);
    });
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();
