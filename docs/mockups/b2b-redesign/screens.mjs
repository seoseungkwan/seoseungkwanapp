// Mockup screens at design width (PC 1440, phone 390). Everything is the target system; numbers are 예시.
import { icon, tri, logo, gmark, barsChart, spark, revisitChart, rxBar, regionsChart, KPI, RX, RISING, FALLING, appHeader, tabBar } from './parts.mjs'

const pin = (n, style = '') => `<i class="pin" style="${style}">${n}</i>`

// ── KPI strip
function kpiCell(k, { phone = false, empty = false } = {}) {
  if (empty) {
    return `<div class="kpi"><div class="kpi-top"><span class="t-small muted">${k.label}</span></div><div class="metric num muted2">–</div><div class="t-small muted">자료 없음</div></div>`
  }
  return `<div class="kpi"><div class="kpi-top"><span class="t-small muted">${k.label}</span>${spark(k.spark, phone ? { w: 56, h: 22 } : { w: 88, h: 28 })}</div>
  <div class="metric num">${k.value}<span class="unit">${k.unit}</span></div>
  <div class="t-small delta pos">${tri('up')}<span class="num">${k.diff}${k.pct ? ` (${k.pct})` : ''}</span>${phone ? '' : '<span class="muted">그 전 주 대비</span>'}</div></div>`
}
const kpiStrip = (o = {}) => `<div class="panel kpis${o.phone ? ' ph' : ''}">${KPI.map((k) => kpiCell(k, o)).join('')}</div>`

// ── Landing hero preview / login visual: a mini dashboard built from the same parts (예시)
export function preview(w, { phone = false } = {}) {
  const inner = w - 2
  const tabs = phone ? ['대시보드', '통계', 'AI 리포트', '매출'] : ['대시보드', '통계', 'AI 리포트', '매출', '재고', '급여']
  const kp = phone ? KPI : KPI
  return `<div class="pv" style="width:${w}px">
  <div class="pv-top row sb"><div class="row g8">${logo(18)}<span class="t-small strong">예시정형외과의원</span></div><span class="chip chip-accent">예시 숫자</span></div>
  <div class="pv-tabs">${tabs.map((t, i) => `<span class="${i ? 'off' : 'on'}">${t}</span>`).join('')}</div>
  <div class="pv-kpis${phone ? ' ph' : ''}">${kp.map((k) => `<div class="pv-k"><div class="row sb"><span class="t-caption muted">${k.label}</span>${phone ? '' : spark(k.spark, { w: 56, h: 22 })}</div><div class="pv-v num">${k.value}<span class="unit">${k.unit}</span></div><div class="t-caption delta pos">${tri('up')}<span class="num">${k.pct || k.diff}</span></div></div>`).join('')}</div>
  <div class="pv-chart"><div class="row sb pv-ch"><span class="t-small strong">주별 환자 수</span><span class="legend t-caption"><i class="sw sw-new"></i>신환<i class="sw sw-ret"></i>재진<i class="sw sw-hatch"></i>집계 중</span></div>
  ${barsChart({ w: inner - 32, h: phone ? 190 : 230, compact: true })}</div>
</div>`
}

// ═════════ LANDING
export function landingPC() {
  return `<div class="ui lp">
<header class="l-hdr"><div class="wrap-l row sb"><div class="row g32">${logo(24)}<nav class="l-nav"><a>AI 분석</a><a>기능</a><a>개인정보 보호</a><a>시작 방법</a></nav></div><span class="btn btn-primary">구글로 시작하기</span></div></header>

<section class="l-hero"><div class="wrap-l grid12">
  <div class="c1-5 hero-txt">
    <p class="t-small strong ink2">통증 의원 관리자를 위한 AI 업무 도구</p>
    <h1 class="t-display rel">숫자로 보는 우리 의원${pin(1, 'left:calc(-26px*var(--inv,1))')}</h1>
    <p class="t-lead ink2">환자 통계, 급여·인센티브, 매출·재고, 일일마감과 원장님 보고까지 한 화면에서. 이번 달 숫자는 AI가 읽고 근거와 함께 설명합니다.</p>
    <div class="row g8"><span class="btn btn-primary btn-lg">구글로 시작하기</span><span class="btn btn-secondary btn-lg">AI 분석 보기</span></div>
    <ul class="promises">
      <li>${icon('shield')}<span>환자 개인정보 서버 전송 <b class="num">0건</b></span></li>
      <li>${icon('monitor')}<span>환자 파일은 브라우저 안에서만 계산</span></li>
      <li>${icon('sigma')}<span>AI에는 합계 숫자만</span></li>
    </ul>
  </div>
  <div class="c6-12 rel">${preview(690)}${pin(2, 'top:calc(-9px*var(--inv,1));right:calc(-9px*var(--inv,1));left:auto')}</div>
</div></section>

<section class="l-sec band" id="ai"><div class="wrap-l grid12">
  <div class="c1-4">
    <h2 class="t-heading">버튼 한 번이면 AI가 이번 달을 읽어 줍니다</h2>
    <p class="ink2 mt12">숫자를 늘어놓는 데서 끝나지 않습니다. 무엇이 달라졌는지, 왜 그런지, 다음 달 무엇을 봐야 하는지 말로 정리합니다.</p>
    <dl class="plist mt32 rel">${pin(3)}
      <div><dt>근거 숫자와 함께</dt><dd>모든 문장에 어떤 숫자를 보고 말했는지 붙입니다.</dd></div>
      <div><dt>짐작은 추정이라고</dt><dd>원인을 짐작할 때는 추정이라고 분명히 밝힙니다.</dd></div>
      <div><dt>이어서 채팅으로 질문</dt><dd>리포트를 보다가 궁금한 점을 바로 물어봅니다.</dd></div>
      <div><dt>환자 정보 없이</dt><dd>AI에는 합계 숫자만 보내고, 채팅 기록은 저장하지 않습니다.</dd></div>
    </dl>
  </div>
  <div class="c5-12"><div class="panel report">
    <div class="panel-h"><span class="t-subtitle">10월 AI 리포트</span><span class="chip">방금 생성 · 예시</span></div>
    <div class="report-b">
      <ol class="r-items">
        <li><span class="chip chip-pos">늘었어요</span><div><p>신환이 지난달보다 늘었습니다.</p><p class="t-small muted num">근거 · 신환 9월 486명 → 10월 524명</p></div></li>
        <li><span class="chip chip-warn">살펴볼 것</span><div><p>인건비율이 지난달보다 올랐습니다.</p><p class="t-small muted">근거 · 인건비 총액 ÷ 매출</p></div></li>
        <li><span class="chip">추정</span><div><p>도수치료 증가는 신환 증가와 함께 움직인 것으로 보입니다.</p><p class="t-small muted num">근거 · 처방 그룹 ‘도수’ 9월 312건 → 10월 356건</p></div></li>
      </ol>
      <div class="chat">
        <p class="bubble">다음 달엔 뭘 보면 좋을까?</p>
        <p class="t-small muted">AI가 답을 쓰는 중…</p>
        <div class="row g8 fw"><span class="chip">재방문율이 낮은 처방은?</span><span class="chip">인건비율 괜찮아?</span></div>
        <div class="input row sb"><span class="muted">AI에게 물어보기</span><span class="send">${icon('arrow', 14)}</span></div>
      </div>
    </div>
  </div></div>
</div></section>

<section class="l-sec" id="ortho"><div class="wrap-l">
  <div class="grid12 head-split"><h2 class="t-heading c1-6">정형외과·통증 의원을 위해 만들었습니다</h2><p class="ink2 c7-11">척추·관절 환자 흐름, 도수·물리치료 처방, 치료사 생산성까지. 정형외과에서 매일 보는 숫자에 맞췄습니다.</p></div>
  <table class="cmp mt32">
    <thead><tr><th class="rel">${pin(4, 'top:calc(-2px*var(--inv,1))')}</th><th>주사</th><th>물리치료</th><th>비급여</th><th>월말 보고</th></tr></thead>
    <tbody>
      <tr><th>보는 숫자</th><td>주사 치료 수와 F/U</td><td>물리치료 내원 환자 수</td><td>비급여 치료 내역</td><td>한 장으로 받는 월간 보고</td></tr>
      <tr><th>기준</th><td>이번 달</td><td>오늘</td><td>이번 달</td><td>10월</td></tr>
      <tr><th>예시</th><td><span class="kv"><span>주사 치료</span><b class="num">142건</b></span><span class="kv"><span>F/U</span><b class="num">37건</b></span></td><td><span class="kv"><span>오전</span><b class="num">21명</b></span><span class="kv"><span>오후</span><b class="num">17명</b></span></td><td><span class="kv"><span>도수치료</span><b class="num">86건</b></span><span class="kv"><span>체외충격파</span><b class="num">31건</b></span></td><td><span class="kv"><span>보고서</span><b class="num">PDF 1장</b></span><span class="kv"><span>AI 분석</span><b>포함</b></span></td></tr>
    </tbody>
  </table>
</div></section>

<section class="l-sec" id="features"><div class="wrap-l">
  <h2 class="t-heading w-6">매일 하던 일, 이제 숫자가 알아서 움직입니다</h2>
  <div class="grid12 mt32">
    <div class="c1-6">
      <p class="t-small strong accent">02 · 급여·인센티브</p>
      <h3 class="t-title mt8">월 실적만 넣으면 급여 계산이 끝납니다</h3>
      <p class="ink2 mt8">직원별 인센티브 규칙을 한 번 정해 두면, 월 실적으로 급여를 계산하고 확정합니다. 세무사 전달표와 인건비율·치료사 생산성도 함께 나옵니다.</p>
      <div class="panel mt24">
        <div class="panel-h"><span class="t-subtitle">10월 급여 <span class="t-small muted">예시</span></span><span class="chip chip-pos">${icon('check', 12)}10월 확정됨</span></div>
        <table class="tbl mt12"><thead><tr><th>직원</th><th>직종</th><th class="r">인센티브</th><th class="r">합계</th></tr></thead>
        <tbody><tr><td>직원 1</td><td>물리치료사</td><td class="r num">420,000원</td><td class="r num">3,120,000원</td></tr>
        <tr><td>직원 2</td><td>도수치료사</td><td class="r num">680,000원</td><td class="r num">3,480,000원</td></tr>
        <tr><td>직원 3</td><td>간호조무사</td><td class="r num">120,000원</td><td class="r num">2,510,000원</td></tr>
        <tr><td>직원 4</td><td>방사선사</td><td class="r num">150,000원</td><td class="r num">2,890,000원</td></tr></tbody>
        <tfoot><tr><td colspan="3">합계 4명</td><td class="r num">12,000,000원</td></tr></tfoot></table>
      </div>
    </div>
    <ol class="flist c8-12">
      <li><span class="num">01</span><div><h3>환자 통계</h3><p>EMR에서 내려받은 통계 파일을 올리면 신환율·재진율, 7일·14일 재방문, 처방 그룹별 환자 수가 바로 계산됩니다.</p></div></li>
      <li><span class="num">03</span><div><h3>매출·재고</h3><p>매출 흐름을 보고, 재고가 떨어지면 대시보드에 발주 알림을 띄웁니다.</p></div></li>
      <li><span class="num">04</span><div><h3>일일마감·보고</h3><p>일일마감, 일일보고, 월말보고를 정해진 양식에 맞춰 빠르게 씁니다.</p></div></li>
      <li><span class="num">05</span><div><h3>원장님 월간 보고</h3><p>월말보고·통계 그래프·AI 분석을 한 장에 모아 PDF로 저장합니다.</p></div></li>
    </ol>
  </div>
</div></section>

<section class="l-sec band" id="privacy"><div class="wrap-l">
  <div class="grid12">
    <div class="c1-8"><h2 class="t-heading">환자 개인정보는 절대 병원 PC 밖으로 나가지 않습니다</h2><p class="ink2 mt12 w-7">환자 이름·주민번호·차트번호는 서버에도, AI에도 가지 않습니다. 처음부터 그렇게 설계했습니다.</p></div>
    <div class="c10-12 zero"><div class="t-display num">0<span class="unit-l">건</span></div><p class="t-small muted">서버와 AI로 보내는 환자 개인정보</p></div>
  </div>
  <div class="flow mt32">
    <div class="node"><p class="row g8 t-subtitle">${icon('monitor')}병원 PC · 브라우저</p><p class="ink2">환자 파일을 여기서만 열고 계산합니다.</p><p class="stopline">${icon('stop', 14)}<span><b>여기서 멈춤</b><span class="blk">환자 이름·주민번호·차트번호·파일 이름</span></span></p></div>
    <div class="edge"><span class="t-caption">합계 숫자만</span>${icon('arrow')}</div>
    <div class="node"><p class="row g8 t-subtitle">${icon('server')}서버</p><p class="ink2">통계·매출 합계만 저장합니다. 원본 파일은 올라가지 않습니다.</p></div>
    <div class="edge"><span class="t-caption">집계만</span>${icon('arrow')}</div>
    <div class="node"><p class="row g8 t-subtitle">${icon('doc')}AI 분석</p><p class="ink2">서버가 꺼낸 합계 숫자로만 리포트를 씁니다.</p></div>
  </div>
  <dl class="plist two mt32">
    <div><dt>필요한 칸만 읽습니다</dt><dd>계산에 쓰는 칸을 정해 두고 그 칸만 읽습니다. 차트번호는 계산하는 동안 메모리 안에서만 씁니다.</dd></div>
    <div><dt>주민번호가 보이면 멈춥니다</dt><dd>‘-’ 없이 붙여 쓴 13자리까지 잡아서, 섞여 있으면 계산하지 않고 알려 줍니다.</dd></div>
    <div><dt>AI에는 합계 숫자만</dt><dd>통계·매출 합계와 인건비 총액만 보냅니다. 직원 이름·개인별 급여도 보내지 않습니다.</dd></div>
    <div><dt>승인한 사람만, 공용 PC도 안심</dt><dd>구글 로그인 뒤 관리자가 승인한 계정만 들어옵니다. 30분 동안 움직임이 없으면 자동으로 로그아웃합니다.</dd></div>
  </dl>
</div></section>

<section class="l-sec" id="how"><div class="wrap-l grid12">
  <div class="c1-5"><h2 class="t-heading">시작은 3단계면 충분합니다</h2><p class="ink2 mt12">처음이면 가입 신청 후 관리자 승인을 받습니다.</p><span class="btn btn-primary btn-lg mt24">구글로 시작하기</span></div>
  <ol class="steps c7-12">
    <li><span class="sn num">1</span><div><h3>구글로 시작하기</h3><p>쓰던 구글 계정으로 로그인합니다. 새 비밀번호를 만들 필요가 없습니다.</p></div></li>
    <li><span class="sn num">2</span><div><h3>가입 신청</h3><p>처음 한 번만 의원 이름을 적어 신청합니다.</p></div></li>
    <li><span class="sn num">3</span><div><h3>승인 후 바로 사용</h3><p>관리자가 승인하면 대시보드가 열립니다.</p></div></li>
  </ol>
</div></section>

<footer class="l-foot"><div class="wrap-l row sb"><div class="row g8">${logo(18)}<span class="t-caption muted">통증 의원 관리자를 위한 AI 업무 도구</span></div><span class="t-caption muted num">© 2026</span></div></footer>
</div>`
}

export function landingPhone() {
  return `<div class="ui lp ph">
<header class="l-hdr ph"><div class="row sb">${logo(24)}<span class="btn btn-primary btn-sm">구글로 시작하기</span></div></header>
<section class="l-hero ph">
  <p class="t-small strong ink2">통증 의원 관리자를 위한 AI 업무 도구</p>
  <h1 class="t-display-m">숫자로 보는 우리 의원</h1>
  <p class="ink2">환자 통계, 급여·인센티브, 매출·재고, 일일마감과 원장님 보고까지 한 화면에서. 이번 달 숫자는 AI가 읽고 근거와 함께 설명합니다.</p>
  <span class="btn btn-primary btn-lg full">구글로 시작하기</span>
  <p class="row g8 t-small muted">${icon('shield', 14)}환자 개인정보는 병원 PC 밖으로 나가지 않습니다</p>
  ${preview(358, { phone: true })}
</section>
<section class="l-sec ph band">
  <h2 class="t-heading-m">버튼 한 번이면 AI가 이번 달을 읽어 줍니다</h2>
  <div class="panel report ph mt16">
    <div class="panel-h"><span class="t-subtitle">10월 AI 리포트</span><span class="chip">예시</span></div>
    <ol class="r-items ph">
      <li><span class="chip chip-pos">늘었어요</span><div><p>신환이 지난달보다 늘었습니다.</p><p class="t-small muted num">근거 · 신환 9월 486명 → 10월 524명</p></div></li>
      <li><span class="chip chip-warn">살펴볼 것</span><div><p>인건비율이 지난달보다 올랐습니다.</p><p class="t-small muted">근거 · 인건비 총액 ÷ 매출</p></div></li>
      <li><span class="chip">추정</span><div><p>도수치료 증가는 신환 증가와 함께 움직인 것으로 보입니다.</p></div></li>
    </ol>
  </div>
  <ul class="mini mt16"><li>근거 숫자와 함께</li><li>짐작은 추정이라고</li><li>이어서 채팅으로 질문</li><li>환자 정보 없이</li></ul>
</section>
<section class="l-sec ph">
  <h2 class="t-heading-m">정형외과·통증 의원을 위해 만들었습니다</h2>
  <table class="cmp ph mt16"><caption class="t-caption muted">예시 값</caption>
    <tr><th>주사<span>이번 달</span></th><td><span class="kv"><span>주사 치료</span><b class="num">142건</b></span><span class="kv"><span>F/U</span><b class="num">37건</b></span></td></tr>
    <tr><th>물리치료<span>오늘</span></th><td><span class="kv"><span>오전</span><b class="num">21명</b></span><span class="kv"><span>오후</span><b class="num">17명</b></span></td></tr>
    <tr><th>비급여<span>이번 달</span></th><td><span class="kv"><span>도수치료</span><b class="num">86건</b></span><span class="kv"><span>체외충격파</span><b class="num">31건</b></span></td></tr>
    <tr><th>월말 보고<span>10월</span></th><td><span class="kv"><span>보고서</span><b class="num">PDF 1장</b></span><span class="kv"><span>AI 분석</span><b>포함</b></span></td></tr>
  </table>
  <h2 class="t-heading-m mt48">매일 하던 일, 이제 숫자가 알아서 움직입니다</h2>
  <ol class="flist ph mt16">
    <li><span class="num">01</span><div><h3>환자 통계</h3><p>통계 파일을 올리면 신환율·재진율, 재방문이 바로 계산됩니다.</p></div></li>
    <li><span class="num">02</span><div><h3>급여·인센티브</h3><p>월 실적만 넣으면 급여 계산이 끝납니다.</p></div></li>
    <li><span class="num">03</span><div><h3>매출·재고</h3><p>재고가 떨어지면 발주 알림을 띄웁니다.</p></div></li>
    <li><span class="num">04</span><div><h3>일일마감·보고</h3><p>정해진 양식에 맞춰 빠르게 씁니다.</p></div></li>
    <li><span class="num">05</span><div><h3>원장님 월간 보고</h3><p>한 장에 모아 PDF로 저장합니다.</p></div></li>
  </ol>
</section>
<section class="l-sec ph band">
  <h2 class="t-heading-m">환자 개인정보는 절대 병원 PC 밖으로 나가지 않습니다</h2>
  <div class="zero ph mt16"><div class="t-display-m num">0<span class="unit-l">건</span></div><p class="t-small muted">서버와 AI로 보내는 환자 개인정보</p></div>
  <div class="flow ph mt16">
    <div class="node"><p class="row g8 t-subtitle">${icon('monitor')}병원 PC · 브라우저</p><p class="stopline">${icon('stop', 14)}환자 이름 · 주민번호 · 차트번호는 여기서 멈춤</p></div>
    <div class="edge">${icon('arrowDown')}<span class="t-caption">합계 숫자만</span></div>
    <div class="node"><p class="row g8 t-subtitle">${icon('server')}서버</p></div>
    <div class="edge">${icon('arrowDown')}<span class="t-caption">집계만</span></div>
    <div class="node"><p class="row g8 t-subtitle">${icon('doc')}AI 분석</p></div>
  </div>
</section>
<section class="l-sec ph">
  <h2 class="t-heading-m">시작은 3단계면 충분합니다</h2>
  <ol class="steps ph mt16">
    <li><span class="sn num">1</span><div><h3>구글로 시작하기</h3></div></li>
    <li><span class="sn num">2</span><div><h3>가입 신청</h3></div></li>
    <li><span class="sn num">3</span><div><h3>승인 후 바로 사용</h3></div></li>
  </ol>
  <span class="btn btn-primary btn-lg full mt24">구글로 시작하기</span>
</section>
<footer class="l-foot ph"><div class="row sb"><div class="row g8">${logo(18)}<span class="t-caption muted">통증 의원 관리자를 위한 AI 업무 도구</span></div><span class="t-caption muted num">© 2026</span></div></footer>
</div>`
}

// ═════════ LOGIN
const loginForm = (phone) => `<div class="auth-form${phone ? ' ph' : ''}">
  <h1 class="${phone ? 't-heading-m' : 't-heading'}">로그인</h1>
  <p class="ink2 mt8">구글 계정으로 로그인합니다. 처음이면 가입 신청으로 이어집니다.</p>
  <span class="btn btn-google btn-lg full mt24 rel">${gmark(18)}<span>구글로 시작하기</span>${phone ? '' : pin(3, 'left:auto;right:calc(-9px*var(--inv,1))')}</span>
  <div class="note-row mt24">${icon('shield', 16)}<div><p class="strong t-small">환자 개인정보는 병원 PC 밖으로 나가지 않습니다</p><p class="t-small muted">환자 파일은 이 브라우저 안에서만 읽고, 서버에는 집계 숫자만 저장합니다.</p></div></div>
  <p class="t-caption muted mt16">처음 가입하면 관리자가 승인한 뒤부터 쓸 수 있습니다.</p>
</div>`
export function loginPC() {
  return `<div class="ui auth-split" style="height:900px">
  <div class="pane-l"><div class="pane-in">
    <div class="rel">${logo(28)}${pin(1, 'left:calc(36px)')}</div>
    <div class="pane-mid rel">${pin(2, 'left:calc(-26px*var(--inv,1));top:4px')}${loginForm(false)}</div>
    <p class="t-caption muted">통증 의원 관리자를 위한 AI 업무 도구</p>
  </div></div>
  <div class="pane-r"><div class="pane-r-in"><p class="t-small ink2 w-pv">로그인하면 우리 의원의 오늘 숫자, AI 리포트, 급여와 보고를 한 곳에서 이어서 봅니다.</p>${preview(560)}</div></div>
</div>`
}
export function loginPhone() {
  return `<div class="ui auth-ph" style="min-height:844px"><div class="auth-top ph">${logo(24)}</div>${loginForm(true)}</div>`
}

// ═════════ SIGNUP / PENDING / REJECTED (one 480 column; top row aligned to it)
const stepper = (cur) => {
  const s = [['구글 로그인'], ['가입 신청'], ['관리자 승인']]
  return `<ol class="stepper">${s.map(([t], i) => {
    const n = i + 1, st = n < cur ? 'done' : n === cur ? 'now' : 'next'
    return `<li class="${st}"><span class="sq num">${st === 'done' ? icon('check', 12) : n}</span><span>${t}</span></li>`
  }).join('<li class="ln" aria-hidden="true"></li>')}</ol>`
}
const authTop = (out, p) => `<div class="auth-top"><div class="rel">${logo(28)}${p || ''}</div>${out ? '<span class="btn btn-ghost btn-sm">로그아웃</span>' : ''}</div>`
const field = (label, req, inner, help = '') => `<div class="field"><label>${label}<span class="t-caption muted">${req}</span></label>${inner}${help ? `<p class="t-caption muted">${help}</p>` : ''}</div>`
export function signupBody(phone = false, pins = false) {
  return `<div class="col480${phone ? ' ph' : ''}">${authTop(false)}
  <div class="rel">${stepper(2)}${pins ? pin(2, 'left:calc(-26px*var(--inv,1));top:2px') : ''}</div>
  <h1 class="${phone ? 't-heading-m' : 't-heading'} mt24">가입 신청</h1>
  <p class="ink2 mt8">처음 로그인하셨어요. 아래 내용을 보내 주시면 관리자가 확인한 뒤 승인합니다.</p>
  <div class="form mt24 rel">${pins ? pin(1, 'left:calc(-26px*var(--inv,1));top:2px') : ''}
    ${field('구글 계정', '', `<div class="inp ro">${icon('lock', 14)}<span>newcomer@example.com</span></div>`, '로그인한 계정이라 바꿀 수 없습니다.')}
    ${field('병원 이름', '필수', '<div class="inp"><span class="ph-t">예: 가나 정형외과의원</span></div>')}
    ${field('신청자 이름', '필수', '<div class="inp"><span class="ph-t">예: 홍길동</span></div>')}
    ${field('연락처', '선택', '<div class="inp"><span class="ph-t num">010-0000-0000</span></div>', '승인 관련해 연락이 필요할 때만 씁니다.')}
    <label class="cb"><span class="box"></span><span>가입 확인을 위해 이메일·이름·연락처를 저장하는 데 동의합니다. <span class="t-caption muted">필수</span></span></label>
    <span class="btn btn-primary btn-lg full">가입 신청</span>
  </div>
  <p class="mt16 rel"><a class="link">다른 계정으로 로그인</a>${pins ? pin(3, 'left:calc(-26px*var(--inv,1));top:2px') : ''}</p>
</div>`
}
const dl = (rows) => `<dl class="dlist">${rows.map(([k, v, c]) => `<div><dt>${k}</dt><dd class="${c || ''}">${v}</dd></div>`).join('')}</dl>`
export function pendingBody(phone = false, pins = false) {
  return `<div class="col480${phone ? ' ph' : ''}">${authTop(true, pins ? pin(3, 'left:auto;right:calc(-9px*var(--inv,1))') : '')}
  ${stepper(3)}
  <p class="status mt24 rel"><span class="chip chip-warn">${icon('clock', 12)}승인 대기</span><span class="t-small muted num">2026-10-27 신청</span>${pins ? pin(1, 'left:calc(-26px*var(--inv,1));top:0') : ''}</p>
  <h1 class="${phone ? 't-heading-m' : 't-heading'} mt8">신청을 확인하고 있습니다</h1>
  <p class="ink2 mt8">관리자가 승인하면 대시보드를 쓸 수 있습니다. 승인된 뒤에는 이 화면을 새로 고치거나 다시 로그인해 주세요.</p>
  <h2 class="t-small strong muted mt32">보낸 신청 내용</h2>
  <div class="rel">${pins ? pin(2, 'left:calc(-26px*var(--inv,1));top:8px') : ''}${dl([['신청일', '2026-10-27', 'num'], ['병원 이름', '예시정형외과의원', 'strong'], ['신청자', '홍길동'], ['구글 계정', 'wait@example.com'], ['연락처', '02-1234-5678', 'num']])}</div>
  <span class="btn btn-primary btn-lg mt24${phone ? ' full' : ''}">상태 다시 확인</span>
</div>`
}
export function rejectedBody(phone = false, pins = false) {
  return `<div class="col480${phone ? ' ph' : ''}">${authTop(true)}
  <p class="status mt24"><span class="chip chip-neg">${icon('x', 12)}승인되지 않음</span><span class="t-small muted num">2026-10-27 신청</span></p>
  <h1 class="${phone ? 't-heading-m' : 't-heading'} mt8">가입이 승인되지 않았습니다</h1>
  <p class="ink2 mt8 rel">궁금한 점은 신청을 검토한 관리자에게 문의해 주세요. 관리자가 다시 검토해 승인하면 이 계정으로 이어서 쓸 수 있습니다.${pins ? pin(4, 'left:calc(-26px*var(--inv,1));top:2px') : ''}</p>
  <h2 class="t-small strong muted mt32">보낸 신청 내용</h2>
  ${dl([['신청일', '2026-10-27', 'num'], ['병원 이름', '예시정형외과의원', 'strong'], ['구글 계정', 'no@example.com']])}
  <span class="btn btn-primary btn-lg mt24${phone ? ' full' : ''}">다른 계정으로 로그인</span>
</div>`
}
export const authPC = (body, h = 900) => `<div class="ui auth-c" style="height:${h}px">${body}</div>`
export const authPhone = (body, h = 844) => `<div class="ui auth-c ph" style="min-height:${h}px">${body}</div>`

// ═════════ DASHBOARD
function toolbar({ phone = false, empty = false }) {
  const seg = `<div class="seg${empty ? ' dis' : ''}"><span>일</span><span class="${empty ? '' : 'on'}">주</span><span>월</span></div>`
  const period = `<span class="btn btn-secondary btn-sm${empty ? ' dis' : ''}">${icon('cal', 14)}<span class="num">${empty ? '기간 없음' : '9월 7일 – 11월 1일'}</span></span>`
  const quality = empty ? '' : `<span class="chip chip-pos">${icon('check', 12)}자료 빠짐 없음</span><span class="t-small muted num">${phone ? '9.1 – 10.30' : '덮은 기간 9월 1일 – 10월 30일'}</span>`
  const upload = `<span class="btn btn-secondary btn-sm dis">${icon('upload', 14)}파일 올리기<span class="chip">준비 중</span></span>`
  if (phone) return `<div class="tb ph">${seg}${period}</div><div class="row g8 mt8 fw">${quality || '<span class="t-small muted">올린 자료 없음</span>'}</div>`
  return `<div class="tb"><div class="row g8">${seg}${period}${empty ? '' : '<span class="t-small muted">기준 <b class="ink2 num">지난주 10월 19일 – 25일</b> · 비교 그 전 주</span>'}</div><div class="row g12">${quality}${upload}</div></div>`
}
export function dashboardPC({ empty = false } = {}) {
  const title = `<div class="row sb"><div class="row g8"><h1 class="t-title">대시보드</h1>${empty ? '' : '<span class="chip chip-accent">예시 숫자</span>'}</div></div>`
  let body
  if (empty) {
    body = `${kpiStrip({ empty: true })}
    <div class="panel empty mt16"><div class="ghost">${[0, 1, 2, 3].map(() => '<i></i>').join('')}</div>
      <div class="empty-msg"><div class="em-in"><p class="t-subtitle">아직 볼 숫자가 없습니다</p><p class="ink2 mt4">EMR에서 내려받은 통계 파일을 올리면 이곳에 환자 수, 신환·재진, 재방문율이 그려집니다.</p><p class="t-small muted mt8">파일 올리기는 준비 중입니다. 준비되면 오른쪽 위 [파일 올리기]로 올립니다.</p></div></div></div>`
  } else {
    body = `<div class="rel">${kpiStrip()}${pin(1)}</div>
    <div class="dgrid mt16">
      <div class="panel d8 rel">${pin(2, 'left:auto;right:calc(-9px*var(--inv,1))')}<div class="panel-h"><div><span class="t-subtitle">주별 환자 수</span><span class="t-small muted ml8">신환·재진 · 단위 명</span></div><span class="legend t-small"><i class="sw sw-new"></i>신환<i class="sw sw-ret"></i>재진<i class="sw sw-hatch"></i>집계 중 (이번 주)</span></div>
        <div class="panel-b">${barsChart({ w: 805, h: 300 })}</div></div>
      <div class="panel d4"><div class="panel-h"><span class="t-subtitle">신환 재방문율</span></div>
        <div class="panel-b"><div class="rv-n"><div><p class="t-small muted">7일 안에 다시 옴</p><p class="metric num">41.3<span class="unit">%</span></p><p class="t-caption muted num">10.12 주 신환 126명 중 52명</p></div><div><p class="t-small muted">14일 안에 다시 옴</p><p class="metric num">52.3<span class="unit">%</span></p><p class="t-caption muted num">10.5 주 신환 109명 중 57명</p></div></div>
        ${revisitChart({ w: 370, h: 176 })}
        <p class="t-caption muted">첫 방문 뒤 7일·14일이 지나야 비율이 나옵니다. 그 전 주는 빗금으로 표시합니다.</p></div></div>
    </div>
    <div class="panel mt16 rel">${pin(3)}<div class="panel-h"><div><span class="t-subtitle">처방별 환자 수</span><span class="t-small muted ml8">지난주와 그 전 주 · 단위 명</span></div><span class="legend t-small"><i class="sw sw-new"></i>지난주<i class="sw sw-tick"></i>그 전 주</span></div>
      <table class="tbl rx mt12"><colgroup><col style="width:180px"><col style="width:88px"><col style="width:230px"><col style="width:96px"><col style="width:150px"><col><col><col></colgroup><thead><tr><th>처방</th><th>구분</th><th>지난주</th><th class="r">그 전 주</th><th class="r">증감</th><th class="r">신환율</th><th class="r">재진율</th><th class="r">2회 이상</th></tr></thead>
      <tbody>${RX.map((r) => `<tr><td class="strong">${r.name}</td><td class="muted">${r.type}</td><td><span class="row g12">${rxBar(r.cur, r.prev)}<span class="num strong">${r.cur}</span></span></td><td class="r num muted">${r.prev}</td><td class="r num ${r.diff > 0 ? 'pos' : 'neg'}">${tri(r.diff > 0 ? 'up' : 'down')} ${Math.abs(r.diff)} <span class="pct">(${r.pct})</span></td><td class="r num">${r.nr}%</td><td class="r num">${r.rr}%</td><td class="r num">${r.fr}%</td></tr>`).join('')}</tbody></table>
    </div>
    <div class="dgrid mt16">
      <div class="panel d6"><div class="panel-h"><span class="t-subtitle">많이 바뀐 처방</span><span class="t-small muted">지난주 · 그 전 주 대비</span></div>
        <div class="panel-b two-lists"><div><p class="t-small strong pos">${tri('up')} 늘어난 처방</p><ol class="mv">${RISING.map(([n, d, p]) => `<li><span>${n}</span><span class="num pos">+${d} <span class="pct">(${p})</span></span></li>`).join('')}</ol></div>
        <div><p class="t-small strong neg">${tri('down')} 줄어든 처방</p><ol class="mv">${FALLING.map(([n, d, p]) => `<li><span>${n}</span><span class="num neg">−${d} <span class="pct">(${p})</span></span></li>`).join('')}</ol></div></div></div>
      <div class="panel d6 rel">${pin(4, 'left:auto;right:calc(-9px*var(--inv,1))')}<div class="panel-h"><span class="t-subtitle">동네별 환자 수</span><span class="t-small muted">지난주 · 714명</span></div><div class="panel-b">${regionsChart({ w: 588 })}</div></div>
    </div>`
  }
  return `<div class="ui app">
  <div class="sticky-grp rel">${appHeader({})}${tabBar({ tip: !empty, pin: empty ? '' : '' })}</div>
  <main class="wrap-app main">${title}${toolbar({ empty })}<div class="mt16">${body}</div></main>
</div>`
}
export function dashboardPhone({ empty = false } = {}) {
  let body
  if (empty) {
    body = `${kpiStrip({ empty: true, phone: true })}<div class="panel empty ph mt12"><div class="empty-msg"><p class="t-subtitle">아직 볼 숫자가 없습니다</p><p class="ink2 mt4">통계 파일을 올리면 이곳에 환자 수, 신환·재진, 재방문율이 그려집니다.</p><p class="t-small muted mt4">파일 올리기는 준비 중입니다.</p></div></div>`
  } else {
    body = `${kpiStrip({ phone: true })}
    <div class="panel mt12"><div class="panel-h ph"><span class="t-subtitle">주별 환자 수</span><span class="t-caption muted">단위 명</span></div><div class="panel-b ph"><p class="legend t-caption"><i class="sw sw-new"></i>신환<i class="sw sw-ret"></i>재진<i class="sw sw-hatch"></i>집계 중</p>${barsChart({ w: 324, h: 210, compact: true })}</div></div>
    <div class="panel mt12"><div class="panel-h ph"><span class="t-subtitle">신환 재방문율</span></div><div class="panel-b ph"><div class="rv-n ph"><div><p class="t-caption muted">7일 안</p><p class="metric num">41.3<span class="unit">%</span></p></div><div><p class="t-caption muted">14일 안</p><p class="metric num">52.3<span class="unit">%</span></p></div></div>${revisitChart({ w: 324, h: 150, compact: true })}</div></div>
    <div class="panel mt12"><div class="panel-h ph"><span class="t-subtitle">처방별 환자 수</span><span class="t-caption muted">지난주</span></div>
      <ol class="rxlist">${RX.slice(0, 5).map((r) => `<li><div class="row sb"><span class="strong">${r.name}</span><span class="num t-small ${r.diff > 0 ? 'pos' : 'neg'}">${tri(r.diff > 0 ? 'up' : 'down')} ${Math.abs(r.diff)} (${r.pct})</span></div><div class="row g8">${rxBar(r.cur, r.prev, { w: 230 })}<span class="num strong t-small">${r.cur}명</span></div></li>`).join('')}</ol></div>
    <div class="panel mt12"><div class="panel-h ph"><span class="t-subtitle">동네별 환자 수</span><span class="t-caption muted">지난주</span></div><div class="panel-b ph">${regionsChart({ w: 324, compact: true })}</div></div>`
  }
  return `<div class="ui app ph" style="min-height:844px">
  <div class="sticky-grp">${appHeader({ phone: true })}${tabBar({ phone: true })}</div>
  <main class="main ph"><div class="row g8"><h1 class="t-title">대시보드</h1>${empty ? '' : '<span class="chip chip-accent">예시 숫자</span>'}</div>
  <div class="mt12">${toolbar({ phone: true, empty })}</div>
  ${empty ? '' : '<p class="t-caption muted mt8 num">기준 지난주 10.19 – 10.25 · 비교 그 전 주</p>'}
  <div class="mt12">${body}</div></main>
</div>`
}

// ═════════ ADMIN
const APPS = [
  ['2026-10-29', '바른마디정형외과의원', '김민수', 'barun@example.com', '010-1234-5678'],
  ['2026-10-28', '하늘척추의원', '이서연', 'sky@example.com', '031-123-4567'],
  ['2026-10-27', '튼튼재활의학과의원', '박준호', 'teun@example.com', '–'],
]
const ptabs = (phone) => `<div class="ptabs${phone ? ' ph' : ''}"><span class="on">대기 <span class="num">3</span></span><span>승인 <span class="num">1</span></span><span>거절 <span class="num">1</span></span></div>`
export function adminPC() {
  return `<div class="ui app" style="height:900px">
  <div class="sticky-grp">${appHeader({})}${tabBar({ active: '관리자' })}</div>
  <main class="wrap-app main">
    <h1 class="t-title">가입 신청</h1>
    <p class="ink2 mt4">승인하면 그 계정은 바로 대시보드를 쓸 수 있습니다. 거절한 신청은 거절 탭에서 되돌릴 수 있습니다.</p>
    <div class="mt16 rel">${ptabs(false)}${pin(3, 'left:calc(-26px*var(--inv,1));top:10px')}</div>
    <div class="rel">${pin(1, 'left:calc(-26px*var(--inv,1));top:12px')}
    <table class="tbl adm"><thead><tr><th style="width:120px">신청일</th><th>병원 이름</th><th style="width:120px">신청자</th><th>이메일</th><th style="width:150px">연락처</th><th style="width:150px" class="r">동작</th></tr></thead>
    <tbody>${APPS.map((a, i) => `<tr><td class="num muted">${a[0]}</td><td class="strong">${a[1]}</td><td>${a[2]}</td><td class="ink2">${a[3]}</td><td class="num ink2">${a[4]}</td><td class="r"><span class="row g8 jr${i === 0 ? ' rel' : ''}"><span class="btn btn-accent-o btn-sm">승인</span><span class="btn btn-secondary btn-sm">거절</span>${i === 0 ? pin(2, 'left:auto;right:calc(-26px*var(--inv,1));top:4px') : ''}</span></td></tr>`).join('')}</tbody></table></div>
    <p class="t-small muted mt12">대기 중인 신청 3건</p>
  </main>
</div>`
}
export function adminPhone() {
  return `<div class="ui app ph" style="min-height:844px">
  <div class="sticky-grp">${appHeader({ phone: true })}${tabBar({ phone: true, active: '관리자', shift: 300 })}</div>
  <main class="main ph"><h1 class="t-title">가입 신청</h1><p class="t-small ink2 mt4">승인하면 그 계정은 바로 대시보드를 쓸 수 있습니다. 거절한 신청은 거절 탭에서 되돌릴 수 있습니다.</p>
  <div class="mt12">${ptabs(true)}</div>
  <ul class="adm-rows">${APPS.map((a) => `<li><div class="row sb"><span class="strong ell">${a[1]}</span><span class="t-caption muted num">${a[0]}</span></div><p class="t-small ink2">${a[2]} · ${a[3]}</p><div class="row sb"><span class="t-small muted num">${a[4] === '–' ? '연락처 없음' : a[4]}</span><span class="row g8"><span class="btn btn-accent-o btn-md">승인</span><span class="btn btn-secondary btn-md">거절</span></span></div></li>`).join('')}</ul>
  </main>
</div>`
}
