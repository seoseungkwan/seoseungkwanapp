/* eslint-disable -- 승인 시안 기록(앱 코드 아님). 저장소 lint 경고를 늘리지 않게 끈다 */
// Scale each mockup from its design width (1440 / 390) to the column it sits in; add phone screen-length marks; zoom dialog.
(function () {
  var screens = Array.prototype.slice.call(document.querySelectorAll('.screen'))
  function folds(s) {
    if (!s.classList.contains('folds')) return
    var vp = s.firstElementChild
    Array.prototype.slice.call(vp.querySelectorAll('.fold')).forEach(function (f) { f.remove() })
    var h = vp.offsetHeight, n = Math.floor(h / 844)
    for (var i = 1; i <= n; i++) {
      var d = document.createElement('div')
      d.className = 'fold'; d.style.top = (i * 844) + 'px'
      d.innerHTML = '<span>' + i + '화면</span>'
      vp.appendChild(d)
    }
    var out = document.getElementById('landing-len')
    if (out) out.textContent = '점선 = 휴대폰 한 화면(844px). 개편 후 약 ' + (h / 844).toFixed(1) + '화면'
  }
  function fit() {
    screens.forEach(function (s) {
      var vp = s.firstElementChild, w = +s.getAttribute('data-w')
      var sc = s.clientWidth / w
      vp.style.transform = 'scale(' + sc + ')'
      s.style.setProperty('--inv', (1 / sc).toFixed(3))
      s.style.height = Math.ceil(vp.offsetHeight * sc) + 'px'
    })
  }
  function all() { screens.forEach(folds); fit() }
  all()
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(all)
  var t
  window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(fit, 60) })

  var dlg = document.getElementById('zoom'), body = dlg.querySelector('.zb'), title = document.getElementById('zt')
  function open(s) {
    var vp = s.firstElementChild.cloneNode(true)
    vp.style.transform = 'none'
    Array.prototype.slice.call(vp.querySelectorAll('.fold')).forEach(function (f) { f.remove() })
    body.innerHTML = ''
    body.appendChild(vp)
    title.textContent = s.getAttribute('data-label') + ' · 실제 크기'
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '')
    body.scrollTop = 0
  }
  screens.forEach(function (s) {
    s.addEventListener('click', function () { open(s) })
    s.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(s) } })
    var btn = s.parentNode.querySelector('.zoom-btn')
    if (btn) btn.addEventListener('click', function () { open(s) })
  })
  document.getElementById('zc').addEventListener('click', function () { dlg.close ? dlg.close() : dlg.removeAttribute('open') })
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close() })
})()
