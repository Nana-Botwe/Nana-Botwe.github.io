/* =========================================================
   Isaac Banson Botwe — Portfolio interactions
   ========================================================= */
(() => {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const thisYear = new Date().getFullYear();
  const EMAIL = 'isaacnanabotwe@gmail.com';

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  const icon = name => {
    const i = el('i', `bx ${name}`);
    i.setAttribute('aria-hidden', 'true');
    return i;
  };

  /* ---------- Toast ---------- */
  const toastEl = $('.toast');
  let toastTimer;
  const toast = message => {
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 2400);
  };

  /* ---------- Header, progress bar, back-to-top ---------- */
  const header = $('.site-header');
  const progress = $('.scroll-progress span');
  const toTop = $('.back-to-top');
  const nav = $('#site-nav');
  const navToggle = $('.nav-toggle');
  let ticking = false;

  const onScroll = () => {
    const y = window.scrollY;
    const max = root.scrollHeight - window.innerHeight;
    header.classList.toggle('is-scrolled', y > 40 || nav.classList.contains('is-open'));
    progress.style.setProperty('--p', max > 0 ? (y / max).toFixed(4) : 0);
    toTop.classList.toggle('is-visible', y > 700);
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(onScroll);
      ticking = true;
    }
  }, { passive: true });
  onScroll();

  /* ---------- Mobile navigation ---------- */
  const setNav = open => {
    nav.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    $('i', navToggle).className = open ? 'bx bx-x' : 'bx bx-menu';
    onScroll();
  };
  navToggle.addEventListener('click', () => setNav(!nav.classList.contains('is-open')));
  $$('a', nav).forEach(a => a.addEventListener('click', () => setNav(false)));
  document.addEventListener('click', e => {
    if (nav.classList.contains('is-open') && !nav.contains(e.target) && !navToggle.contains(e.target)) setNav(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) {
      setNav(false);
      navToggle.focus();
    }
  });

  /* ---------- Theme ---------- */
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const currentTheme = () => root.getAttribute('data-theme') || (darkQuery.matches ? 'dark' : 'light');
  $('.theme-toggle').addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('ib-theme', next); } catch (e) { /* storage unavailable */ }
  });

  /* ---------- Active section in nav ---------- */
  const navLinks = $$('a', nav);
  if ('IntersectionObserver' in window) {
    const spy = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        navLinks.forEach(a => {
          const active = a.getAttribute('href') === `#${entry.target.id}`;
          a.classList.toggle('is-active', active);
          if (active) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['#hero', ...navLinks.map(a => a.getAttribute('href'))]
      .map(id => $(id))
      .filter(Boolean)
      .forEach(section => spy.observe(section));
  }

  /* ---------- Reveal on scroll ---------- */
  const revealEls = $$('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach(node => node.classList.remove('reveal'));
  } else {
    let pending = revealEls.length;
    const reveal = (node, delay = 0) => {
      revealer.unobserve(node);
      pending -= 1;
      node.style.setProperty('--d', `${delay}ms`);
      node.classList.add('is-visible');
      // Hand control back to the element's own transitions once revealed
      const finish = ev => {
        if (ev.target !== node || ev.propertyName !== 'opacity') return;
        node.removeEventListener('transitionend', finish);
        node.classList.remove('reveal', 'is-visible');
        node.style.removeProperty('--d');
      };
      node.addEventListener('transitionend', finish);
    };
    const revealer = new IntersectionObserver(entries => {
      entries
        .filter(entry => entry.isIntersecting)
        .forEach((entry, i) => reveal(entry.target, Math.min(i * 70, 350)));
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(node => revealer.observe(node));

    // A fast jump (e.g. a nav click) can skip past elements without them ever
    // intersecting, so reveal anything that is already above the viewport.
    let checking = false;
    window.addEventListener('scroll', () => {
      if (checking || pending <= 0) return;
      checking = true;
      requestAnimationFrame(() => {
        $$('.reveal:not(.is-visible)').forEach(node => {
          if (node.getBoundingClientRect().bottom < 0) reveal(node);
        });
        checking = false;
      });
    }, { passive: true });
  }

  /* ---------- Typed roles ---------- */
  const typed = $('.typed');
  if (typed && !reduceMotion) {
    let words = [];
    try { words = JSON.parse(typed.dataset.words); } catch (e) { /* keep static text */ }
    if (words.length > 1) {
      let w = 0;
      let c = words[0].length;
      let deleting = true;
      const tick = () => {
        const word = words[w];
        if (deleting) {
          c -= 1;
          typed.textContent = word.slice(0, c);
          if (c === 0) {
            deleting = false;
            w = (w + 1) % words.length;
            return setTimeout(tick, 350);
          }
          return setTimeout(tick, 32);
        }
        c += 1;
        typed.textContent = word.slice(0, c);
        if (c === word.length) {
          deleting = true;
          return setTimeout(tick, 2200);
        }
        return setTimeout(tick, 68);
      };
      setTimeout(tick, 2600);
    }
  }

  /* ---------- Dynamic numbers & counters ---------- */
  $$('[data-since]').forEach(node => {
    const years = thisYear - Number(node.dataset.since);
    node.dataset.count = years;
    node.textContent = years;
  });
  $$('[data-since-text]').forEach(node => {
    node.textContent = thisYear - Number(node.dataset.sinceText);
  });
  $$('.skill-card').forEach(card => {
    const n = $$('.skill-chips li', card).length;
    const badge = el('span', 'skill-count', String(n));
    badge.setAttribute('aria-label', `${n} skills`);
    $('header', card).append(badge);
  });
  const techCount = $$('.skill-card:not(.is-soft) .skill-chips li').length;
  $$('[data-skill-total]').forEach(node => {
    const rounded = Math.floor(techCount / 5) * 5;
    node.dataset.count = rounded;
    node.textContent = rounded;
  });
  $$('[data-year]').forEach(node => { node.textContent = thisYear; });

  const countUp = node => {
    const target = Number(node.dataset.count);
    if (reduceMotion) {
      node.textContent = target;
      return;
    }
    const start = performance.now();
    const duration = 1400;
    const step = now => {
      const t = Math.min((now - start) / duration, 1);
      node.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if ('IntersectionObserver' in window) {
    const counterObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        counterObserver.unobserve(entry.target);
        countUp(entry.target);
      });
    }, { threshold: 0.6 });
    $$('[data-count]').forEach(node => counterObserver.observe(node));
  }

  /* ---------- Hero spotlight, portrait tilt, card glow ---------- */
  if (finePointer && !reduceMotion) {
    const hero = $('.hero');
    const heroBg = $('.hero-bg');
    hero.addEventListener('pointermove', e => {
      const r = hero.getBoundingClientRect();
      heroBg.style.setProperty('--mx', `${e.clientX - r.left}px`);
      heroBg.style.setProperty('--my', `${e.clientY - r.top}px`);
    });

    const card = $('[data-tilt]');
    if (card) {
      const area = card.parentElement;
      area.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `rotateY(${(x * 10).toFixed(2)}deg) rotateX(${(-y * 10).toFixed(2)}deg)`;
      });
      area.addEventListener('pointerleave', () => { card.style.transform = ''; });
    }

    $$('.value-card').forEach(vc => {
      vc.addEventListener('pointermove', e => {
        const r = vc.getBoundingClientRect();
        vc.style.setProperty('--cx', `${e.clientX - r.left}px`);
        vc.style.setProperty('--cy', `${e.clientY - r.top}px`);
      });
    });
  }

  /* ---------- Delivery lifecycle ---------- */
  const life = $('[data-lifecycle]');
  if (life) {
    const tabs = $$('[data-stage]', life);
    const panels = $$('[data-stage-panel]', life);
    const track = $('.lifecycle-steps', life);
    let current = 0;
    let timer = null;
    let userChose = false;

    const show = index => {
      current = index;
      tabs.forEach((tab, k) => {
        tab.setAttribute('aria-selected', String(k === index));
        tab.tabIndex = k === index ? 0 : -1;
        tab.classList.toggle('is-done', k < index);
      });
      panels.forEach((panel, k) => panel.classList.toggle('is-active', k === index));
      track.style.setProperty('--step', index);
    };
    const stopAuto = () => {
      userChose = true;
      clearInterval(timer);
    };

    tabs.forEach((tab, k) => {
      tab.addEventListener('click', () => {
        stopAuto();
        show(k);
      });
      tab.addEventListener('keydown', e => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        stopAuto();
        const next = (current + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        show(next);
        tabs[next].focus();
      });
    });
    show(0);

    if (!reduceMotion && 'IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        clearInterval(timer);
        if (entry.isIntersecting && !userChose) {
          timer = setInterval(() => show((current + 1) % tabs.length), 3800);
        }
      }, { threshold: 0.4 }).observe(life);
    }
  }

  /* ---------- Experience: durations & expandable bullets ---------- */
  const parseMonth = value => {
    if (value === 'present') return { y: thisYear, m: new Date().getMonth() + 1 };
    const [y, m] = value.split('-').map(Number);
    return { y, m: m || null };
  };
  const plural = (n, unit) => `${n} ${unit}${n > 1 ? 's' : ''}`;
  const duration = (from, to) => {
    const a = parseMonth(from);
    const b = parseMonth(to);
    if (!a.m || !b.m) {
      const years = b.y - a.y;
      return years < 1 ? '< 1 yr' : plural(years, 'yr');
    }
    const months = (b.y - a.y) * 12 + (b.m - a.m) + 1;
    const y = Math.floor(months / 12);
    const m = months % 12;
    return [y && plural(y, 'yr'), m && plural(m, 'mo')].filter(Boolean).join(' ');
  };
  $$('.duration').forEach(node => {
    node.textContent = duration(node.dataset.start, node.dataset.end);
  });

  const VISIBLE_POINTS = 3;
  $$('.tl-card').forEach(card => {
    const list = $('.tl-points', card);
    const items = $$('li', list);
    if (items.length <= VISIBLE_POINTS + 1) return;
    items.slice(VISIBLE_POINTS).forEach(li => li.classList.add('is-extra'));
    const extra = items.length - VISIBLE_POINTS;
    const btn = el('button', 'more-btn');
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    const label = open => {
      btn.replaceChildren(open ? 'Show less' : `Show ${extra} more`, icon('bx-chevron-down'));
    };
    label(false);
    btn.addEventListener('click', () => {
      const open = card.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
      label(open);
    });
    list.after(btn);
  });

  /* ---------- Filters (experience, projects, gallery) ---------- */
  const setupFilter = (attr, itemSelector) => {
    const buttons = $$(`[${attr}]`);
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b.classList.contains('is-active'))));
    buttons.forEach(btn => btn.addEventListener('click', () => {
      const value = btn.getAttribute(attr);
      buttons.forEach(b => {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      $$(itemSelector).forEach(item => {
        const show = value === 'all' || item.dataset.cat.split(' ').includes(value);
        const wasHidden = item.classList.contains('is-hidden');
        item.classList.toggle('is-hidden', !show);
        if (show && wasHidden && !reduceMotion && item.animate) {
          item.animate(
            [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }],
            { duration: 380, easing: 'cubic-bezier(.2,.7,.2,1)' }
          );
        }
      });
    }));
  };
  setupFilter('data-exp-filter', '.tl-item');
  setupFilter('data-project-filter', '.project-card');
  setupFilter('data-gallery-filter', '.shot');

  /* ---------- Skill finder ---------- */
  const search = $('#skill-search');
  if (search) {
    const grid = $('.skill-grid');
    const result = $('.finder-result');
    const clearBtn = $('.finder-clear');
    const norm = s => s.toLowerCase().replace(/[^a-z0-9+#/ .-]/g, ' ').replace(/\s+/g, ' ').trim();
    const squash = s => s.replace(/[\s.-]/g, '');
    const index = $$('.skill-chips li').map(li => ({
      li,
      card: li.closest('.skill-card'),
      name: li.textContent.trim(),
      keys: (li.dataset.keys || '').split(',').map(norm).filter(Boolean)
    }));

    const lookup = term => {
      let hits = index.filter(s => s.keys.includes(term));
      if (!hits.length && term.length >= 3) {
        hits = index.filter(s => s.keys.some(k => k.startsWith(term) || squash(k) === squash(term)));
      }
      if (!hits.length) {
        const unversioned = term.replace(/\s*v?\d+(\.\d+)*$/, '');
        if (unversioned && unversioned !== term) hits = index.filter(s => s.keys.includes(unversioned));
      }
      return hits;
    };

    const render = () => {
      const raw = search.value;
      const terms = [...new Set(raw.split(/[,;\n|]+/).map(norm).filter(Boolean))];
      clearBtn.hidden = !raw.trim();
      index.forEach(s => s.li.classList.remove('is-match'));
      $$('.skill-card').forEach(card => card.classList.remove('has-match'));
      result.replaceChildren();

      if (!terms.length) {
        grid.classList.remove('is-searching');
        result.hidden = true;
        return;
      }

      grid.classList.add('is-searching');
      result.hidden = false;

      const rows = terms.map(term => {
        const hits = lookup(term);
        hits.forEach(s => {
          s.li.classList.add('is-match');
          s.card.classList.add('has-match');
        });
        return { term, hits };
      });

      if (rows.length === 1) {
        const { term, hits } = rows[0];
        const line = el('p', `finder-single ${hits.length ? 'hit' : 'miss'}`);
        line.append(
          icon(hits.length ? 'bx-check-circle' : 'bx-info-circle'),
          el('span', null, hits.length
            ? `Yes, I've worked with ${hits.map(s => s.name).join(', ')}.`
            : `"${term}" isn't on my CV yet. I'm happy to talk about related experience and how quickly I pick up new tools.`)
        );
        result.append(line);
        return;
      }

      const matched = rows.filter(r => r.hits.length).length;
      const pct = Math.round((matched / rows.length) * 100);

      const score = el('div', 'score');
      const ring = el('div', 'score-ring');
      ring.style.setProperty('--pct', pct);
      ring.append(el('span', null, `${pct}%`));
      const summary = el('div');
      summary.append(el('strong', null, `${matched} of ${rows.length} skills match my experience`));
      const hint = el('small');
      if (pct === 100) {
        hint.append('Looks like a strong fit. ');
        const link = el('a', null, "Let's talk");
        link.href = '#contact';
        hint.append(link);
      } else {
        hint.textContent = "For anything not listed, ask me about related experience.";
      }
      summary.append(hint);
      score.append(ring, summary);

      const list = el('ul', 'result-list');
      rows.forEach(({ term, hits }) => {
        const item = el('li', hits.length ? 'hit' : 'miss');
        item.append(
          icon(hits.length ? 'bx-check' : 'bx-minus'),
          hits.length ? hits.map(s => s.name).join(' / ') : term
        );
        list.append(item);
      });

      result.append(score, list);
    };

    search.addEventListener('input', render);
    clearBtn.addEventListener('click', () => {
      search.value = '';
      render();
      search.focus();
    });
    $$('[data-try]').forEach(btn => btn.addEventListener('click', () => {
      search.value = btn.dataset.try;
      render();
    }));
  }

  /* ---------- Project details dialog ---------- */
  const modal = $('#project-modal');
  const supportsDialog = modal && typeof modal.showModal === 'function';
  if (supportsDialog) {
    let activeProject = '';
    $$('.project-card').forEach(card => {
      $('.project-open', card).addEventListener('click', () => {
        activeProject = $('.project-name', card).textContent.trim();
        $('.modal-kicker', modal).textContent = $('.project-kicker', card).textContent.trim();
        $('#pm-title', modal).textContent = activeProject;
        $('.modal-sum', modal).textContent = $('.project-sum', card).textContent.trim();
        $('.modal-tags', modal).replaceChildren(...$$('.tags span', card).map(t => t.cloneNode(true)));
        $('.modal-body', modal).replaceChildren(...Array.from($('.project-details', card).children).map(n => n.cloneNode(true)));
        modal.showModal();
      });
    });
    $('.modal-close', modal).addEventListener('click', () => modal.close());
    modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });
    $('[data-close]', modal).addEventListener('click', () => {
      modal.close();
      const message = $('#cf-message');
      if (message && !message.value.trim()) {
        message.value = `Hi Isaac, I'd like to hear more about your work on "${activeProject}".`;
      }
    });
  } else {
    $$('.project-details').forEach(d => { d.style.display = 'block'; });
    $$('.project-more').forEach(m => { m.hidden = true; });
  }

  /* ---------- Gallery lightbox ---------- */
  const lightbox = $('#lightbox');
  if (lightbox && typeof lightbox.showModal === 'function') {
    const img = $('img', lightbox);
    const caption = $('figcaption', lightbox);
    let shots = [];
    let at = 0;

    const showShot = i => {
      at = (i + shots.length) % shots.length;
      const shot = shots[at];
      const thumb = $('img', shot);
      img.src = $('.shot-open', shot).getAttribute('href');
      img.alt = thumb.alt;
      const title = $('figcaption strong', shot).textContent;
      const sub = $('figcaption span', shot).textContent;
      caption.replaceChildren(el('strong', null, title), el('span', null, sub), el('em', null, `${at + 1} / ${shots.length}`));
    };

    $$('.shot-open').forEach(link => link.addEventListener('click', e => {
      e.preventDefault();
      shots = $$('.shot:not(.is-hidden)');
      showShot(shots.indexOf(link.closest('.shot')));
      lightbox.showModal();
    }));
    $('.lb-prev', lightbox).addEventListener('click', () => showShot(at - 1));
    $('.lb-next', lightbox).addEventListener('click', () => showShot(at + 1));
    $('.lb-close', lightbox).addEventListener('click', () => lightbox.close());
    lightbox.addEventListener('click', e => {
      if (e.target === lightbox || e.target.tagName === 'FIGURE') lightbox.close();
    });
    lightbox.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') showShot(at + 1);
      if (e.key === 'ArrowLeft') showShot(at - 1);
    });
    let startX = null;
    lightbox.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    lightbox.addEventListener('touchend', e => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) showShot(at + (dx < 0 ? 1 : -1));
      startX = null;
    });
  }

  /* ---------- Copy to clipboard ---------- */
  const copyText = async text => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = el('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      return ok;
    }
  };
  $$('.copy-btn').forEach(btn => btn.addEventListener('click', async () => {
    const text = btn.dataset.copy;
    const ok = await copyText(text);
    if (!ok) {
      toast(`Couldn't copy. It's ${text}`);
      return;
    }
    const i = $('i', btn);
    btn.classList.add('is-copied');
    i.className = 'bx bx-check';
    toast(`Copied ${text}`);
    setTimeout(() => {
      btn.classList.remove('is-copied');
      i.className = 'bx bx-copy';
    }, 1800);
  }));

  /* ---------- Contact form → email app ---------- */
  const form = $('#contact-form');
  if (form) {
    const rules = {
      name: v => v.trim().length > 1,
      email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()),
      message: v => v.trim().length > 4
    };
    const validate = input => {
      const ok = rules[input.name](input.value);
      input.closest('.field').classList.toggle('has-error', !ok);
      input.setAttribute('aria-invalid', String(!ok));
      return ok;
    };
    Object.keys(rules).forEach(name => {
      const input = form.elements[name];
      input.addEventListener('blur', () => { if (input.value) validate(input); });
      input.addEventListener('input', () => {
        if (input.closest('.field').classList.contains('has-error')) validate(input);
      });
    });

    form.addEventListener('submit', e => {
      e.preventDefault();
      const invalid = Object.keys(rules).map(n => form.elements[n]).filter(input => !validate(input));
      if (invalid.length) {
        invalid[0].focus();
        return;
      }
      const f = form.elements;
      const name = f.name.value.trim();
      const company = f.company.value.trim();
      const subject = `${f.reason.value}: ${name}${company ? ` (${company})` : ''}`;
      const body = [f.message.value.trim(), '', '--', name, company, f.email.value.trim()].filter((line, i) => i < 3 || line).join('\n');
      window.location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      toast('Opening your email app…');
    });
  }
})();
