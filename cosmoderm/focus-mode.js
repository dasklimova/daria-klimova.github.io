// Focus mode — ported from DesignBookmark "Focus mode" (motion-src/focus-mode + shared/motion.js),
// adapted to CosmoDerm's home-care reminders.
// Every reminder has y, scale, opacity and a wobble on springs. A new one drops in on top, the others
// are pushed down and the fourth slides away under the bar. "Тихий режим" on: the reminders stack up
// under the newest, then the stack drops under the bar and the held count rolls once. A reminder that
// lands meanwhile shows in place, then tucks under too. Off: the last held ones rise and fan out.
// Springs kept from the original tokens: soft 260/24, pop 520/16, fade 420/32, settle 280/22,
// wobble 700/9; new reminder every 2.1 s; 4 sub-steps per frame.
(() => {
  const host = document.querySelector('[data-focus]');
  if (!host) return;

  /* --- tiny spring engine with sim-time timers (same maths as shared/motion.js) --- */
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const S = (x, k = 400, c = 30) => ({ x, v: 0, t: x, k, c });
  const tune = (s, k, c) => { s.k = k; s.c = reduce ? 2 * Math.sqrt(k) : c; };
  const step = (s, dt) => { const a = -s.k * (s.x - s.t) - s.c * s.v; s.v += a * dt; s.x += s.v * dt; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const timers = [];
  const after = (sec, fn) => timers.push({ t: sec, fn });
  const T = { soft: [260, 24], pop: [520, 16], fade: [420, 32], settle: [280, 22] };

  // Reminders from the doctor's home-care plan (icon, when, what, short what for mobile, status tag)
  const ICON = (n) => `assets/icons/${n}.svg`;
  const POOL = [
    ['sun', 'Ранок', 'Очищення · SPF 50', 'Очищення · SPF', 'Зроблено', 'success'],
    ['moon', 'Вечір', 'Засіб за планом лікаря', 'Засіб за планом', 'Сьогодні', 'accent'],
    ['calendar', 'Пн, Чт', 'Зволоження після процедури', 'Зволоження', 'Нагадати', 'attention'],
    ['camera', 'Неділя', 'Фото тижня 7 за підказками', 'Фото тижня 7', 'Сьогодні', 'accent'],
    ['sun', 'Обід', 'Повторно нанести SPF', 'Повторно SPF', 'Нагадати', 'attention'],
    ['moon', 'Вечір', 'Без нових засобів до візиту', 'Без нових засобів', 'План', 'accent'],
  ];

  /* --- build the component in place of the static list --- */
  const wrap = document.createElement('div');
  wrap.className = 'fc-wrap';
  // The moving reminders are decorative; the static list stays (visually hidden) for screen readers.
  // The switch itself is a real, keyboard-reachable control.
  wrap.innerHTML = `
    <div class="fc-list" aria-hidden="true"></div>
    <p class="fc-calm" aria-live="polite">Нагадування на паузі — повернуться, щойно вимкнете</p>
    <div class="fc-bar">
      <span class="icon-badge" aria-hidden="true"><img src="${ICON('moon')}" width="20" height="20" alt=""></span>
      <span class="fc-lbl" id="fc-lbl">Тихий режим</span>
      <span class="fc-chip" aria-hidden="true"><span class="fc-roll"></span></span>
      <button class="fc-sw" type="button" role="switch" aria-checked="false" aria-labelledby="fc-lbl"><span class="fc-knob"></span></button>
    </div>`;
  host.before(wrap);
  host.classList.add('visually-hidden'); // keep the plain list for assistive tech
  const list = wrap.querySelector('.fc-list');
  const bar = wrap.querySelector('.fc-bar');
  const calm = wrap.querySelector('.fc-calm');
  const chip = wrap.querySelector('.fc-chip');
  const sw = wrap.querySelector('.fc-sw');
  const knob = wrap.querySelector('.fc-knob');

  /* --- geometry from the real row size (desktop 84px rows, mobile ~70px) --- */
  let ROW = 84, GAP = 16, UNDER = 0, BOT = 0;
  function measure() {
    const probe = make(0, true);
    ROW = probe.el.offsetHeight || 84;
    probe.el.remove();
    GAP = matchMedia('(max-width: 767px)').matches ? 12 : 16;
    const listH = 3 * ROW + 2 * GAP;
    list.style.height = `${listH}px`;
    bar.style.height = `${ROW}px`;
    wrap.style.height = `${listH + GAP + ROW}px`;
    calm.style.top = `${listH / 2 - 10}px`;
    UNDER = listH + GAP;          // card top flush with the bar top = fully behind the bar
    BOT = 2 * (ROW + GAP);
  }

  /* --- rolling count in the chip --- */
  function roll(el, h) {
    let items = [], cur = null;
    return {
      set(w) {
        if (w === cur) return;
        items.forEach((o) => { o.y.t = -h; o.o.t = 0; o.dead = true; });
        const sp = document.createElement('span'); sp.textContent = w; el.appendChild(sp);
        const o = { el: sp, y: S(cur == null ? 0 : h), o: S(cur == null ? 1 : 0) };
        tune(o.y, ...T.fade); tune(o.o, ...T.fade); o.y.t = 0; o.o.t = 1; items.push(o); cur = w;
      },
      step(dt) {
        items.forEach((o) => { step(o.y, dt); step(o.o, dt); });
        items = items.filter((o) => { if (o.dead && o.o.x < 0.02) { o.el.remove(); return false; } return true; });
      },
      render() {
        items.forEach((o) => {
          o.el.style.transform = `translateY(${o.y.x.toFixed(2)}px)`;
          const v = clamp(o.o.x, 0, 1);
          o.el.style.opacity = v.toFixed(3);
          o.el.style.filter = v > 0.98 ? '' : `blur(${((1 - v) * 2).toFixed(2)}px)`;
        });
      },
    };
  }
  const cnt = roll(wrap.querySelector('.fc-roll'), 24);

  let pi = 0, notes = [], all = [], held = [], pending = [], on = false, clock = 0, userUntil = 0, visible = false;
  const CA = S(0, ...T.fade);
  const K = S(0, ...T.settle), CH = S(0, ...T.pop), CP = S(1, ...T.pop);
  tune(CA, ...T.fade); tune(K, ...T.settle); tune(CH, ...T.pop); tune(CP, ...T.pop);

  const stackAt = (n, k) => { n.y.t = k * 7; n.s.t = 1 - k * 0.05; n.r.t = 0; };

  function make(idx, probe = false) {
    const [icon, when, what, whatShort, tag, tone] = POOL[idx % POOL.length];
    const el = document.createElement('div');
    el.className = 'care-task fc-note';
    el.innerHTML = `<div class="care-task__lead"><span class="icon-badge"><img src="${ICON(icon)}" width="20" height="20" alt=""></span>`
      + `<div><p class="care-task__time">${when}</p><p class="care-task__name"><span class="d-only">${what}</span><span class="m-only">${whatShort}</span></p></div></div>`
      + `<span class="tag tag--${tone}-soft">${tag}</span>`;
    list.appendChild(el);
    const n = { el, idx, y: S(-ROW), s: S(0.9), o: S(0), r: S(0), dead: false };
    tune(n.y, ...T.soft); tune(n.s, ...T.pop); tune(n.o, ...T.fade); tune(n.r, 700, 9);
    if (!probe) all.push(n);
    return n;
  }

  function layout() {
    notes.forEach((m, i) => {
      if (i < 3) { m.y.t = i * (ROW + GAP); m.s.t = 1; m.o.t = 1; }
      else { m.y.t = UNDER; m.s.t = 0.96; m.o.t = 0; m.dead = true; } // oldest slides away under the bar
    });
    notes = notes.slice(0, 3);
  }

  function count() { cnt.set(`${held.length}`); CH.t = 1; CP.x = 1.18; }

  // Slide a group under the bar together, then count them once.
  function tuck(group) {
    held.push(...group.map((m) => m.idx).reverse());
    group.forEach((m, k) => { m.y.t = UNDER; m.s.t = 0.92; if (k) m.o.t = 0; });
    after(0.22, () => group.forEach((m) => { m.o.t = 0; }));
    after(0.2, () => { group.forEach((m) => { m.dead = true; }); if (on) count(); });
  }

  function arrive() {
    const n = make(pi++);
    if (on) {
      n.y.x = BOT - 12; n.y.t = BOT; n.s.x = 0.94; n.s.t = 1; n.o.t = 1;
      pending.push(n);
      after(0.6, () => { if (!pending.includes(n)) return; pending = pending.filter((m) => m !== n); tuck([n]); });
      return;
    }
    // short drop, fade and unblur, no overshoot
    n.y.x = n.y.t = -14; n.s.x = n.s.t = 0.96; n.o.t = 0; tune(n.s, ...T.fade);
    notes.unshift(n); layout(); n.y.t = -14; n.s.t = 0.96; n.o.t = 0; // the others make room first
    after(0.07, () => { if (!n.dead) { n.y.t = 0; n.s.t = 1; n.o.t = 1; } });
  }

  function setOn(v) {
    if (v === on) return;
    on = v; sw.setAttribute('aria-checked', String(v)); wrap.classList.toggle('is-on', v);
    K.t = v ? 1 : 0; CA.t = 0; if (v) after(0.7, () => { if (on) CA.t = 1; });
    if (v) {
      const group = notes; notes = [];
      group.forEach((m, k) => stackAt(m, k));   // older ones slide up under the newest
      after(0.24, () => tuck(group));            // then the stack drops under the bar
    } else {
      const keep = pending.reverse(); pending = [];
      const back = held.slice(-Math.max(0, 3 - keep.length)).reverse(); held = [];
      const made = back.map((idx, i) => ({ idx, i })).reverse().map(({ idx, i }) => {
        const n = make(idx);
        n.y.x = UNDER; n.s.x = 0.92; n.o.x = 0; n.o.t = 1; stackAt(n, i + keep.length);
        return n;
      }).reverse();
      keep.forEach((m, k) => { list.appendChild(m.el); stackAt(m, k); });
      notes = keep.concat(made, notes);
      after(0.26, () => layout());                // fan the stack out into the slots
      after(0.3, () => { CH.t = 0; });
      after(0.7, () => { if (!on) cnt.set(''); });
    }
  }
  sw.addEventListener('click', () => { userUntil = clock + 8; setOn(!on); });

  // Press feedback: the switch dips to .97 on press and springs back (original behaviour).
  sw.addEventListener('pointerdown', () => {
    const ease = 'cubic-bezier(.23,1,.32,1)';
    sw._pa?.cancel(); sw._pa = sw.animate([{ scale: '1' }, { scale: '.97' }], { duration: 120, easing: ease, fill: 'forwards' });
    const up = () => {
      removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      sw._pa?.cancel(); sw._pa = sw.animate([{ scale: '.97' }, { scale: '1' }], { duration: 220, easing: ease });
    };
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });

  // Start with the three reminders from the design.
  measure();
  [2, 1, 0].forEach((i) => { const n = make(i); n.y.x = 0; n.s.x = 1; n.o.x = 1; notes.unshift(n); });
  pi = 3; layout(); notes.forEach((n) => { n.y.x = n.y.t; });
  CP.x = 1;

  addEventListener('resize', () => { measure(); if (!on) layout(); });
  document.fonts?.ready.then(() => { measure(); if (!on) { layout(); notes.forEach((n) => { n.y.x = n.y.t; }); } });

  let beat = 0;
  (function auto() {
    beat++;
    arrive();
    if (clock >= userUntil) {
      if (!on && beat % 4 === 0) after(0.9, () => setOn(true));
      else if (on && beat % 4 === 2) after(0.9, () => setOn(false));
    }
    after(2.1, auto);
  })();

  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(wrap);

  const frame = (dt) => {
    clock += dt;
    for (let k = timers.length - 1; k >= 0; k--) if ((timers[k].t -= dt) <= 0) timers.splice(k, 1)[0].fn();
    all.forEach((n) => { step(n.y, dt); step(n.s, dt); step(n.o, dt); step(n.r, dt); });
    all = all.filter((n) => { if (n.dead && n.o.x < 0.02 && n.o.t === 0) { n.el.remove(); return false; } return true; });
    [K, CH, CP, CA].forEach((s) => step(s, dt));
    cnt.step(dt);
  };

  const render = () => {
    all.forEach((n) => {
      n.el.style.transform = `translateY(${n.y.x.toFixed(2)}px) scale(${Math.max(0, n.s.x).toFixed(4)}) rotate(${n.r.x.toFixed(2)}deg)`;
      const op = clamp(n.o.x, 0, 1);
      n.el.style.opacity = op.toFixed(3);
      n.el.style.filter = op > 0.98 ? '' : `blur(${((1 - op) * 4).toFixed(2)}px)`;
    });
    knob.style.transform = `translateX(${(20 * K.x).toFixed(2)}px) scaleX(${(1 + Math.abs(K.v) * 0.03).toFixed(3)})`;
    const c = Math.max(0, CH.x) * CP.x;
    chip.style.transform = `scale(${c.toFixed(4)})`;
    chip.style.opacity = clamp(CH.x * 1.5, 0, 1).toFixed(3);
    cnt.render();
    calm.style.opacity = clamp(CA.x, 0, 1).toFixed(3);
    calm.style.transform = `translateY(${((1 - CA.x) * 8).toFixed(2)}px)`;
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
