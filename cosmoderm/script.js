(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // Analytics hook (spec: booking_open / booking_submit / booking_success / booking_error)
  const track = (event, data = {}) => {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event, ...data });
  };

  /* ---------- Header shadow on scroll ---------- */
  const header = $('.site-header');
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Statement: words fill with colour while scrolling ---------- */
  const lead = $('.statement .lead');
  if (lead && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const text = lead.textContent.trim();
    lead.setAttribute('aria-label', text);
    lead.innerHTML = text.split(/\s+/).map((w) => `<span class="w" aria-hidden="true">${w}</span>`).join(' ');
    lead.classList.add('is-scrubbing');
    const words = $$('.w', lead);
    let ticking = false;
    const paint = () => {
      ticking = false;
      const r = lead.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 when the paragraph top reaches 85% of the viewport, 1 when its bottom reaches 55%
      const start = vh * 0.85;
      const end = vh * 0.55;
      const p = Math.min(1, Math.max(0, (start - r.top) / (r.height + start - end)));
      const lit = Math.round(p * words.length);
      words.forEach((w, i) => w.classList.toggle('is-on', i < lit));
    };
    const requestPaint = () => { if (!ticking) { ticking = true; requestAnimationFrame(paint); } };
    window.addEventListener('scroll', requestPaint, { passive: true });
    window.addEventListener('resize', requestPaint);
    paint();
  }

  /* ---------- FAQ accordion: one open at a time ---------- */
  $$('.faq-item').forEach((item) => {
    const btn = $('.faq-q', item);
    btn.addEventListener('click', () => {
      const willOpen = !item.classList.contains('is-open');
      $$('.faq-item.is-open').forEach((o) => {
        o.classList.remove('is-open');
        $('.faq-q', o).setAttribute('aria-expanded', 'false');
      });
      if (willOpen) {
        item.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* ---------- Booking dialog ---------- */
  const dialog = $('#booking');
  const form = $('#booking-form');
  const success = $('#booking-success');
  const submitBtn = $('#submit-btn');
  const submitLabel = $('.submit-label', submitBtn);
  const nameInput = $('#name');
  const phoneInput = $('#phone');
  const consent = $('#consent');
  const formError = $('#form-error');
  let lastTrigger = null;
  let lastScroll = 0;

  const phoneDigits = () => phoneInput.value.replace(/\D/g, '').replace(/^380/, '');
  const validName = () => nameInput.value.trim().length >= 2;
  const validPhone = () => phoneDigits().length === 9;
  const canSubmit = () => validName() && validPhone() && consent.checked;
  const updateSubmit = () => { submitBtn.disabled = !canSubmit(); };

  const showError = (fieldId, show) => {
    const field = $('#' + fieldId);
    field.classList.toggle('has-error', show);
    $('input', field).setAttribute('aria-invalid', show ? 'true' : 'false');
  };

  // +380 mask: "+380 67 123 45 67"
  phoneInput.addEventListener('focus', () => { if (!phoneInput.value) phoneInput.value = '+380 '; });
  phoneInput.addEventListener('input', () => {
    const d = phoneDigits().slice(0, 9);
    const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
    phoneInput.value = '+380 ' + parts.join(' ');
    if ($('#field-phone').classList.contains('has-error') && validPhone()) showError('field-phone', false);
    updateSubmit();
  });
  nameInput.addEventListener('input', () => {
    if ($('#field-name').classList.contains('has-error') && validName()) showError('field-name', false);
    updateSubmit();
  });
  nameInput.addEventListener('blur', () => { if (nameInput.value) showError('field-name', !validName()); });
  phoneInput.addEventListener('blur', () => {
    if (phoneInput.value.trim() === '+380') { phoneInput.value = ''; return; }
    if (phoneInput.value) showError('field-phone', !validPhone());
  });
  consent.addEventListener('change', updateSubmit);

  const resetDialog = () => {
    form.reset();
    form.hidden = false;
    success.hidden = true;
    formError.hidden = true;
    showError('field-name', false);
    showError('field-phone', false);
    submitLabel.textContent = 'Надіслати заявку';
    $('.spinner', submitBtn)?.remove();
    updateSubmit();
  };

  const isMobile = () => window.matchMedia('(max-width: 767px)').matches;

  const openBooking = (source, trigger) => {
    lastTrigger = trigger || null;
    lastScroll = window.scrollY;
    resetDialog();
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    // Desktop: focus first field. Mobile: no autofocus so the keyboard doesn't cover the sheet.
    if (!isMobile()) nameInput.focus(); else $('.icon-btn', dialog).focus();
    track('booking_open', { source });
  };

  const closeBooking = () => {
    if (!dialog.open) return;
    dialog.close();
  };
  dialog.addEventListener('close', () => {
    document.body.style.overflow = '';
    window.scrollTo({ top: lastScroll });
    lastTrigger?.focus({ preventScroll: true });
  });

  $$('[data-booking]').forEach((btn) => btn.addEventListener('click', () => openBooking(btn.dataset.booking, btn)));
  dialog.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeBooking();
    else if (e.target === dialog) closeBooking(); // click on backdrop
  });

  // Swipe down on the sheet handle area (mobile)
  let startY = null;
  const panel = $('.booking-panel');
  panel.addEventListener('touchstart', (e) => { if (panel.scrollTop <= 0) startY = e.touches[0].clientY; }, { passive: true });
  panel.addEventListener('touchend', (e) => {
    if (startY !== null && e.changedTouches[0].clientY - startY > 90 && isMobile()) closeBooking();
    startY = null;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('field-name', !validName());
    showError('field-phone', !validPhone());
    if (!canSubmit()) return;

    const data = Object.fromEntries(new FormData(form));
    track('booking_submit', { reason: data.reason, time: data.time });
    formError.hidden = true;
    submitBtn.disabled = true;
    submitLabel.textContent = 'Надсилаємо…';
    submitBtn.insertAdjacentHTML('afterbegin', '<span class="spinner" aria-hidden="true"></span>');

    try {
      // Demo: no backend yet. Replace with a real request to the clinic's CRM.
      await new Promise((r) => setTimeout(r, 900));
      if (!navigator.onLine) throw new Error('offline');

      $('[data-sum="name"]').textContent = data.name.trim();
      $('[data-sum="phone"]').textContent = phoneInput.value;
      $('[data-sum="reason"]').textContent = data.reason;
      $('[data-sum="time"]').textContent = data.time;
      form.hidden = true;
      success.hidden = false;
      $('#success-title').focus();
      track('booking_success');
    } catch (err) {
      formError.hidden = false;
      submitLabel.textContent = 'Надіслати заявку';
      $('.spinner', submitBtn)?.remove();
      updateSubmit();
      track('booking_error', { message: String(err) });
    }
  });

  /* ---------- Quiz ---------- */
  const quizResult = $('#quiz-result');
  $$('.quiz-option').forEach((opt) => {
    opt.addEventListener('click', () => {
      $$('.quiz-option').forEach((o) => o.setAttribute('aria-pressed', String(o === opt)));
      if (opt.dataset.quiz === 'plan') {
        quizResult.textContent = '';
        openBooking('quiz', opt);
      } else {
        quizResult.innerHTML = 'Чудово! Якщо захочете підтримати результат — <a href="https://instagram.com/cosmodermlviv" target="_blank" rel="noopener">напишіть нам в Instagram</a>.';
      }
    });
  });

  /* ---------- Sticky CTA (mobile): after hero, hidden near CTA banner / footer ---------- */
  const sticky = $('#sticky-cta');
  const hero = $('.hero');
  const blockers = [$('#cta'), $('#footer')];
  let heroGone = false;
  const blockerVisible = new Set();
  const updateSticky = () => sticky.classList.toggle('is-visible', heroGone && blockerVisible.size === 0);

  new IntersectionObserver(([entry]) => {
    heroGone = !entry.isIntersecting && entry.boundingClientRect.top < 0;
    updateSticky();
  }).observe(hero);

  const blockObs = new IntersectionObserver((entries) => {
    entries.forEach((en) => (en.isIntersecting ? blockerVisible.add(en.target) : blockerVisible.delete(en.target)));
    updateSticky();
  });
  blockers.forEach((b) => blockObs.observe(b));
})();
