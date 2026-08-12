(function () {
  "use strict";

  var TABS = ['home', 'registration', 'abstracts', 'agenda'];
  var tabButtons = TABS.map(function (id) { return document.getElementById('tab-' + id); });
  var panels = TABS.map(function (id) { return document.getElementById('panel-' + id); });

  function activateTab(id, opts) {
    opts = opts || {};
    var index = TABS.indexOf(id);
    if (index === -1) index = 0;
    id = TABS[index];

    TABS.forEach(function (t, i) {
      var isActive = t === id;
      tabButtons[i].setAttribute('aria-selected', String(isActive));
      tabButtons[i].tabIndex = isActive ? 0 : -1;
      panels[i].hidden = !isActive;
    });

    if (opts.updateHash !== false) {
      history.replaceState(null, '', '#' + id);
    }

    if (opts.focusPanel) {
      panels[index].focus({ preventScroll: true });
    }

    window.scrollTo({ top: 0, behavior: opts.instantScroll ? 'auto' : 'smooth' });
    initRevealFor(panels[index]);
  }

  document.querySelectorAll('[data-tab-link]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      activateTab(el.getAttribute('data-tab-link'), { focusPanel: true });
    });
  });

  // Arrow-key navigation between tabs (WAI-ARIA tabs pattern)
  var tabNav = document.querySelector('.tab-nav');
  tabNav.addEventListener('keydown', function (e) {
    var currentIndex = TABS.findIndex(function (t) {
      return document.getElementById('tab-' + t) === document.activeElement;
    });
    if (currentIndex === -1) return;
    var next = null;
    if (e.key === 'ArrowRight') next = (currentIndex + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (currentIndex - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next !== null) {
      e.preventDefault();
      activateTab(TABS[next]);
      tabButtons[next].focus();
    }
  });

  function tabFromHash() {
    var hash = (location.hash || '').replace('#', '');
    return TABS.indexOf(hash) !== -1 ? hash : 'home';
  }

  window.addEventListener('hashchange', function () {
    activateTab(tabFromHash(), { updateHash: false });
  });

  // ---- Scroll reveal ----
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var revealObserver = null;
  if (!reduceMotion && 'IntersectionObserver' in window) {
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  }

  function initRevealFor(scope) {
    var targets = scope.querySelectorAll('[data-animate]:not(.in-view)');
    targets.forEach(function (el) {
      if (reduceMotion || !revealObserver) {
        el.classList.add('in-view');
      } else {
        revealObserver.observe(el);
      }
    });
  }

  // ---- Registration deadline countdown (Jul 31, 2026 23:59 KST) ----
  var deadline = new Date('2026-07-31T23:59:00+09:00');
  var cdDays = document.getElementById('cd-days');
  var cdHours = document.getElementById('cd-hours');
  var cdMins = document.getElementById('cd-mins');

  function updateCountdown() {
    if (!cdDays) return;
    var diff = deadline.getTime() - Date.now();
    if (diff <= 0) {
      cdDays.textContent = '0';
      cdHours.textContent = '0';
      cdMins.textContent = '0';
      return;
    }
    var totalMinutes = Math.floor(diff / 60000);
    var days = Math.floor(totalMinutes / (60 * 24));
    var hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    var mins = totalMinutes % 60;
    cdDays.textContent = String(days);
    cdHours.textContent = String(hours);
    cdMins.textContent = String(mins);
  }
  updateCountdown();
  setInterval(updateCountdown, 30000);

  // ---- Registration iframe skeleton ----
  var iframe = document.getElementById('reg-form-iframe');
  var skeleton = document.getElementById('form-skeleton');
  if (iframe && skeleton) {
    iframe.style.opacity = '0';
    iframe.style.transition = 'opacity ' + (reduceMotion ? '1ms' : '360ms') + ' ease-out';
    iframe.addEventListener('load', function () {
      iframe.style.opacity = '1';
      skeleton.style.display = 'none';
    });
  }

  // ---- Presenter booth gallery ----
  var boothModal = document.getElementById('booth-modal');
  var lastBoothTrigger = null;

  if (boothModal) {
    var modalThumb = document.getElementById('booth-modal-thumb');
    var modalTag = document.getElementById('booth-modal-tag');
    var modalNumber = document.getElementById('booth-modal-number');
    var modalTitle = document.getElementById('booth-modal-title');
    var modalAuthors = document.getElementById('booth-modal-authors');
    var modalSchool = document.getElementById('booth-modal-school');
    var modalAbstract = document.getElementById('booth-modal-abstract');
    var modalClose = boothModal.querySelector('[data-modal-close]');

    document.querySelectorAll('.booth-open').forEach(function (btn) {
      btn.addEventListener('click', function () {
        lastBoothTrigger = btn;
        var boothNum = btn.getAttribute('data-booth') || '';
        if (modalNumber) {
          modalNumber.textContent = boothNum ? 'Booth ' + boothNum : '';
          modalNumber.hidden = !boothNum;
        }
        var tag = btn.getAttribute('data-tag') || '';
        modalTag.textContent = tag;
        modalTag.hidden = !tag;
        modalTitle.textContent = btn.getAttribute('data-title') || '';
        modalAuthors.textContent = btn.getAttribute('data-authors') || '';
        modalSchool.textContent = btn.getAttribute('data-school') || '';
        modalAbstract.textContent = btn.getAttribute('data-abstract') || '';
        var posterFull = btn.getAttribute('data-poster');
        var posterWebp = btn.getAttribute('data-poster-webp');
        var posterPrev = btn.getAttribute('data-poster-thumb');
        if (posterFull) {
          var link = document.createElement('a');
          link.className = 'modal-thumb-link';
          link.href = posterFull;
          link.target = '_blank';
          link.rel = 'noopener';
          link.setAttribute('aria-label', 'Open full poster image in a new tab');
          var img = document.createElement('img');
          img.className = 'modal-thumb-img';
          img.alt = (btn.getAttribute('data-title') || 'Poster') + ' — full poster';
          // Show the grid thumbnail immediately (already cached, so it paints
          // instantly), then swap in the full poster once it has downloaded.
          if (posterPrev) {
            img.src = posterPrev;
            img.classList.add('is-loading');
            var full = new Image();
            full.onload = function () {
              img.src = full.src;
              img.classList.remove('is-loading');
            };
            full.onerror = function () {
              // WebP unsupported or missing — fall back to the JPEG.
              if (full.src.indexOf(posterFull) === -1) { full.src = posterFull; return; }
              img.classList.remove('is-loading');
            };
            full.src = posterWebp || posterFull;
          } else {
            img.src = posterFull;
          }
          link.appendChild(img);
          modalThumb.innerHTML = '';
          modalThumb.appendChild(link);
        } else {
          var srcThumb = btn.querySelector('.booth-thumb svg');
          modalThumb.innerHTML = srcThumb ? srcThumb.outerHTML : '';
        }
        boothModal.showModal();
      });
    });

    modalClose.addEventListener('click', function () { boothModal.close(); });

    boothModal.addEventListener('click', function (e) {
      if (e.target === boothModal) boothModal.close();
    });

    boothModal.addEventListener('close', function () {
      if (lastBoothTrigger) lastBoothTrigger.focus();
    });
  }

  // ---- Booth bookmarks (persisted locally) ----
  var BOOKMARK_KEY = 'mic2026-bookmarked-booths';
  function readBookmarks() {
    try { return JSON.parse(localStorage.getItem(BOOKMARK_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function writeBookmarks(list) {
    try { localStorage.setItem(BOOKMARK_KEY, JSON.stringify(list)); }
    catch (e) { /* storage unavailable */ }
  }

  var bookmarked = readBookmarks();
  document.querySelectorAll('.booth-bookmark').forEach(function (btn) {
    var card = btn.closest('.booth-card');
    var openBtn = card ? card.querySelector('.booth-open') : null;
    var title = openBtn ? openBtn.getAttribute('data-title') : '';

    if (bookmarked.indexOf(title) !== -1) {
      btn.setAttribute('aria-pressed', 'true');
    }

    btn.addEventListener('click', function () {
      var isPressed = btn.getAttribute('aria-pressed') === 'true';
      btn.setAttribute('aria-pressed', String(!isPressed));
      var list = readBookmarks();
      var idx = list.indexOf(title);
      if (!isPressed && idx === -1) list.push(title);
      if (isPressed && idx !== -1) list.splice(idx, 1);
      writeBookmarks(list);
    });
  });

  // ---- Init ----
  activateTab(tabFromHash(), { updateHash: false, instantScroll: true });
})();
