// Fan cards — ported from DesignBookmark "Fan cards" (motion-src/fan-cards + shared/motion.js).
// One fan spring spreads the stack (offset + rotation around the bottom edge); each card has its
// own lift and scale spring for hover. Fans and browses by itself until the pointer comes in.
// Springs kept from the original: fan 220/18, lift 420/20, scale 420/22, click kick -260,
// browse steps every 0.75 s with a 1.4 s pause at the end of a cycle, 4 sub-steps per frame.
(() => {
  const fan = document.querySelector('[data-fan]');
  if (!fan) return;

  /* --- tiny spring engine with sim-time timers (same maths as shared/motion.js) --- */
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // With reduced motion, springs become critically damped (no overshoot), as in motion.js `tune`.
  const S = (x, k = 400, c = 30) => ({ x, v: 0, t: x, k, c: reduce ? 2 * Math.sqrt(k) : c });
  const step = (s, dt) => { const a = -s.k * (s.x - s.t) - s.c * s.v; s.v += a * dt; s.x += s.v * dt; };
  const timers = [];
  const after = (sec, fn) => timers.push({ t: sec, fn });

  fan.classList.add('is-fan');
  const cards = [...fan.querySelectorAll('.fan-card')].map((el) => ({
    el, i: Number(el.dataset.i), lift: S(0, 420, 20), sc: S(1, 420, 22),
  }));
  const front = cards.find((c) => c.i === 1);         // «Тиждень 6» — the latest photo sits on top
  const f = S(reduce ? 1 : 0, 220, 18);               // 0 = stacked, 1 = fanned out
  let hot = -1, clock = 0, userUntil = 0, inside = false, visible = false;

  // Size the stage to the tallest card plus room for the lift.
  const fit = () => { fan.style.height = `${front.el.offsetHeight + 40}px`; };
  fit();
  addEventListener('resize', fit);
  document.fonts?.ready.then(fit);
  fan.querySelectorAll('img').forEach((img) => img.complete || img.addEventListener('load', fit, { once: true }));

  function setHot(i) {
    hot = i;
    cards.forEach((c) => {
      c.lift.t = c.i === hot ? -22 : 0;
      c.sc.t = c.i === hot ? 1.06 : 1;
      c.el.style.zIndex = c.i === hot ? 5 : c.i === 1 ? 3 : 2;
    });
  }
  setHot(-1);

  fan.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'touch') return;
    inside = true; userUntil = Infinity; f.t = 1;
  });
  fan.addEventListener('pointerleave', () => {
    if (!inside) return;
    inside = false; userUntil = clock + 2; f.t = reduce ? 1 : 0; setHot(-1);
  });
  cards.forEach((c) => {
    c.el.addEventListener('pointerenter', () => { if (inside) setHot(c.i); });
    c.el.addEventListener('click', () => { c.lift.v = -260; });
  });

  // Browse by itself: open, lift each week in turn, settle, close.
  if (!reduce) {
    const SEQ = [() => { f.t = 1; }, () => setHot(0), () => setHot(1), () => setHot(2), () => setHot(-1), () => { f.t = 0; }];
    let n = 0;
    (function auto() {
      if (clock >= userUntil) SEQ[n++ % SEQ.length]();
      after(n % SEQ.length === 0 ? 1.4 : 0.75, auto);
    })();
  }

  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(fan);

  const frame = (dt) => {
    clock += dt;
    for (let k = timers.length - 1; k >= 0; k--) if ((timers[k].t -= dt) <= 0) timers.splice(k, 1)[0].fn();
    step(f, dt);
    cards.forEach((c) => { step(c.lift, dt); step(c.sc, dt); });
  };

  const render = () => {
    // Spread scales with the card size (original: 78px for a 150px card).
    // On narrow cards, cap it so the tilted side photos stay inside the card.
    const side = cards.find((c) => c.i === 0).el.offsetWidth;
    const spread = Math.min(front.el.offsetWidth * 0.75, fan.offsetWidth / 2 - side * 0.62 - 12);
    cards.forEach((c) => {
      const d = c.i - 1;
      const x = d * (6 + f.x * (spread - 6));
      const r = d * (3 + f.x * 9);
      const y = Math.abs(d) * f.x * 12 + c.lift.x;
      c.el.style.transform =
        `translate(-50%, 0) translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${r.toFixed(3)}deg) scale(${c.sc.x.toFixed(4)})`;
    });
  };

  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    if (visible) {
      const sub = 4;
      for (let k = 0; k < sub; k++) frame(dt / sub);
      render();
    }
    requestAnimationFrame(loop);
  };
  render();
  requestAnimationFrame(loop);
})();
