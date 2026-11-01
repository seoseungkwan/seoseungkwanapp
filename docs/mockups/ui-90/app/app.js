(function () {
  var scrs = Array.prototype.slice.call(document.querySelectorAll('.scr'));
  function fit() {
    scrs.forEach(function (s) {
      var vp = s.firstElementChild, w = +s.dataset.w;
      var z = s.clientWidth / w;
      if (z > 0) vp.style.zoom = z;
    });
  }
  fit();
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) { var ro = new ResizeObserver(fit); scrs.forEach(function (s) { ro.observe(s); }); }

  var timers = new WeakMap();
  function setTab(ui, name) {
    ui.querySelectorAll('[data-tab]').forEach(function (a) {
      if (a.dataset.tab === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    var p = ui.querySelector('.allp'), b = ui.querySelector('.allbtn');
    if (p && !p.hidden) { p.hidden = true; if (b) b.setAttribute('aria-expanded', 'false'); }
    var t = ui.querySelector('.tabs-sc .tab[data-tab="' + name + '"]');
    if (t) { var sc = t.parentNode.parentNode; sc.scrollLeft = Math.max(0, t.offsetLeft - 24); }
    var bar = ui.querySelector('.ldbar');
    if (bar) {
      (timers.get(bar) || []).forEach(clearTimeout);
      bar.className = 'ldbar'; void bar.offsetWidth; bar.classList.add('go');
      timers.set(bar, [setTimeout(function () { bar.classList.add('done'); }, 700), setTimeout(function () { bar.className = 'ldbar'; }, 1150)]);
    }
    var fig = ui.closest('.fig');
    var tt = fig && fig.querySelector('.btab-t');
    if (tt) tt.textContent = name + ' · 예시정형외과의원';
  }

  var dlg = document.getElementById('zoom');
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act], .ui a, .ui button, .ui [data-tab]');
    if (!el) {
      document.querySelectorAll('.acct-w.open').forEach(function (w) { w.classList.remove('open'); var b = w.querySelector('[data-act=acct]'); if (b) b.setAttribute('aria-expanded', 'false'); });
      return;
    }
    var act = el.dataset.act, ui = el.closest('.ui');
    if (el.tagName === 'A') e.preventDefault();
    if (act === 'acct') {
      var w = el.parentNode, on = !w.classList.contains('open');
      w.classList.toggle('open', on); el.setAttribute('aria-expanded', on ? 'true' : 'false');
      return;
    }
    if (act === 'allmenu') {
      var p = ui.querySelector('.allp'); p.hidden = !p.hidden;
      el.setAttribute('aria-expanded', p.hidden ? 'false' : 'true');
      return;
    }
    if (el.dataset.tab !== undefined) { setTab(ui, el.dataset.tab, el); return; }
    if (act === 'pst') {
      var ol = el.nextElementSibling; ol.hidden = !ol.hidden;
      el.setAttribute('aria-expanded', ol.hidden ? 'false' : 'true');
      return;
    }
    if (act === 'idle' || act === 'idle-back') {
      var box = el.closest('[data-idle]');
      box.querySelector('.idle-on').hidden = act === 'idle';
      box.querySelector('.idle-ok').hidden = act !== 'idle';
      return;
    }
    if (el.closest('.seg')) {
      el.parentNode.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b === el ? 'true' : 'false'); });
      return;
    }
    if (act === 'zoom' && dlg && dlg.showModal) {
      var fig = el.closest('.fig'), vp = fig.querySelector('.vp').cloneNode(true);
      vp.style.zoom = ''; vp.style.height = ''; vp.classList.remove('sc');
      var zb = dlg.querySelector('.zb'); zb.innerHTML = ''; zb.appendChild(vp);
      document.getElementById('zt').textContent = fig.dataset.t || '';
      dlg.showModal(); zb.scrollTop = 0;
      return;
    }
    if (act === 'zclose') { dlg.close(); return; }
  });
  if (dlg) dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });

  var links = Array.prototype.slice.call(document.querySelectorAll('.secnav a'));
  var secs = links.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
  function onScroll() {
    var cur = -1;
    secs.forEach(function (s, i) { if (s && s.getBoundingClientRect().top < 120) cur = i; });
    links.forEach(function (a, i) { a.classList.toggle('on', i === cur); });
    if (cur >= 0) { var a = links[cur], n = a.parentNode; if (a.offsetLeft < n.scrollLeft || a.offsetLeft + a.offsetWidth > n.scrollLeft + n.clientWidth) n.scrollLeft = a.offsetLeft - 16; }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
