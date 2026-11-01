// Entry screens after the 90-point fixes. Drawn at design width (phone 390, PC 1440). Numbers are 예시.
import { icon, tri, logo, gmark, barsChart, spark, KPI } from './parts.mjs'

// exact tab list and order from src/components/shell/menu.ts
export const MENU = ['대시보드', '통계', '청구', '고시·공지', '환자', '매출', 'AI 리포트', '서식', '직원', '업무일지', '재고', '주소록', '설정']
const nw = (t) => `<span class="nw">${t}</span>`
const logoLink = (size) => `<a href="#" class="logo-link" data-act="home" aria-label="처음 화면으로 가기">${logo(size)}</a>`
const skip = `<a href="#" class="skip" data-act="skip">본문으로 건너뛰기</a>`
// real app truncates (plan.md §5): +3.9%, 0.2%p
const pctOf = (k) => (k.pct === '+4.0%' ? '+3.9%' : k.pct) || (k.diff === '0.3%p' ? '0.2%p' : k.diff)

let uid = 0
const id = (p) => `${p}-${++uid}`

// ── preview (mini dashboard, 예시): tabs = real app tabs, the ones that do not fit are hidden by the page script
export function preview(w, { phone = false } = {}) {
  const inner = w - 2
  return `<div class="pv" style="width:${w}px">
  <div class="pv-top row sb"><div class="row g8">${logo(18)}<span class="t-small strong">예시정형외과의원</span></div><span class="chip chip-accent">예시 숫자</span></div>
  <div class="pv-tabs" data-fit-tabs>${MENU.map((t, i) => `<span class="${i ? 'off' : 'on'}">${t}</span>`).join('')}</div>
  <div class="pv-kpis${phone ? ' ph' : ''}">${KPI.map((k) => `<div class="pv-k"><div class="row sb"><span class="t-caption muted">${k.label}</span>${phone ? '' : spark(k.spark, { w: 56, h: 22 })}</div><div class="pv-v num">${k.value}<span class="unit">${k.unit}</span></div><div class="t-caption delta pos">${tri('up')}<span class="num">${pctOf(k)}</span></div></div>`).join('')}</div>
  <div class="pv-chart"><div class="row sb pv-ch"><span class="t-small strong">주별 환자 수</span><span class="legend t-caption"><i class="sw sw-new"></i>신환<i class="sw sw-ret"></i>재진<i class="sw sw-hatch"></i>집계 중</span></div>
  ${barsChart({ w: inner - 32, h: phone ? 190 : 230, compact: true, skip: phone })}</div>
</div>`
}

// ═════════ LANDING
const AI_POINTS = [
  ['근거 숫자와 함께', '모든 문장에 어떤 숫자를 보고 말했는지 붙여요.'],
  ["짐작은 '추정'이라고", '원인을 짐작할 때는 추정이라고 분명히 밝혀요.'],
  ['정해 둔 양식 그대로', '월간보고 발표 자료를 우리 의원 양식에 맞춰 채워요.'],
  ['환자 정보 없이', 'AI에는 합계 숫자만 보내요.'],
]
const AI_ITEMS = [
  ['chip-pos', '늘었어요', '신환이 지난달보다 늘었어요.', '근거 · 신환 9월 486명 → 10월 524명'],
  ['chip-warn', '살펴볼 것', '인건비율이 지난달보다 올랐어요.', '근거 · 인건비 총액 ÷ 매출'],
  ['', '추정', '도수치료 증가는 신환 증가와 함께 움직인 것으로 보여요.', '근거 · 처방 그룹 ‘도수’ 9월 312건 → 10월 356건'],
]
const aiKick = `<p class="row g8"><span class="chip">준비 중</span><span class="t-small muted">AI 리포트 탭</span></p>`
const reportPanel = (phone) => `<div class="panel report${phone ? ' ph' : ''}">
    <div class="panel-h"><span class="t-subtitle">10월 AI 리포트</span><span class="chip">예시</span></div>
    <ol class="r-items one${phone ? ' ph' : ''}">${AI_ITEMS.map(([tone, tag, text, basis], i) => `<li><span class="chip ${tone}">${tag}</span><div><p>${text}</p>${phone && i === 2 ? '' : `<p class="t-small muted num">${basis}</p>`}</div></li>`).join('')}</ol>
  </div>`

const ORTHO = [
  ['주사', '주사 치료 수와 재방문', '이번 달', [['주사 치료', '142건'], ['재방문', '37건']]],
  ['물리치료', '물리치료 내원 환자 수', '오늘', [['오전', '21명'], ['오후', '17명']]],
  ['비급여', '비급여 치료 내역', '이번 달', [['도수치료', '86건'], ['체외충격파', '31건']]],
  ['월말 보고', '한 장으로 받는 월간 보고', '10월', [['보고서', 'PDF 1장'], ['AI 분석', '포함']]],
]
const kv = (pairs) => pairs.map(([k, v]) => `<span class="kv"><span>${k}</span><b class="num">${v}</b></span>`).join('')

// 01 is the precheck panel (PC) / first list item (phone). Not-built features carry a 준비 중 chip
const FEATURES = [
  { num: '01', title: '청구 · 삭감 예방 사전점검', ready: true, pc: '', phone: '청구하기 전에 삭감될 만한 처방을 미리 찾아 줘요.' },
  { num: '02', title: '환자 통계', pc: 'EMR에서 내려받은 통계 파일을 올리면 신환율·재진율, 7일·14일 재방문, 처방 그룹별 환자 수를 바로 계산해요.', phone: '통계 파일을 올리면 신환율·재진율, 재방문을 바로 계산해요.' },
  { num: '03', title: '매출·재고', pc: '매출 흐름을 보고, 재고가 떨어지면 대시보드에 발주 알림을 띄워요.', phone: '재고가 떨어지면 발주 알림을 띄워요.' },
  { num: '04', title: '직원·업무일지', pc: '직원 명단과 급여 계산, 엑셀 양식 그대로의 업무일지를 한곳에서 써요.', phone: '급여 계산과 엑셀 양식 그대로의 업무일지를 써요.' },
]
const readyChip = `<span class="chip chip-pos">${icon('check', 12)}쓸 수 있어요</span>`
const soonChip = `<span class="chip">준비 중</span>`
const fItem = (f, phone) => `<li><span class="num">${f.num}</span><div><h3 class="row g8 fw">${f.title}${f.ready ? readyChip : soonChip}</h3><p>${phone ? f.phone : f.pc}</p></div></li>`

const PRIV_RULES = [
  ['필요한 칸만 읽어요', '계산에 쓰는 칸을 정해 두고 그 칸만 읽어요. 차트번호는 계산하는 동안 메모리 안에서만 써요.'],
  ['주민번호가 보이면 멈춰요', "'-' 없이 붙여 쓴 13자리까지 잡아서, 섞여 있으면 계산하지 않고 알려 줘요."],
  ['AI에는 합계 숫자만', '통계·매출 합계와 인건비 총액만 보내요. 직원 이름·개인별 급여도 보내지 않아요.'],
  ['승인한 사람만, 공용 PC도 안심', '구글 로그인 뒤 관리자가 승인한 계정만 들어와요. 30분 동안 움직임이 없으면 자동으로 로그아웃해요.'],
]
const STEPS = [
  ['구글로 시작하기', '쓰던 구글 계정으로 로그인해요. 새 비밀번호를 만들 필요가 없어요.'],
  ['가입 신청', '처음 한 번만 의원 이름을 적어 신청해요.'],
  ['승인 후 바로 사용', '관리자가 승인하면 대시보드가 열려요.'],
]
const HERO_LEAD = `청구 전 삭감 예방 사전점검부터 환자 통계·매출·${nw('원장님 보고까지')}, 의원 일을 ${nw('한 화면에서')} 봐요. 지금은 사전점검을 먼저 쓸 수 있고, 나머지는 차례로 열려요.`
const PRIV_H2 = `환자 개인정보는 절대 ${nw('병원 PC')} 밖으로 나가지 않아요`
const KICKER = '통증 의원 관리자를 위한 AI 업무 도구'
const startBtn = (cls = '') => `<button type="button" class="btn btn-primary ${cls}" data-act="start">구글로 시작하기</button>`

export function landingPC() {
  return `<div class="ui lp">${skip}
<div class="l-hdr"><div class="wrap-l row sb"><div class="row g32">${logoLink(24)}<div class="l-nav"><a href="#" data-act="nav">AI 분석</a><a href="#" data-act="nav">기능</a><a href="#" data-act="nav">개인정보 보호</a><a href="#" data-act="nav">시작 방법</a></div></div>${startBtn()}</div></div>
<div class="l-hero"><div class="wrap-l grid12">
  <div class="c1-5 hero-txt">
    <p class="kicker">${KICKER}</p>
    <h1 class="t-display">숫자로 보는 우리 의원</h1>
    <p class="t-lead ink2">${HERO_LEAD}</p>
    <div class="row g8">${startBtn('btn-lg')}<button type="button" class="btn btn-secondary btn-lg" data-act="ai">AI 분석 보기</button></div>
    <ul class="promises">
      <li>${icon('shield')}<span>환자 개인정보 서버 전송 <b class="num">0건</b></span></li>
      <li>${icon('monitor')}<span>환자 파일은 브라우저 안에서만 계산</span></li>
      <li>${icon('sigma')}<span>AI에는 합계 숫자만</span></li>
    </ul>
  </div>
  <div class="c6-12">${preview(690)}</div>
</div></div>

<div class="l-sec band"><div class="wrap-l grid12 top">
  <div class="c1-4">
    ${aiKick}
    <h2 class="t-heading mt8">버튼 한 번이면 AI가 이번 달을 읽어 줘요</h2>
    <p class="t-lead ink2 mt12">숫자를 늘어놓는 데서 끝나지 않아요. 무엇이 달라졌는지, 왜 그런지, 다음 달 무엇을 봐야 하는지 말로 정리해요.</p>
    <dl class="plist mt32">${AI_POINTS.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join('')}</dl>
  </div>
  <div class="c5-12">${reportPanel(false)}</div>
</div></div>

<div class="l-sec"><div class="wrap-l">
  <div class="grid12 head-split"><h2 class="t-heading c1-6">정형외과·통증 의원을 위해 만들었어요</h2><p class="t-lead ink2 c7-11">척추·관절 환자 흐름, 도수·물리치료 처방, 치료사 생산성까지. 정형외과에서 매일 보는 숫자에 맞췄어요.</p></div>
  <table class="cmp mt32">
    <thead><tr><th></th>${ORTHO.map((c) => `<th>${c[0]}</th>`).join('')}</tr></thead>
    <tbody>
      <tr><th>보는 숫자</th>${ORTHO.map((c) => `<td>${c[1]}</td>`).join('')}</tr>
      <tr><th>기준</th>${ORTHO.map((c) => `<td>${c[2]}</td>`).join('')}</tr>
      <tr><th>예시</th>${ORTHO.map((c) => `<td>${kv(c[3])}</td>`).join('')}</tr>
    </tbody>
  </table>
</div></div>

<div class="l-sec feat"><div class="wrap-l">
  <h2 class="t-heading w-6">매일 하던 일을 한곳에 모아요</h2>
  <p class="t-lead ink2 mt12 w-7">지금은 청구 사전점검을 쓸 수 있고, 나머지 기능은 차례로 열려요.</p>
  <div class="grid12 mt32">
    <div class="c1-6">
      <p class="row g8 fw"><span class="t-small strong accent">01 · 청구 · 삭감 예방 사전점검</span>${readyChip}</p>
      <h3 class="t-title mt8">청구하기 전에 삭감될 만한 처방을 미리 찾아 줘요</h3>
      <p class="ink2 mt8">비트 PC의 크롬에서 열면 환자마다 점검 결과와 고시 근거, 추천 상병을 보여 줘요. 환자 자료는 ${nw('그 PC 안에서만')} 점검해요.</p>
      <div class="panel mt24">
        <div class="panel-h"><span class="t-subtitle">10월 28일 사전점검 <span class="t-small muted">예시</span></span><span class="t-small muted num">환자 32명 점검</span></div>
        <table class="tbl pc-tbl mt12"><thead><tr><th>환자</th><th>점검 결과</th><th>내용</th></tr></thead>
        <tbody>
          <tr><td>환자 1</td><td><span class="chip chip-warn">확인 필요</span></td><td>도수치료 처방에 맞는 상병이 없어요<span class="blk t-caption muted">근거 · 고시 기준</span></td></tr>
          <tr><td>환자 2</td><td><span class="chip chip-accent">알림</span></td><td>같은 주 물리치료 횟수가 기준보다 많아요<span class="blk t-caption muted">근거 · 고시 기준</span></td></tr>
          <tr><td>환자 3</td><td><span class="chip">참고</span></td><td>추천 상병이 하나 있어요</td></tr>
        </tbody></table>
      </div>
    </div>
    <ol class="flist c8-12">${FEATURES.slice(1).map((f) => fItem(f, false)).join('')}</ol>
  </div>
</div></div>

<div class="l-sec band"><div class="wrap-l">
  <div class="grid12">
    <div class="c1-8"><h2 class="t-heading">${PRIV_H2}</h2><p class="t-lead ink2 mt12 w-7">환자 이름·주민번호·차트번호는 서버에도, AI에도 가지 않아요. 처음부터 그렇게 설계했어요.</p></div>
    <div class="c10-12 zero"><div class="t-display num">0<span class="unit-l">건</span></div><p class="t-small muted">서버와 AI로 보내는 환자 개인정보</p></div>
  </div>
  <div class="flow mt32">
    <div class="node"><p class="row g8 t-subtitle">${icon('monitor')}<span>${nw('병원 PC')} · 브라우저</span></p><p class="ink2">환자 파일을 여기서만 열고 계산해요.</p><p class="stopline">${icon('stop', 14)}<span><b>여기서 멈춤</b><span class="blk">환자 이름·주민번호·차트번호·파일 이름</span></span></p></div>
    <div class="edge"><span class="t-caption">합계 숫자만</span>${icon('arrow')}</div>
    <div class="node"><p class="row g8 t-subtitle">${icon('server')}서버</p><p class="ink2">통계·매출 합계만 저장해요. 원본 파일은 올라가지 않아요.</p></div>
    <div class="edge"><span class="t-caption">집계만</span>${icon('arrow')}</div>
    <div class="node"><p class="row g8 t-subtitle">${icon('doc')}AI 분석</p><p class="ink2">서버가 꺼낸 합계 숫자로만 리포트를 써요.</p></div>
  </div>
  <dl class="plist two mt32">${PRIV_RULES.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join('')}</dl>
</div></div>

<div class="l-sec"><div class="wrap-l grid12">
  <div class="c1-5"><h2 class="t-heading">시작은 3단계면 충분해요</h2><p class="t-lead ink2 mt12">처음이면 가입 신청 후 관리자 승인을 받아요.</p>${startBtn('btn-lg mt24')}</div>
  <ol class="steps c7-12">${STEPS.map(([t, d], i) => `<li><span class="sn num">${i + 1}</span><div><h3>${t}</h3><p>${d}</p></div></li>`).join('')}</ol>
</div></div>

<div class="l-foot"><div class="wrap-l row sb"><div class="row g8">${logo(18)}<span class="t-caption muted">${KICKER}</span></div><span class="t-caption muted num">© 2026</span></div></div>
</div>`
}

export function landingPhone() {
  return `<div class="ui lp ph">${skip}
<div class="l-hdr ph"><div class="row sb">${logoLink(24)}${startBtn('btn-sm tap')}</div></div>
<div class="l-hero ph">
  <p class="kicker">${KICKER}</p>
  <h1 class="t-display-m">숫자로 보는 우리 의원</h1>
  <p class="t-lead ink2">${HERO_LEAD}</p>
  ${startBtn('btn-lg full')}
  <p class="row g8 t-small muted">${icon('shield', 14)}<span>환자 개인정보는 ${nw('병원 PC')} 밖으로 나가지 않아요</span></p>
  ${preview(358, { phone: true })}
</div>
<div class="l-sec ph band">
  ${aiKick}
  <h2 class="t-heading-m mt8">버튼 한 번이면 AI가 이번 달을 읽어 줘요</h2>
  <p class="t-lead ink2 mt12">숫자를 늘어놓는 데서 끝나지 않아요. 무엇이 달라졌는지, 왜 그런지, 다음 달 무엇을 봐야 하는지 말로 정리해요.</p>
  <div class="mt16">${reportPanel(true)}</div>
  <ul class="mini mt16">${AI_POINTS.map(([t]) => `<li>${t}</li>`).join('')}</ul>
</div>
<div class="l-sec ph">
  <h2 class="t-heading-m">정형외과·통증 의원을 위해 만들었어요</h2>
  <p class="t-lead ink2 mt12">척추·관절 환자 흐름, 도수·물리치료 처방, 치료사 생산성까지. 정형외과에서 매일 보는 숫자에 맞췄어요.</p>
  <table class="cmp ph mt16"><caption class="t-caption muted">예시 값</caption>
    ${ORTHO.map((c) => `<tr><th>${c[0]}<span>${c[2]}</span></th><td>${kv(c[3])}</td></tr>`).join('')}
  </table>
  <h2 class="t-heading-m mt48">매일 하던 일을 한곳에 모아요</h2>
  <p class="t-lead ink2 mt12">지금은 청구 사전점검을 쓸 수 있고, 나머지 기능은 차례로 열려요.</p>
  <ol class="flist ph mt16">${FEATURES.map((f) => fItem(f, true)).join('')}</ol>
</div>
<div class="l-sec ph band">
  <h2 class="t-heading-m">${PRIV_H2}</h2>
  <p class="t-lead ink2 mt12">환자 이름·주민번호·차트번호는 서버에도, AI에도 가지 않아요. 처음부터 그렇게 설계했어요.</p>
  <div class="zero ph mt16"><div class="t-display-m num">0<span class="unit-l">건</span></div><p class="t-small muted">서버와 AI로 보내는 환자 개인정보</p></div>
  <div class="flow ph mt16">
    <div class="node"><p class="row g8 t-subtitle">${icon('monitor')}<span>${nw('병원 PC')} · 브라우저</span></p><p class="stopline">${icon('stop', 14)}<span>환자 이름 · 주민번호 · 차트번호는 여기서 멈춤</span></p></div>
    <div class="edge">${icon('arrowDown')}<span class="t-caption">합계 숫자만</span></div>
    <div class="node"><p class="row g8 t-subtitle">${icon('server')}서버</p></div>
    <div class="edge">${icon('arrowDown')}<span class="t-caption">집계만</span></div>
    <div class="node"><p class="row g8 t-subtitle">${icon('doc')}AI 분석</p></div>
  </div>
</div>
<div class="l-sec ph">
  <h2 class="t-heading-m">시작은 3단계면 충분해요</h2>
  <p class="t-lead ink2 mt12">처음이면 가입 신청 후 관리자 승인을 받아요.</p>
  <ol class="steps ph mt16">${STEPS.map(([t], i) => `<li><span class="sn num">${i + 1}</span><div><h3>${t}</h3></div></li>`).join('')}</ol>
  ${startBtn('btn-lg full mt24')}
</div>
<div class="l-foot ph"><div class="row sb"><div class="row g8">${logo(18)}<span class="t-caption muted">${KICKER}</span></div><span class="t-caption muted num">© 2026</span></div></div>
</div>`
}

// ═════════ LOGIN
const loginForm = (phone) => `<div class="auth-form${phone ? ' ph' : ''}">
  <h1 class="${phone ? 't-heading-m' : 't-heading'}">로그인</h1>
  <p class="ink2 mt8">구글 계정으로 로그인해요. 처음이면 가입 신청으로 이어져요.</p>
  <button type="button" class="btn btn-google btn-lg full mt24" data-act="google">${gmark(18)}<span data-label>구글로 시작하기</span></button>
  <div class="note-row mt24">${icon('shield', 16)}<div><p class="strong t-small">환자 개인정보는 ${nw('병원 PC')} 밖으로 나가지 않아요</p><p class="t-small muted">환자 파일은 이 브라우저 안에서만 읽고, 서버에는 집계 숫자만 저장해요.</p></div></div>
  <p class="t-small muted mt16">처음 가입하면 관리자가 승인한 뒤부터 쓸 수 있어요.</p>
</div>`
export function loginPC() {
  return `<div class="ui auth-split" style="height:900px">
  <div class="pane-l"><div class="pane-in">
    <div>${logoLink(28)}</div>
    <div class="pane-mid">${loginForm(false)}</div>
    <p class="t-caption muted">${KICKER}</p>
  </div></div>
  <div class="pane-r"><div class="pane-r-in"><p class="t-small ink2 w-pv">로그인하면 청구 사전점검과 우리 의원의 오늘 숫자를 한곳에서 이어서 봐요.</p>${preview(560)}</div></div>
</div>`
}
export function loginPhone() {
  return `<div class="ui auth-ph" style="min-height:844px"><div class="auth-top ph">${logoLink(24)}</div>${loginForm(true)}</div>`
}

// ═════════ SIGNUP / PENDING / REJECTED (one 480 column)
const stepper = (cur) => {
  const s = ['구글 로그인', '가입 신청', '관리자 승인']
  return `<ol class="stepper">${s.map((t, i) => {
    const n = i + 1, st = n < cur ? 'done' : n === cur ? 'now' : 'next'
    return `<li class="${st}"><span class="sq num">${st === 'done' ? icon('check', 12) : n}</span><span>${t}</span></li>`
  }).join('<li class="ln" aria-hidden="true"></li>')}</ol>`
}
const authTop = (out) => `<div class="auth-top">${logoLink(28)}${out ? '<button type="button" class="btn btn-ghost btn-sm tap" data-act="logout">로그아웃</button>' : ''}</div>`
const H = (phone) => (phone ? 't-heading-m' : 't-heading')
const input = (label, req, attrs, help = '') => {
  const i = id('f')
  return `<div class="field"><label for="${i}">${label}<span class="t-caption muted">${req}</span></label><input id="${i}" class="inp" ${attrs}>${help ? `<p class="t-caption muted">${help}</p>` : ''}</div>`
}
export function signupBody(phone = false) {
  const cb = id('agree')
  return `<div class="col480${phone ? ' ph' : ''}">${authTop(false)}
  ${stepper(2)}
  <h1 class="${H(phone)} mt24">가입 신청</h1>
  <p class="ink2 mt8">처음 로그인하셨어요. 아래 내용을 보내 주시면 관리자가 확인한 뒤 승인해요.</p>
  <form class="form mt24" data-form="signup" novalidate>
    <div class="field"><span class="flabel">구글 계정</span><div class="inp ro">${icon('lock', 14)}<span>newcomer@example.com</span></div><p class="t-caption muted">로그인한 계정이라 바꿀 수 없어요.</p></div>
    ${input('의원 이름', '필수', 'type="text" placeholder="예: 가나 정형외과의원" autocomplete="off"')}
    ${input('신청자 이름', '필수', 'type="text" placeholder="예: 홍길동" autocomplete="off"')}
    ${input('연락처', '선택', 'type="tel" placeholder="010-0000-0000" autocomplete="off"', '승인 관련해 연락이 필요할 때만 써요.')}
    <div class="cb"><input type="checkbox" id="${cb}"><label for="${cb}">가입 확인을 위해 이메일·이름·연락처를 저장하는 데 동의해요. <span class="t-caption muted">필수</span></label></div>
    <button type="submit" class="btn btn-primary btn-lg full" data-act="signup">가입 신청</button>
  </form>
  <p class="mt16"><button type="button" class="link" data-act="logout">다른 계정으로 로그인</button></p>
</div>`
}
const dl = (rows) => `<dl class="dlist">${rows.map(([k, v, c]) => `<div><dt>${k}</dt><dd class="${c || ''}">${v}</dd></div>`).join('')}</dl>`
export function pendingBody(phone = false, checked = false) {
  return `<div class="col480${phone ? ' ph' : ''}">${authTop(true)}
  ${stepper(3)}
  <p class="status mt24"><span class="chip chip-warn">${icon('clock', 12)}승인 대기</span><span class="t-small muted num">2026-10-27 신청</span></p>
  <h1 class="${H(phone)} mt8">신청을 확인하고 있어요</h1>
  <p class="ink2 mt8">관리자가 승인하면 대시보드를 쓸 수 있어요. 승인됐는지는 ${nw('[상태 다시 확인]을')} 눌러 확인하세요.</p>
  <h2 class="t-small strong muted mt32">보낸 신청 내용</h2>
  ${dl([['의원 이름', '예시정형외과의원', 'strong'], ['신청자', '홍길동'], ['구글 계정', 'wait@example.com'], ['연락처', '02-1234-5678', 'num']])}
  <button type="button" class="btn btn-primary btn-lg mt24${phone ? ' full' : ''}" data-act="recheck">상태 다시 확인</button>
  <p class="result t-small" role="status" data-result>${checked ? `${icon('clock', 14)}<span>아직 승인 전이에요 · 오후 2:31 확인</span>` : ''}</p>
</div>`
}
export function rejectedBody(phone = false) {
  return `<div class="col480${phone ? ' ph' : ''}">${authTop(true)}
  <p class="status mt24"><span class="chip chip-neg">${icon('x', 12)}승인되지 않음</span><span class="t-small muted num">2026-10-27 신청</span></p>
  <h1 class="${H(phone)} mt8">가입이 승인되지 않았어요</h1>
  <p class="ink2 mt8">궁금한 점은 아래 관리자 메일로 물어봐 주세요. 관리자가 다시 검토해 승인하면 이 계정으로 이어서 쓸 수 있어요.</p>
  <div class="contact mt16"><p class="t-body">관리자 메일: <b class="mail">admin@example.com</b></p><button type="button" class="btn btn-secondary btn-sm tap" data-act="copymail">주소 복사</button></div>
  <h2 class="t-small strong muted mt32">보낸 신청 내용</h2>
  ${dl([['의원 이름', '예시정형외과의원', 'strong'], ['구글 계정', 'no@example.com']])}
  <button type="button" class="btn btn-primary btn-lg mt24${phone ? ' full' : ''}" data-act="logout">다른 계정으로 로그인</button>
</div>`
}
export const authPC = (body, h = 900) => `<div class="ui auth-c" style="height:${h}px">${body}</div>`
export const authPhone = (body, h = 844) => `<div class="ui auth-c ph" style="min-height:${h}px">${body}</div>`

// ═════════ NOT FOUND
export function notFoundOut(phone = false) {
  return `<div class="col480${phone ? ' ph' : ''}">${authTop(false)}
  <p class="status mt24"><span class="chip">없는 주소</span></p>
  <h1 class="${H(phone)} mt8">찾는 화면이 없어요</h1>
  <p class="ink2 mt8">주소가 바뀌었거나 잘못 적힌 것 같아요. 처음 화면에서 다시 시작해 주세요.</p>
  <p class="addr mt16"><span class="t-small muted">열려던 주소</span><span class="num">/dashbord</span></p>
  <div class="btns mt24"><button type="button" class="btn btn-primary btn-lg" data-act="home">처음 화면으로</button><button type="button" class="btn btn-secondary btn-lg" data-act="login">로그인</button></div>
</div>`
}
const appHeader = (phone) => phone
  ? `<div class="a-hdr ph"><div class="row g8 minw0">${logo(24)}<span class="clinic ell">예시정형외과의원</span></div><button type="button" class="iconbtn" data-act="acct" aria-label="계정 manager@example.com">${icon('user', 18)}</button></div>`
  : `<div class="a-hdr"><div class="wrap-app row sb"><div class="row g12">${logo(24)}<span class="clinic">예시정형외과의원</span></div><div class="row g16"><span class="t-small muted num">2026년 10월 31일 (토) 14:31</span><button type="button" class="btn btn-secondary btn-sm" data-act="acct">${icon('user')}<span>manager@example.com</span>${icon('chev')}</button></div></div></div>`
const tabBar = (phone) => `<div class="a-tabs${phone ? ' ph' : ''}"><div class="${phone ? 'tabs-sc' : 'wrap-app'}"><div class="tabs-in">${MENU.map((t) => `<a href="#" class="tab" data-act="tab">${t}</a>`).join('')}</div></div></div>`
export function notFoundIn(phone = false) {
  return `<div class="ui app${phone ? ' ph' : ''}" style="min-height:${phone ? 844 : 900}px">${skip}
  ${appHeader(phone)}${tabBar(phone)}
  <div class="main${phone ? ' ph' : ''}"><div class="wrap-app">
    <div class="panel nf">
      <span class="chip">없는 주소</span>
      <h1 class="t-title mt12">찾는 화면이 없어요</h1>
      <p class="ink2 mt8">주소가 바뀌었거나 잘못 적힌 것 같아요. 위 탭에서 가려는 화면을 고르거나 대시보드로 가 주세요.</p>
      <p class="addr mt16"><span class="t-small muted">열려던 주소</span><span class="num">/dashbord</span></p>
      <button type="button" class="btn btn-primary btn-lg mt24${phone ? ' full' : ''}" data-act="dash">대시보드로 가기</button>
    </div>
  </div></div>
</div>`
}
