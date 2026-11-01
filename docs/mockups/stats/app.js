/* 통계 탭 클릭 목업 (TASK-12). gen.py가 만든 index.html이 부른다.
   숫자는 index.html 안의 #stats-data(예시 자료)뿐이다. 브라우저 저장소·네트워크를 쓰지 않는다. */
(function () {
  'use strict';
  var DATA = JSON.parse(document.getElementById('stats-data').textContent);
  var IC = DATA.icons, TX = DATA.text;

  /* ---------- 그림 틀: 실제 폭으로 그리고 줄여 보이기 (ui-90 시안과 같다) ---------- */
  function fit() {
    document.querySelectorAll('.scr').forEach(function (s) {
      var vp = s.firstElementChild, w = +s.dataset.w, z = s.clientWidth / w;
      if (z > 0) vp.style.zoom = Math.min(1, z);
    });
  }
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(fit);
    document.querySelectorAll('.scr').forEach(function (s) { ro.observe(s); });
  }

  /* ---------- 작은 도구 ---------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fc(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function pct(v, max) { return max > 0 ? Math.min(100, Math.max(0, v / max * 100)).toFixed(2) : '0'; }
  function nice(max) {
    if (!(max > 0)) return { max: 0, ticks: [0] };
    var need = max / 4, S = [1, 2, 2.5, 5];
    for (var p = 1; ; p *= 10) for (var i = 0; i < 4; i++) { var s = S[i] * p; if (s >= need) return { max: s * 4, ticks: [0, s, s * 2, s * 3, s * 4] }; }
  }
  var HATCH = (function () {
    var d = '';
    for (var i = -480; i < 120; i += 4) d += 'M' + i + ' 480L' + (i + 480) + ' 0';
    return '<svg class="hatch" aria-hidden="true"><path d="' + d + '" stroke="currentColor" stroke-width="1" fill="none"/></svg>';
  })();
  function delta(d) {
    if (!d) return '<span class="dl none">–</span>';
    var a = d.dir === 'up' ? '▲' : d.dir === 'down' ? '▼' : '';
    return '<span class="dl ' + d.dir + '"><span class="nw">' + (a ? '<span aria-hidden="true">' + a + '</span> ' : '') + esc(d.text) + '</span>' +
      (d.sr ? '<span class="w">' + d.sr + '</span>' : '') + '</span>';
  }
  function head(t, s, btn) {
    return '<div class="ss-h"><h2 class="ss-t">' + t + '</h2>' + (s ? '<span class="ss-s">' + esc(s) + '</span>' : '') +
      (btn ? '<span class="ss-a">' + btn + '</span>' : '') + '</div>';
  }
  function dbtn(id, key) {
    return '<button type="button" class="tbtn dtb" data-act="detail" data-key="' + key + '" aria-expanded="false" aria-controls="' + id + '">' +
      '<span class="lbl">자세히</span>' + IC.chev + '</button>';
  }
  function dtable(id, cols, rows, cap) {
    var th = cols.map(function (c, i) { return '<th' + (i ? ' class="n"' : '') + ' scope="col">' + c + '</th>'; }).join('');
    var tb = rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + (i ? ' class="n"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('');
    return '<div class="dtw" id="' + id + '" hidden><table class="dt"><caption class="sr">' + esc(cap) + '</caption><thead><tr>' + th + '</tr></thead><tbody>' + tb + '</tbody></table></div>';
  }
  function legend(keys) {
    var L = { n: '신환', r: '재진', p: '비교 기간', h: '일부 기간', v: '환자 수' };
    return '<div class="lg" aria-hidden="true">' + keys.map(function (k) {
      return '<span><i class="' + (k === 'v' ? 'n' : k) + '">' + (k === 'h' ? HATCH : '') + '</i>' + L[k] + '</span>';
    }).join('') + '</div>';
  }
  function none(t) { return '<p class="none"><b>자료 없음</b> · ' + esc(t) + '</p>'; }
  var PART = ' <span class="chip chip-w">일부 기간</span>';

  /* 쌓은 막대: bars = [{l, v:[신환, 재진] 또는 [값], p: 일부 기간, pv: 비교 기간 값}] */
  function stacked(bars, o) {
    var max = 0;
    bars.forEach(function (b) { var t = b.v.reduce(function (a, x) { return a + x; }, 0); max = Math.max(max, t, b.pv || 0); });
    var sc = nice(max), last = -1;
    bars.forEach(function (b, i) { if (!b.p) last = i; });
    var grid = sc.ticks.map(function (t, i) { return '<div class="ch-g' + (i === 0 ? ' z' : '') + '" style="bottom:' + pct(t, sc.max) + '%"><span>' + fc(t) + '</span></div>'; }).join('');
    var cols = bars.map(function (b, i) {
      var tot = b.v.reduce(function (a, x) { return a + x; }, 0), h = pct(tot, sc.max);
      var top = o.totals ? '<span class="tt' + (i === last ? ' last' : '') + '">' + (b.p && bars.length <= 14 ? '일부 기간' : fc(tot)) + '</span>' : '';
      var seg = b.p ? '<span class="bar part" style="height:' + h + '%">' + HATCH + '</span>'
        : '<span class="bar" style="height:' + h + '%">' + b.v.map(function (x, k) { return '<i class="' + (k ? 'br' : 'bn') + '" style="flex-grow:' + x + '"></i>'; }).join('') + '</span>';
      var pv = o.prev ? '<span class="pv" style="height:' + (b.pv == null ? 0 : pct(b.pv, sc.max)) + '%"></span>' : '';
      return '<div class="col' + (o.prev ? ' two' : '') + '">' + pv + '<span class="stk">' + top + seg + '</span></div>';
    }).join('');
    var xl = bars.map(function (b) { return '<span>' + esc(b.l || '') + '</span>'; }).join('');
    return '<div class="ch' + (bars.length > 12 ? ' many' : '') + '" aria-hidden="true" style="--h:' + o.h + 'px;--hp:' + o.hp + 'px"><span class="ch-u">' + o.unit + '</span><div class="ch-a">' + grid +
      '<div class="ch-c">' + cols + '</div></div><div class="ch-x">' + xl + '</div></div>';
  }

  /* ---------- 섹션 그리기 (기간마다 다시 그린다) ---------- */
  var SLOTS = {
    range: function (P) {
      return '<span><b>' + esc(P.range) + '</b> (' + esc(P.rangeNote) + ')</span><span>비교: ' + esc(P.cmp) + ' (' + esc(P.cmpName) + ')</span>';
    },
    sum: function (P) {
      if (!P.sum) return head('기간 요약') + none('불러온 숫자에 이 기간 자료가 없어요.');
      var c = P.sum.cells.map(function (x) {
        var isD = Object.prototype.hasOwnProperty.call(x, 'd'), empty = isD ? !x.d : x.v === null;
        var v = empty ? '–' : isD ? delta(x.d) : esc(x.v);
        return '<div class="kpi"><p class="kpi-n">' + esc(x.n) + '</p><p class="kpi-v' + (empty ? ' no' : '') + '">' + v + '</p>' +
          '<p class="kpi-s">' + esc(x.sub) + (x.chip ? ' <span class="chip chip-w">' + esc(x.chip) + '</span>' : '') + '</p></div>';
      }).join('');
      return head('기간 요약', P.sum.desc) + '<div class="kpis st-k">' + c + '</div>' + (P.sum.note ? '<p class="d-note">' + esc(P.sum.note) + '</p>' : '');
    },
    trend: function (P, uid) {
      var T = P.trend;
      if (!T) return head('환자 수 추이') + none('불러온 숫자에 이 기간 자료가 없어요.');
      var id = uid + '-trend-t', anyP = T.bars.some(function (b) { return b.p; });
      var chart = stacked(T.bars.map(function (b) { return { l: b.l, v: [b.n, b.r], p: b.p }; }), { h: 200, hp: 140, unit: '(명)', totals: T.bars.length <= 31 });
      var rows = T.bars.map(function (b) { return [esc(b.t) + (b.p ? PART : ''), fc(b.n), fc(b.r), '<b>' + fc(b.n + b.r) + '</b>']; });
      return head('환자 수 추이', T.desc, dbtn(id, 'trend')) + legend(['n', 'r'].concat(anyP ? ['h'] : [])) + chart +
        (T.note ? '<p class="ch-n">' + esc(T.note) + '</p>' : '') + dtable(id, [T.first, '신환', '재진', '합계'], rows, '환자 수 추이 (명)');
    },
    rv: function (P, uid) {
      var R = P.rv;
      if (!R) return head('신환 재방문율', '처음 온 환자가 다시 온 비율') + none('불러오면 처음 온 환자가 7·14·30일 안에 다시 온 비율이 보여요.');
      var id = uid + '-rv-t';
      var rows = R.rows.map(function (r) {
        var val = r.k === 'rate' ? r.v : r.k === 'wip' ? '집계 중' : '–';
        return '<li><div class="rv-h"><span class="rv-n">' + r.n + '</span><span class="rv-v' + (r.k === 'rate' ? '' : ' no') + '">' + val + '</span></div>' +
          (r.k === 'rate' ? '<span class="ib" aria-hidden="true"><i style="width:' + r.w + '%"></i></span>' : '') + '<p class="rv-s">' + esc(r.sub) + '</p></li>';
      }).join('');
      var F = R.first, first;
      if (F) {
        first = '<h3 class="h3">첫 재방문까지 날수</h3><p class="rv-s">' + esc(F.base) + '</p><ul class="rk">' + F.items.map(function (x) {
          return '<li' + (x.last ? ' class="last"' : '') + '><span class="rk-n">' + x.n + '</span><span class="rk-b" aria-hidden="true"><i style="width:' + x.w + '%"></i></span>' +
            '<span class="rk-v"><b>' + x.v + '명</b><span>' + x.pct + '</span></span></li>';
        }).join('') + '</ul><p class="ch-n">' + esc(F.note) + '</p>';
      } else {
        first = '<h3 class="h3">첫 재방문까지 날수</h3><p class="none"><b>집계 중</b> · ' + esc(R.firstMsg) + '</p>';
      }
      var trs = R.rows.map(function (r) { return [r.n, r.k === 'rate' ? r.num + '명' : '–', r.k === 'rate' ? r.den + '명' : '–', r.k === 'rate' ? '<b>' + r.v + '</b>' : (r.k === 'wip' ? '집계 중' : '자료 없음')]; });
      if (F) F.items.forEach(function (x) { trs.push(['첫 재방문 ' + x.n, x.v + '명', F.total + '명', x.pct]); });
      return head('신환 재방문율', '처음 온 환자가 다시 온 비율', dbtn(id, 'rv')) + '<ul class="rv">' + rows + '</ul>' + first +
        dtable(id, ['구분', '다시 온 신환', '센 신환', '비율'], trs, '신환 재방문율');
    },
    rx: function (P, uid) {
      var X = P.rx;
      if (!X) return head('처방 추세') + none('불러오면 많이 낸 처방 5가지와 그 흐름이 보여요.');
      var hd = '<div class="rxh" aria-hidden="true"><span>처방</span><span class="n">' + esc(X.label) + '</span><span>' + esc(X.cmpName) + '보다</span><span>신환 · 재진</span><span></span></div>';
      var list = X.rows.map(function (r) {
        var id = uid + '-rx-' + r.code;
        return '<li><button type="button" class="rxr" data-act="rx" data-key="rx:' + r.code + '" aria-expanded="false" aria-controls="' + id + '">' +
          '<span class="rx-nm"><span class="rx-t">' + esc(r.name) + '</span><span class="ib" aria-hidden="true"><i style="width:' + r.w + '%"></i>' +
          (r.pw == null ? '' : '<b style="left:' + r.pw + '%"></b>') + '</span></span>' +
          '<span class="rx-c">' + r.cnt + '</span><span class="rx-d">' + delta(r.d) + '</span><span class="rx-s">신환 ' + r.nw + ' · 재진 ' + r.rt + '</span>' + IC.chev + '</button>' +
          '<div class="rxd" id="' + id + '" hidden>' + rxDetail(r, X, uid) + '</div></li>';
      }).join('');
      return head('처방 추세', '많이 낸 처방 5가지 · 건수') + hd + '<ul class="rxl">' + list + '</ul>' +
        '<p class="rx-note">줄을 누르면 그 처방의 ' + X.grainName + '별 건수와 신환·재진이 열려요. 막대 안 회색 눈금은 비교 기간 건수예요. 건 = 날마다 그 처방을 받은 환자 수를 더한 값이에요.</p>' +
        '<p class="rx-money">금액·소모량은 매출 탭에서 볼 수 있어요</p>';
    },
    split: function (P, uid, bit) {
      if (!bit) return head('처방별 신환·재진', '처방마다 서로 다른 환자 수') +
        '<p class="none"><b>비트 PC에서 불러오면 보여요</b> · 진료 줄은 서버에 저장하지 않아서, 비트 PC에서 불러온 화면에서만 볼 수 있어요.</p>';
      var S = P.split;
      if (!S) return head('처방별 신환·재진') + none('이 기간에 불러온 진료 줄이 없어요.');
      var id = uid + '-sp', n = S.lines.length;
      var rows = S.lines.map(function (l, i) {
        return '<tr' + (i >= 10 ? ' data-more hidden' : '') + '><td>' + esc(l.name) + '</td><td class="n">' + l.nw + '</td><td class="n">' + l.rt + '</td><td class="n"><b>' + l.tot + '</b></td></tr>';
      }).join('');
      return head('처방별 신환·재진', '처방마다 서로 다른 환자 수') + '<p class="sp-h">' + esc(S.head) + '</p>' +
        '<div class="spw" id="' + id + '"><table class="dt"><caption class="sr">처방별 신환·재진 (명)</caption><thead><tr><th scope="col">처방</th><th class="n" scope="col">신환</th><th class="n" scope="col">재진</th><th class="n" scope="col">합계</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<div class="sp-a">' + (n > 10 ? '<button type="button" class="tbtn" data-act="more" data-n="' + n + '" aria-expanded="false" aria-controls="' + id + '">모두 보기 (' + n + '개)</button>' : '<span></span>') +
        '<button type="button" class="btn btn-sec btn-sm cpy" data-act="copy">' + IC.copy + '<span>표 복사</span></button></div>' +
        '<p class="ch-n">명 = 그 기간에 그 처방을 받은 서로 다른 환자 수예요. 합계가 큰 차례예요.</p>';
    },
    wk: function (P, uid) {
      var W = P.wk;
      if (!W) return head('요일별 환자 수') + none('불러오면 요일마다 하루 평균 환자 수가 보여요.');
      var id = uid + '-wk-t', anyP = W.bars.some(function (b) { return b.p; });
      var chart = stacked(W.bars.map(function (b) { return { l: b.l, v: [b.v], p: b.p }; }), { h: 150, hp: 110, unit: '(명)', totals: true });
      var rows = W.bars.map(function (b) { return [esc(b.t) + (b.p ? PART : ''), '<b>' + fc(b.v) + '명</b>', b.days + '일']; });
      return head('요일별 환자 수', '하루 평균, 요일마다', dbtn(id, 'wk')) + (anyP ? legend(['v', 'h']) : '') + chart + '<p class="ch-n">' + esc(W.note) + '</p>' +
        dtable(id, ['요일', '하루 평균', '자료 있는 날'], rows, '요일별 환자 수');
    }
  };
  function rxDetail(r, X, uid) {
    var id = uid + '-rxt-' + r.code, anyP = r.pts.some(function (p) { return p.p; });
    var bars = r.pts.map(function (p) { return { l: p.l, v: [p.n, p.r], p: p.p, pv: p.pv }; });
    var rows = r.pts.map(function (p) { return [esc(p.t) + (p.p ? PART : ''), '<b>' + fc(p.n + p.r) + '건</b>', fc(p.n), fc(p.r), p.pv == null ? '–' : fc(p.pv) + '건']; });
    return '<div class="rxd-h"><p class="rxd-t">' + esc(r.name) + ' · ' + X.grainName + '별 건수</p>' + legend(['n', 'r', 'p'].concat(anyP ? ['h'] : [])) + '</div>' +
      stacked(bars, { h: 160, hp: 120, unit: '(건)', totals: bars.length <= 16, prev: true }) + '<p class="ch-n">' + esc(X.note) + '</p>' +
      '<div>' + dbtn(id, 'rxt:' + r.code) + '</div>' +
      dtable(id, [X.grainName === '일' ? '날짜' : X.grainName, '건수', '신환', '재진', esc(X.cmpName)], rows, r.name + ' ' + X.grainName + '별 건수');
  }

  function render(ui) {
    var set = DATA.sets[ui.dataset.ds || 'main'], P = set[ui.dataset.per || '30d'], uid = ui.dataset.uid, bit = ui.dataset.bit === '1';
    ui.querySelectorAll('[data-slot]').forEach(function (el) { el.innerHTML = SLOTS[el.dataset.slot](P, uid, bit); });
    opened(ui).forEach(function (key) {
      var b = ui.querySelector('[data-key="' + key + '"]');
      if (b) setOpen(b, ui, true);
    });
  }
  function opened(ui) {
    if (!ui._open) ui._open = (ui.dataset.open || '').split(',').filter(Boolean);
    return ui._open;
  }
  function setOpen(btn, ui, on) {
    btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    var t = ui.querySelector('[id="' + btn.getAttribute('aria-controls') + '"]');
    if (t) t.hidden = !on;
    var l = btn.querySelector('.lbl');
    if (l) l.textContent = on ? '접기' : '자세히';
    var list = opened(ui), key = btn.dataset.key, i = list.indexOf(key);
    if (on && i < 0) list.push(key);
    if (!on && i >= 0) list.splice(i, 1);
  }

  /* ---------- 화면 상태 ---------- */
  var timers = new WeakMap();
  function later(ui, fn, ms) { clearTimeout(timers.get(ui)); timers.set(ui, setTimeout(fn, ms)); }
  function setSt(ui, st) {
    ui.dataset.st = st;
    var busy = st === 'loading' || st === 'loading0';
    ui.querySelectorAll('[data-act=load]').forEach(function (b) {
      if (busy) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
      b.querySelector('.lbl').textContent = busy ? '불러오는 중' : '비트에서 불러오기';
    });
  }
  function afterLoad(ui) {
    setSt(ui, 'loaded');
    ui.dataset.bit = '1';
    render(ui);
    var on = ui.querySelector('[data-act=tdone]');
    var s = ui.querySelector('[data-srcl]'), c = ui.querySelector('[data-cov]');
    if (s) s.textContent = TX.srcNow;
    if (c) c.textContent = on && on.checked ? TX.covOn : TX.covOff;
  }

  /* ---------- 고르기 (시안 쪽: 화면·폭·상태) ---------- */
  function pick(btn) {
    var box = btn.closest('[data-pick]'), g = box.dataset.pick, v = btn.dataset.v;
    box.querySelectorAll('button[data-v]').forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
    document.querySelectorAll('[data-pane-of="' + g + '"]').forEach(function (p) { p.hidden = p.dataset.pane !== v; });
    if (g === 'scr') {
      try { history.replaceState(null, '', '#' + v); } catch (err) { /* 주소는 그대로 둔다 */ }
      var sec = document.getElementById(v), nav = document.querySelector('.secnav');
      if (sec && nav) { var top = sec.getBoundingClientRect().top + window.scrollY - nav.offsetHeight; if (window.scrollY > top) window.scrollTo(0, top); }
    }
    fit();
  }

  var dlg = document.getElementById('zoom');
  document.addEventListener('click', function (e) {
    var pb = e.target.closest('[data-pick] button[data-v]');
    if (pb) { pick(pb); return; }
    var el = e.target.closest('button, a');
    if (!el) {
      document.querySelectorAll('.acct-w.open').forEach(function (w) { w.classList.remove('open'); w.querySelector('[data-act=acct]').setAttribute('aria-expanded', 'false'); });
      return;
    }
    var act = el.dataset.act, ui = el.closest('.ui');
    if (el.tagName === 'A') e.preventDefault();
    if (act === 'zoom' && dlg && dlg.showModal) {
      var fig = el.closest('.fig'), vp = fig.querySelector('.vp').cloneNode(true);
      vp.style.zoom = ''; vp.style.height = ''; vp.classList.remove('sc');
      var zb = dlg.querySelector('.zb'); zb.innerHTML = ''; zb.appendChild(vp);
      document.getElementById('zt').textContent = fig.dataset.t || '';
      dlg.showModal(); zb.scrollTop = 0;
      return;
    }
    if (act === 'zclose') { dlg.close(); return; }
    if (!ui) return;
    if (el.getAttribute('aria-disabled') === 'true') return;
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
    if (el.dataset.per) {
      el.parentNode.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b === el ? 'true' : 'false'); });
      ui.dataset.per = el.dataset.per;
      render(ui);
      return;
    }
    if (el.dataset.rep) {
      el.parentNode.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b === el ? 'true' : 'false'); });
      var sec = el.closest('.ss'), ok = true;
      sec.querySelectorAll('[data-rp]').forEach(function (r) { var me = r.dataset.rp === el.dataset.rep; r.hidden = !me; if (me) ok = r.dataset.ok === '1'; });
      var cp = sec.querySelector('[data-act=copy]');
      if (ok) cp.removeAttribute('aria-disabled'); else cp.setAttribute('aria-disabled', 'true');
      return;
    }
    if (act === 'detail' || act === 'rx') { setOpen(el, ui, el.getAttribute('aria-expanded') !== 'true'); return; }
    if (act === 'more') {
      var open = el.getAttribute('aria-expanded') !== 'true', tb = ui.querySelector('[id="' + el.getAttribute('aria-controls') + '"]');
      tb.querySelectorAll('[data-more]').forEach(function (r) { r.hidden = !open; });
      el.setAttribute('aria-expanded', open ? 'true' : 'false');
      el.textContent = open ? '10개만 보기' : '모두 보기 (' + el.dataset.n + '개)';
      return;
    }
    if (act === 'copy') {   // 시안: 글을 실제로 복사하지 않고 "복사했어요"만 2초 보인다
      if (!el._label) el._label = el.innerHTML;
      el.innerHTML = '<span class="ok">' + IC.check + '</span><span>복사했어요</span>';
      clearTimeout(el._t);
      el._t = setTimeout(function () { el.innerHTML = el._label; }, 2000);
      return;
    }
    if (act === 'load') {
      setSt(ui, ui.dataset.st === 'empty' ? 'loading0' : 'loading');
      later(ui, function () { afterLoad(ui); }, 1600);
      return;
    }
    if (act === 'resave') {
      el.setAttribute('aria-disabled', 'true'); el.querySelector('.lbl').textContent = '저장하는 중';
      later(ui, function () {
        el.removeAttribute('aria-disabled'); el.querySelector('.lbl').textContent = '다시 저장';
        afterLoad(ui);
      }, 1200);
      return;
    }
    if (act === 'reread') {
      setSt(ui, 'reading');
      later(ui, function () { setSt(ui, 'loaded'); render(ui); }, 1200);
      return;
    }
    if (act === 'file') {
      var m = ui.querySelector('[data-filemsg]');
      if (m) { m.hidden = false; later(m, function () { m.hidden = true; }, 4000); }
      return;
    }
  });
  document.addEventListener('change', function (e) {
    if (!e.target.matches('[data-act=tdone]')) return;
    var ui = e.target.closest('.ui'), on = e.target.checked;
    ui.querySelectorAll('[data-tf]').forEach(function (p) { p.hidden = p.dataset.tf !== (on ? 'on' : 'off'); });
  });
  if (dlg) dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });

  /* ---------- 처음 그리기 ---------- */
  document.querySelectorAll('.ui[data-stats]').forEach(function (ui) { render(ui); setSt(ui, ui.dataset.st); });
  function fromHash() {
    var h = location.hash.slice(1), hb = h && document.querySelector('[data-pick=scr] button[data-v="' + h + '"]');
    if (hb && hb.getAttribute('aria-pressed') !== 'true') pick(hb);
  }
  window.addEventListener('hashchange', fromHash);
  fromHash();
  fit();
})();
