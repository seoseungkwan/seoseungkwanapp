/* eslint-disable -- 승인 시안 기록(앱 코드 아님). 저장소 lint 경고를 늘리지 않게 끈다 */
// Builds proposal/index.html (+ fonts/ subset files actually used). Run: node build.mjs
import fs from 'node:fs'
import { logo, icon, specimenChart, C } from './parts.mjs'
import * as S from './screens.mjs'

const ROOT = '/tmp/claude-1000/-home-developer/310e8e3a-8667-4ba9-b937-f7cf7c479f65/scratchpad/redesign-b2b'
const OUT = ROOT + '/proposal'
const FONT_DIR = '/tmp/claude-1000/-home-developer/310e8e3a-8667-4ba9-b937-f7cf7c479f65/scratchpad/dl-pretendard/package/dist/web/variable'
for (const f of fs.existsSync(OUT + '/fonts') ? fs.readdirSync(OUT + '/fonts') : []) fs.unlinkSync(OUT + '/fonts/' + f)
if (fs.existsSync(OUT + '/fonts')) fs.rmdirSync(OUT + '/fonts')

// ── figure helpers
let figId = 0
const screen = (w, html, label) => `<div class="screen" data-w="${w}" data-label="${label}" role="button" tabindex="0" aria-label="${label} 크게 보기"><div class="vp" style="width:${w}px">${html}</div></div>`
const pc = (html, label, extra = '') => `<figure class="fig ${extra}"><figcaption class="fig-cap"><span><b>개편 후</b> · PC 1440</span><button type="button" class="zoom-btn">크게 보기</button></figcaption>${screen(1440, html, label)}</figure>`
const phone = (html, label, extra = '', fold = false) => `<figure class="fig phone-fig ${extra}"><figcaption class="fig-cap"><span><b>개편 후</b> · 휴대폰 390</span><button type="button" class="zoom-btn">크게</button></figcaption>${screen(390, html, label).replace('class="screen"', `class="screen${fold ? ' folds' : ''}"`)}</figure>`
const now = (file, alt, cap = '지금 · PC') => `<figure class="fig now"><figcaption class="fig-cap"><span><b class="muted-b">지금</b> · ${cap.replace('지금 · ', '')}</span></figcaption><img src="data:image/jpeg;base64,${fs.readFileSync(OUT + '/now/' + file).toString('base64')}" alt="${alt}"></figure>`
const notes = (items, cls = '') => `<ol class="notes ${cls}">${items.map(([k, t], i) => `<li><span class="k">${i + 1}</span><p><b>${k}</b> ${t}</p></li>`).join('')}</ol>`
const secHead = (n, title, sub) => `<div class="sec-h"><span class="sec-n">${n}</span><h2>${title}</h2><p>${sub}</p></div>`
const at = (cols, inner, cls = '') => `<div class="cell ${cls}" style="grid-column:${cols}">${inner}</div>`

// ── design rules strip
const swatch = (hex, name, border = false) => `<li><span class="sw-b${border ? ' bd' : ''}" style="background:${hex}"></span><span class="sw-t"><b>${name}</b><span class="num">${hex}</span></span></li>`
const rules = `
<section class="p-sec" id="rules"><div class="wrap">
${secHead('00', '디자인 규칙', '모든 화면이 따르는 한 벌의 규칙입니다. 아래 시안도 이 규칙으로만 그렸습니다.')}
<div class="grid rules">
  <div class="cell" style="grid-column:1/6"><h3 class="rh">글자 <span>Pretendard · 굵기 400·500·600 · 숫자는 자릿수 맞춤</span></h3>
    <ul class="type">
      <li><span class="spec num">48/56</span><span class="t-display">우리 의원</span><span class="use">랜딩 제목 (휴대폰 32)</span></li>
      <li><span class="spec num">28/36</span><span class="t-heading">가입 신청</span><span class="use">화면 제목 (휴대폰 24)</span></li>
      <li><span class="spec num">28/36</span><span class="metric num">714<span class="unit">명</span></span><span class="use">핵심 숫자</span></li>
      <li><span class="spec num">20/28</span><span class="t-title">대시보드</span><span class="use">앱 화면 제목</span></li>
      <li><span class="spec num">16/24</span><span class="t-subtitle">주별 환자 수</span><span class="use">패널 제목</span></li>
      <li><span class="spec num">14/22</span><span>구글 계정으로 로그인합니다.</span><span class="use">본문</span></li>
      <li><span class="spec num">13/20</span><span class="t-small num">2026-10-29 · 바른마디정형외과의원</span><span class="use">표</span></li>
      <li><span class="spec num">12/16</span><span class="t-caption muted">단위 명 · 예시</span><span class="use">눈금·설명</span></li>
    </ul>
  </div>
  <div class="cell" style="grid-column:7/13"><h3 class="rh">색 <span>강조색은 파랑 하나. 로고 두 색만 예외</span></h3>
    <p class="rl">바탕과 글자</p>
    <ul class="sws">${swatch('#F7F8FA', '바탕', true)}${swatch('#FFFFFF', '면', true)}${swatch('#E5E7EB', '선')}${swatch('#D1D5DB', '진한 선')}${swatch('#6B7280', '흐린 글자')}${swatch('#374151', '보조 글자')}${swatch('#111827', '글자')}</ul>
    <p class="rl">강조와 상태</p>
    <ul class="sws">${swatch('#2563EB', '강조')}${swatch('#EAF1FE', '강조 옅게')}${swatch('#15803D', '늘어남')}${swatch('#C2410C', '줄어듦')}${swatch('#B45309', '주의')}</ul>
    <p class="rl">차트</p>
    <div class="ramp-row"><div><div class="ramp">${['#DBE7FD', '#B4CDFA', '#8DB0F4', '#2563EB', '#1D4ED8'].map((h) => `<span style="background:${h}"></span>`).join('')}</div><p class="t-caption muted">크기는 파랑 한 줄 (옅음 → 진함)</p></div>
    <div><div class="ramp cat">${['#2563EB', '#0F766E', '#B45309', '#6D28D9', '#6B7280'].map((h) => `<span style="background:${h}"></span>`).join('')}</div><p class="t-caption muted">항목 구분은 5색까지</p></div>
    <div><div class="ramp one"><span style="background:#9CA3AF"></span></div><p class="t-caption muted">지난 기간은 회색</p></div></div>
  </div>
  <div class="cell" style="grid-column:1/5"><h3 class="rh">간격 <span>이 9단계만 씁니다</span></h3>
    <ul class="space">${[4, 8, 12, 16, 24, 32, 48, 64, 96].map((v) => `<li><span class="num">${v}</span><i style="width:${v * 2}px"></i></li>`).join('')}</ul>
    <p class="t-small muted mt8">단추 높이 32 · 36 · 44(휴대폰) · 화면 여백 24 (휴대폰 16) · 12칸 격자</p>
  </div>
  <div class="cell" style="grid-column:5/8"><h3 class="rh">모서리 <span>둥글기는 작게</span></h3>
    <ul class="radius">
      <li><span class="btn btn-primary">구글로 시작하기</span><span class="t-small muted"><b class="num">4px</b> 단추 · 칩 · 패널</span></li>
      <li><span class="tipx">준비 중</span><span class="t-small muted"><b class="num">8px</b> 떠 있는 메뉴 · 말풍선 · 창</span></li>
      <li><span class="sq0"></span><span class="t-small muted"><b class="num">0</b> 띠 · 표</span></li>
    </ul>
    <p class="t-small muted mt12">상자 안에 상자를 넣지 않고, 선 한 줄로 나눕니다. 그림자는 떠 있는 것에만.</p>
  </div>
  <div class="cell" style="grid-column:8/13"><h3 class="rh">차트 <span>처방별 환자 수 · 단위 명 · 예시</span></h3>
    <div class="spec-chart">${specimenChart(460, 180)}<ul class="t-small ink2 chart-rules"><li><i class="sw sw-prev"></i>그 전 주는 회색</li><li><i class="sw sw-new"></i>지난주는 파랑</li><li><i class="sw sw-hatch"></i>끝나지 않은 기간은 빗금 ‘집계 중’</li><li>가로 눈금선만, 단위와 이름은 늘 적기</li><li>값은 막대 위에 바로, 움직임 없음</li></ul></div>
  </div>
</div>
</div></section>`

// ── page sections
const landing = `
<section class="p-sec" id="landing"><div class="wrap">
${secHead('01', '랜딩', '처음 들어오는 소개 화면. 같은 모양 상자의 반복을 걷어 내고 대시보드를 앞에 둡니다.')}
${notes([
  ['제목 바로 아래 시작 단추.', '제목을 왼쪽에 두고 [구글로 시작하기]를 바로 밑에 붙였습니다. 눈이 위에서 아래로 한 번에 내려갑니다.'],
  ['진짜 같은 대시보드 미리보기.', '실제 대시보드와 같은 그래프 부품에 ‘예시 숫자’라고 적었습니다. 2.6초마다 바뀌던 숫자 움직임은 없앴습니다.'],
  ['반복되던 상자 29개를 정리.', '약속·단계는 2단 목록으로, 정형외과 4가지는 비교표 한 장으로 바꿨습니다. 구역마다 테두리 상자는 많아야 1개입니다.'],
  ['빈칸을 자연스러운 문구로.', '[금액]은 예시 금액, [직원 A]는 ‘직원 1’, [지난달]은 ‘9월’로 채웠습니다. 서비스 이름이 정해질 때까지 로고만 보입니다. 휴대폰 위쪽 메뉴는 한 줄입니다.'],
], 'cols4')}
<div class="grid mt32">
  ${at('1/3', now('landing-1440.jpg', '지금 랜딩 PC 화면 전체', '지금 · PC 전체 길이') + '<p class="t-small muted mt12">지금: PC 5,286px, 휴대폰 약 8.4화면</p>', 'half')}
  ${at('3/11', pc(S.landingPC(), '랜딩 PC'))}
  ${at('11/13', phone(S.landingPhone(), '랜딩 휴대폰', '', true) + '<p class="t-small muted mt12" id="landing-len">점선 = 휴대폰 한 화면 (844px)</p>', 'half')}
</div>
</div></section>`

const login = `
<section class="p-sec" id="login"><div class="wrap">
${secHead('02', '로그인', '왼쪽은 할 일 하나, 오른쪽은 들어가면 보게 될 화면.')}
<div class="grid">
  ${at('1/4', notes([
    ['가장자리를 한 줄에.', '로고와 제목, 단추의 왼쪽 끝을 같은 선에 맞췄습니다. 지금은 로고(왼쪽 24px)와 글(240px)이 따로 놉니다.'],
    ['영어 SIGN IN과 칩 4개를 뺐습니다.', '오른쪽 미리보기가 무엇을 하는 곳인지 대신 보여 줍니다. 빈 바탕이 60%이던 문제도 함께 풀립니다.'],
    ['구글 단추는 흰 바탕 + 구글 G 마크.', '검은 단추 안 흰 네모에 G를 넣던 모양 대신, 구글이 권하는 모양을 씁니다.'],
  ]) + `<div class="mt32">${now('login-1440.jpg', '지금 로그인 PC 화면')}</div>`)}
  ${at('4/11', pc(S.loginPC(), '로그인 PC'))}
  ${at('11/13', phone(S.loginPhone(), '로그인 휴대폰') + '<p class="t-small muted mt12">휴대폰은 미리보기를 빼고 단추가 첫 화면 위쪽에 옵니다.</p>')}
</div>
</div></section>`

const signup = `
<section class="p-sec" id="signup"><div class="wrap">
${secHead('03', '가입 신청', '폭 480px 한 줄 양식. 상자 테두리 없이 칸만 남깁니다.')}
<div class="grid">
  ${at('1/8', pc(S.authPC(S.signupBody(false, true)), '가입 신청 PC'))}
  ${at('8/10', phone(S.authPhone(S.signupBody(true), 893), '가입 신청 휴대폰'), 'half')}
  ${at('10/13', notes([
    ['양식을 감싸던 상자를 뺐습니다.', '칸 이름과 입력란만 남아 더 가볍고, 위쪽 로고와 왼쪽 끝이 맞습니다.'],
    ['단계는 번호로.', '1✓ · 2 · 3으로 지금 어디쯤인지 바로 보입니다.'],
    ['‘다른 계정으로 로그인’은 왼쪽 정렬.', '가운데 홀로 떠 있던 링크를 양식 왼쪽 끝에 맞췄습니다.'],
  ]) + `<div class="mt32">${now('signup-1440.jpg', '지금 가입 신청 PC 화면')}</div>`, 'half')}
</div>
</div></section>`

const pending = `
<section class="p-sec" id="pending"><div class="wrap">
${secHead('04', '승인 대기 · 거절', '상태 한 줄, 신청 내용, 단추 하나.')}
<div class="grid">
  ${at('1/7', pc(S.authPC(S.pendingBody(false, true), 720), '승인 대기 PC'), 'half')}
  ${at('7/13', pc(S.authPC(S.rejectedBody(false, true), 720), '거절 PC').replace('<b>개편 후</b> · PC 1440', '<b>개편 후</b> · 거절 · PC 1440'), 'half')}
  ${at('1/5', notes([
    ['상태는 제목 위 한 줄.', '‘승인 대기’ ‘승인되지 않음’ 표시를 제목 위에 둡니다. 아이콘 때문에 제목이 밀리던 문제가 없어집니다.'],
    ['신청 내용은 선으로만 나눕니다.', '무거운 상자 대신 줄 구분선을 씁니다.'],
    ['로그아웃은 위쪽 한 곳.', '지금은 2~3번 보이던 로그아웃을 한 번만 둡니다. 아래 단추는 하나만 남깁니다.'],
    ['[이메일 주소] 빈칸을 바꿨습니다.', '‘신청을 검토한 관리자에게 문의해 주세요’로 적고, 거절 화면의 ‘다른 계정으로 로그인’은 그대로 둡니다.'],
  ]))}
  ${at('5/7', phone(S.authPhone(S.pendingBody(true)), '승인 대기 휴대폰'), 'half')}
  ${at('7/9', phone(S.authPhone(S.rejectedBody(true)), '거절 휴대폰').replace('<b>개편 후</b> · 휴대폰 390', '<b>거절</b> · 휴대폰'), 'half')}
  ${at('9/13', `<div class="now-pair">${now('pending-1440.jpg', '지금 승인 대기 PC 화면', '지금 · 승인 대기')}${now('rejected-1440.jpg', '지금 거절 PC 화면', '지금 · 거절')}</div>`)}
</div>
</div></section>`

const dashboard = `
<section class="p-sec" id="dashboard"><div class="wrap">
${secHead('05', '대시보드', '숫자와 그래프가 중심. 위쪽 가로 탭은 그대로 두고 화면을 내려도 위에 붙어 있게 합니다.')}
<div class="grid">
  ${at('1/10', notes([
    ['맨 위 한 줄에 핵심 숫자 4개.', '환자 수·신환·재진·신환율과 그 전 주 대비 ▲▼, 최근 7주 흐름(작은 선)을 함께 봅니다.'],
    ['끝나지 않은 이번 주는 빗금 ‘집계 중’.', '주가 덜 끝나 숫자가 적은데 줄어든 것처럼 보이지 않게 합니다. 추석·한글날 같은 쉬는 날도 눈금 아래 적습니다.'],
    ['재방문율과 처방별 표.', '7일·14일 재방문율, 처방마다 지난주 막대와 그 전 주 눈금(회색), 증감, 신환율·재진율을 한 표에 둡니다.'],
    ['동네별 환자 순위.', '많은 동네부터 막대로 줄 세우고, ‘주소 없음’은 회색으로 맨 아래에 둡니다.'],
  ], 'cols2'))}
  ${at('10/13', now('dashboard-1440.jpg', '지금 대시보드 PC 화면'))}
</div>
<div class="state-h mt48"><span class="chip chip-accent">A</span><h3>데이터 연결 후 모습 (예시)</h3><p>모든 숫자는 예시입니다. 실제 화면에는 파일을 올리기 전까지 나오지 않습니다.</p></div>
<div class="grid mt16">
  ${at('1/13', pc(S.dashboardPC(), '대시보드 데이터 연결 후 PC (예시)'))}
</div>
<div class="grid mt32">
  ${at('1/4', phone(S.dashboardPhone(), '대시보드 휴대폰 (예시)') + '<p class="t-small muted mt12">휴대폰: 핵심 숫자 2×2 → 그래프 → 목록 순서. 탭 줄은 옆으로 밀어 봅니다.</p>')}
  ${at('4/13', `<div class="state-h"><span class="chip">B</span><h3>지금 실제 화면 (데이터 없음)</h3><p>같은 틀 안에 조용한 빈 화면. 가짜 숫자는 보이지 않고, 파일 올리기는 ‘준비 중’으로 막아 둡니다.</p></div>
  <div class="grid inner mt16">${at('1/7', pc(S.dashboardPC({ empty: true }), '대시보드 지금 실제 화면 PC'))}${at('7/10', phone(S.dashboardPhone({ empty: true }), '대시보드 지금 실제 화면 휴대폰'), 'half')}</div>`)}
</div>
</div></section>`

const admin = `
<section class="p-sec" id="admin"><div class="wrap">
${secHead('06', '관리자', '가입 신청 목록. 표를 화면에 바로 놓고 단추를 가볍게.')}
<div class="grid">
  ${at('1/10', notes([
    ['표를 상자에서 꺼냈습니다.', '안쪽 여백 틀 없이 화면 폭 그대로 놓아 줄이 넓고 읽기 쉽습니다.'],
    ['[승인]은 파란 테두리, [거절]은 회색 테두리.', '줄마다 검은 단추가 튀던 문제가 사라지고, 누를 곳은 그대로 분명합니다.'],
    ['탭 옆 숫자는 글자로.', '‘대기 3’처럼 칩 없이 씁니다. 휴대폰은 한 줄 요약과 작은 단추로 줄여 한 화면에 3건이 다 보입니다.'],
  ], 'cols3'))}
  ${at('10/13', now('admin-1440.jpg', '지금 관리자 PC 화면'))}
</div>
<div class="grid mt32">
  ${at('1/10', pc(S.adminPC(), '관리자 PC'))}
  ${at('10/13', phone(S.adminPhone(), '관리자 휴대폰'))}
</div>
</div></section>`

const intro = `
<section class="intro"><div class="wrap grid">
  <div class="cell" style="grid-column:1/8">
    <p class="t-small strong accent">화면 개편 시안 · 2026년 10월 30일</p>
    <h1>믿고 보는 병원 데이터 서비스처럼, 모든 화면을 한 규칙으로 다시 그립니다</h1>
    <ul class="sum">
      <li>글자 크기, 간격, 색을 한 벌로 맞춥니다. 화면마다 제각각이던 모양과 둥근 상자 반복이 사라집니다.</li>
      <li>대시보드는 숫자와 그래프가 중심이 됩니다. 아래 ‘예시’는 자료를 올린 뒤의 모습이고, 지금 실제 화면은 숫자 없이 조용히 비어 있습니다.</li>
      <li>소개 화면(랜딩)은 휴대폰에서 지금의 절반 남짓으로 짧아지고, 로그인·가입·승인 대기·관리자 화면은 줄을 맞추고 단추를 정리합니다.</li>
      <li>기능, 데이터 처리 방식, 화면 주소는 그대로입니다. 보이는 모양만 바뀝니다.</li>
    </ul>
  </div>
  <div class="cell" style="grid-column:9/13">
    <dl class="decided">
      <div><dt>이미 정한 것</dt><dd>위쪽 가로 탭 유지 (화면을 내려도 고정)</dd><dd>글꼴 Pretendard</dd><dd>로고 C③ 그대로</dd><dd>실제 대시보드에는 가짜 숫자 없음</dd></div>
      <div><dt>보는 방법</dt><dd>각 화면을 누르면 실제 크기로 크게 봅니다.</dd><dd>파란 번호는 옆 설명의 번호와 같습니다.</dd></div>
    </dl>
  </div>
</div></section>`

const nextStep = `
<section class="p-sec" id="next"><div class="wrap grid">
  <div class="cell" style="grid-column:1/6"><h2 class="t-heading">이 방향이 괜찮으면</h2></div>
  <div class="cell" style="grid-column:6/13"><ol class="nextlist">
    <li><b>디자인 규칙 문서부터 고칩니다.</b> 글자·색·간격 규칙을 한곳에 정리합니다.</li>
    <li><b>화면을 차례로 바꿉니다.</b> 랜딩 → 로그인·가입·승인 대기 → 관리자 → 대시보드 틀과 그래프 부품.</li>
    <li><b>단계마다 PC·휴대폰 화면을 찍어 보여 드립니다.</b> 파일 올리기 연결은 다음 일로 따로 정합니다.</li>
  </ol></div>
</div></section>`

// ── CSS
const css = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8')
const js = fs.readFileSync(new URL('./page.js', import.meta.url), 'utf8')

const body = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
<pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="6" height="6" fill="#FFFFFF"/><rect width="1.6" height="6" fill="${C.accent}"/></pattern>
<pattern id="hatchSoft" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="6" height="6" fill="#FFFFFF"/><rect width="1" height="6" fill="#D1D5DB"/></pattern>
</defs></svg>
<header class="bar"><div class="wrap bar-in"><a class="brand" href="#top">${logo(22)}<span>B2B 개편 시안</span></a>
<nav aria-label="화면 바로 가기"><a href="#rules">규칙</a><a href="#landing">랜딩</a><a href="#login">로그인</a><a href="#signup">가입 신청</a><a href="#pending">승인 대기</a><a href="#dashboard">대시보드</a><a href="#admin">관리자</a></nav></div></header>
<main id="top">${intro}${rules}${landing}${login}${signup}${pending}${dashboard}${admin}${nextStep}</main>
<footer class="pfoot"><div class="wrap row sb"><span class="t-caption muted">B2B 개편 시안 · 화면의 병원 이름·사람·숫자는 모두 예시입니다.</span><span class="t-caption muted">글꼴 Pretendard (SIL OFL 1.1)</span></div></footer>
<dialog id="zoom" aria-labelledby="zt"><div class="zh"><b id="zt">크게 보기</b><button type="button" class="btn btn-secondary btn-sm" id="zc">닫기</button></div><div class="zb"></div></dialog>`

// ── fonts: keep only the Pretendard Variable subsets whose unicode-range touches characters on this page
const fontCss = fs.readFileSync(FONT_DIR + '/pretendardvariable-dynamic-subset.css', 'utf8')
const blocks = [...fontCss.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => m[1])
const docText = body + css + js
const used = new Set([...docText].map((c) => c.codePointAt(0)))
const faces = []
let fontBytes = 0
for (const b of blocks) {
  const file = b.match(/url\(\.\/woff2-dynamic-subset\/([^)]+)\)/)[1]
  const ranges = b.match(/unicode-range:\s*([^;]+);/)[1].split(',').map((r) => r.trim().replace(/^U\+/i, ''))
  const hit = ranges.some((r) => {
    const [a, z] = r.split('-').map((h) => parseInt(h, 16))
    for (const cp of used) if (cp >= a && cp <= (z ?? a)) return true
    return false
  })
  if (!hit) continue
  const b64 = fs.readFileSync(`${FONT_DIR}/woff2-dynamic-subset/${file}`).toString('base64')
  fontBytes += b64.length
  faces.push(`@font-face{font-family:'Pretendard Variable';font-style:normal;font-display:swap;font-weight:45 920;src:url(data:font/woff2;base64,${b64}) format('woff2');unicode-range:${ranges.map((r) => 'U+' + r).join(',')}}`)
}
const ofl = fontCss.match(/^\/\*[\s\S]*?\*\//)[0]

const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>B2B 개편 시안</title>
<style>
${ofl}
${faces.join('\n')}
${css}
</style></head>
<body>${body}
<script>${js}</script>
</body></html>`
fs.writeFileSync(OUT + '/index.html', html)
console.log('html', (html.length / 1024).toFixed(0) + 'KB', 'font files', faces.length, (fontBytes / 1024).toFixed(0) + 'KB')
