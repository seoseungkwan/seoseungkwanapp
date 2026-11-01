import fs from 'node:fs'
import { C } from './parts.mjs'
import * as S from './screens.mjs'

const DIR = new URL('.', import.meta.url).pathname
const fonts = fs.readFileSync(DIR + 'fonts.css', 'utf8')
const base = fs.readFileSync(DIR + 'base.css', 'utf8')

// ── figures
const frame = (w, html, { vh = 0 } = {}) => `<div class="screen${vh ? ' scroll' : ''}" data-w="${w}"${vh ? ` data-vh="${vh}"` : ''}><div class="sizer"><div class="vp" style="width:${w}px">${html}</div></div></div>`
const fig = (kind, title, html, { vh = 0, state = '' } = {}) => {
  const ph = kind === 'ph'
  return `<figure class="fig ${ph ? 'fig-ph' : 'fig-pc'}">
  <figcaption class="cap"><span class="cap-l"><b>${ph ? '휴대폰' : '컴퓨터'}</b><span class="muted">폭 ${ph ? 390 : 1440}${state ? ` · ${state}` : ''}</span></span><button type="button" class="zoom">크게 보기</button></figcaption>
  <p class="btab" title="브라우저 탭에 보이는 이름"><span class="btab-k">탭 이름</span>${title}</p>
  ${frame(ph ? 390 : 1440, html, { vh })}
</figure>`
}
const pair = (title, phone, pc, o = {}) => `<div class="c-row">${fig('ph', title, phone, { vh: o.vh, state: o.phState })}${fig('pc', title, pc, { vh: o.vh, state: o.pcState })}</div>`
const notes = (items) => `<h3 class="nb-t">무엇이 달라졌나</h3><ul class="nb">${items.map((t) => `<li><span>${t}</span></li>`).join('')}</ul>`
const score = (now, after) => `<span class="score"><span class="s-now">지금 <b class="num">${now}점</b></span><span class="s-arrow" aria-hidden="true">→</span><span class="s-aft">고친 뒤 <b class="num">${after}점</b></span></span>`
const sec = (n, idName, name, now, after, lead, body) => `<section class="sec" id="${idName}" aria-labelledby="${idName}-h"><div class="wrap">
  <div class="sec-h"><span class="sec-n num">${n}</span><h2 id="${idName}-h">${name}</h2>${score(now, after)}</div>
  <p class="sec-p">${lead}</p>
  ${body}
</div></section>`

const SCORES = [
  ['landing', '랜딩', '처음 소개 화면', 76, 91],
  ['login', '로그인', '', 76, 92],
  ['signup', '가입', '3단계 가입 신청', 76, 91],
  ['pending', '승인 대기 · 가입 거절', '', 76, 92],
  ['notfound', '없는 주소 화면', '', 32, 91],
]
const T = (name) => `${name} · 병원 업무 도구`

const landing = sec(1, 'landing', '랜딩', 76, 91,
  '누구나 처음 보는 소개 화면이에요. 앱에 실제로 있는 것만 보여 주고, 읽기 쉽게 다듬었어요. 두 화면 모두 안에서 위아래로 밀어 볼 수 있어요.',
  notes([
    '기능 목록 맨 앞에 지금 쓸 수 있는 <b>청구 · 삭감 예방 사전점검</b>을 두고, 아직 없는 기능에는 <b>준비 중</b> 표시를 붙였어요. 앱에 없는 채팅은 뺐어요.',
    '미리보기 탭을 실제 앱 탭 순서 그대로 바꾸고, 흐리던 탭 글자를 읽기 쉬운 회색으로 진하게 했어요.',
    '보고 칸 아래 큰 빈 공간을 없앴어요. "한 화면에서", "병원 PC"는 줄 끝에서 끊기지 않고, 기능 번호는 01부터 차례대로예요.',
    '휴대폰 안내 글을 한 단계 키웠어요(14 → 16). 기능 설명도 13 → 14, 맨 위 소개 줄도 13 → 14. 휴대폰 그래프 날짜는 하나 걸러 보여 겹치지 않아요.',
    '말투를 모두 "~요"로 맞추고, 영어 줄임말은 "재방문"으로 바꿨어요. 키보드로 들어오면 맨 위에 <b>본문으로 건너뛰기</b>가 나타나요.',
    '단추를 누르면 색이 바뀌고 살짝 눌려요. 지금 규칙 "랜딩은 움직이지 않는다"를 바꾸는 일이라 맨 아래 <a href="#decide">정해 주실 것</a>에서 골라 주세요.',
  ]) +
  `<p class="kb-row"><button type="button" class="kb-btn" id="kb-toggle" aria-pressed="false">키보드로 들어온 모습 보기</button><span class="t-small muted">누르면 화면 맨 위에 건너뛰기 단추가 보여요</span></p>` +
  pair(T('숫자로 보는 우리 의원'), S.landingPhone(), S.landingPC(), { vh: 760 }))

const login = sec(2, 'login', '로그인', 76, 92,
  '구글 계정으로 들어오는 화면이에요. 단추를 눌러 보면 눌린 모습과 기다리는 글자가 보여요.',
  notes([
    '로고를 누르면 처음 소개 화면으로 돌아가요.',
    '[구글로 시작하기]를 누르면 색이 바뀌고 살짝 눌리며, "구글로 넘어가는 중…"으로 바뀌어 눌렸는지 알 수 있어요.',
    '아래 승인 안내 글자를 12 → 13으로 키우고, 말투를 "~요"로 맞췄어요.',
    '오른쪽 소개 글과 미리보기 탭을 실제 앱에 맞췄어요. 없는 급여 대신 지금 쓰는 청구 사전점검을 말해요.',
    '브라우저 탭 이름이 화면마다 달라져요. 여기서는 "로그인 · 병원 업무 도구"예요.',
  ]) +
  pair(T('로그인'), S.authPhone(S.loginPhone()), S.loginPC()))

const signup = sec(3, 'signup', '가입', 76, 91,
  '처음 로그인한 사람이 신청서를 보내는 화면이에요(3단계 중 2단계). 칸에 직접 적어 보고 [가입 신청]을 눌러 볼 수 있어요.',
  notes([
    '"병원 이름" 칸을 "의원 이름"으로 바꿨어요. 앱 다른 곳과 같은 말이에요.',
    '[가입 신청]을 누르면 "보내는 중…"이 보이고 잠시 눌리지 않아요. 두 번 보내는 일이 없어요.',
    '로고를 누르면 처음 소개 화면으로 돌아가요.',
    '도움말과 동의 문구를 "~요" 말투로 맞췄어요.',
    '브라우저 탭 이름은 "가입 신청 · 병원 업무 도구"예요.',
  ]) +
  pair(T('가입 신청'), S.authPhone(S.signupBody(true)), S.authPC(S.signupBody(false), 1000)))

const pending = sec(4, 'pending', '승인 대기 · 가입 거절', 76, 92,
  '신청을 보낸 뒤 승인을 기다리는 화면과, 승인되지 않았을 때 보는 화면이에요.',
  notes([
    '안내 글이 "[상태 다시 확인]을 눌러 확인하세요"로 바뀌어, 글과 단추가 같은 말을 해요.',
    '[상태 다시 확인]을 누르면 "확인 중…" 뒤에 <b>아직 승인 전이에요 · 오후 2:31 확인</b>처럼 결과와 시각이 떠요. 눌러도 아무 일 없어 보이던 문제가 없어져요.',
    '두 번 나오던 신청일은 위 한 줄에만 남겼어요. "병원 이름"은 "의원 이름"으로 바꿨어요.',
    '거절 화면에 관리자 메일을 보여 줘서 어디에 물어볼지 바로 알 수 있어요. 지금은 예시 주소이고, 실제 주소는 나중에 넣어요.',
    '로고를 누르면 처음 소개 화면으로 돌아가요. 브라우저 탭 이름은 "승인 대기", "가입 승인 안 됨"으로 나뉘어요.',
  ]) +
  `<h3 class="state-t">승인 대기</h3>` +
  pair(T('승인 대기'), S.authPhone(S.pendingBody(true)), S.authPC(S.pendingBody(false, true)), { phState: '처음 모습', pcState: '[상태 다시 확인]을 누른 뒤' }) +
  `<h3 class="state-t">가입 거절</h3>` +
  pair(T('가입 승인 안 됨'), S.authPhone(S.rejectedBody(true)), S.authPC(S.rejectedBody(false))))

const notfound = sec(5, 'notfound', '없는 주소 화면', 32, 91,
  '주소를 잘못 적었거나 없어진 화면에 들어왔을 때 보는 화면이에요. 지금은 영어로 된 기본 화면(빈 바탕에 숫자 404와 영어 한 줄)이 떠서 어디로 가야 할지 알 수 없어요.',
  notes([
    '영어 기본 화면 대신 우리 디자인으로 <b>찾는 화면이 없어요</b>가 떠요.',
    '로그인 전에는 [처음 화면으로]와 [로그인], 로그인 뒤에는 위 탭과 [대시보드로 가기]가 있어 바로 돌아갈 수 있어요.',
    '열려던 주소를 보여 줘서 어디를 잘못 적었는지 알 수 있어요.',
    '로그인 뒤 화면은 앱 틀(위 띠와 탭)이 그대로라, 다른 화면과 똑같이 움직일 수 있어요.',
    '브라우저 탭 이름은 "찾는 화면이 없어요 · 병원 업무 도구"예요.',
  ]) +
  `<h3 class="state-t">로그인 전</h3>` +
  pair(T('찾는 화면이 없어요'), S.authPhone(S.notFoundOut(true)), S.authPC(S.notFoundOut(false))) +
  `<h3 class="state-t">로그인 뒤 (앱 안)</h3>` +
  pair(T('찾는 화면이 없어요'), S.notFoundIn(true), S.notFoundIn(false)))

const summary = `<table class="sum">
  <caption class="sr-only">화면별 점수</caption>
  <thead><tr><th scope="col">화면</th><th scope="col" class="n">지금</th><th scope="col" class="n">고친 뒤</th></tr></thead>
  <tbody>${SCORES.map(([idn, name, sub, now, after]) => `<tr><th scope="row"><a href="#${idn}">${name}</a>${sub ? `<span class="sub">${sub}</span>` : ''}</th><td class="n now num">${now}점</td><td class="n aft num">${after}점</td></tr>`).join('')}</tbody>
</table>`

const decide = `<section class="decide-wrap" id="decide" aria-labelledby="decide-h"><div class="wrap">
  <div class="decide">
    <h2 id="decide-h">정해 주실 것</h2>
    <ol class="dl-list">
      <li><p class="q">랜딩 단추 누름 반응을 허용할지 <span class="chip chip-warn">규칙 바뀜</span></p>
      <p>지금 규칙은 "랜딩은 움직이지 않는다"예요. 허용하시면 랜딩·로그인·가입 화면 단추도 앱 안처럼 누를 때 0.15초 동안 색이 바뀌고 살짝 눌려요. 기다리는 동안 "보내는 중…", "확인 중…"도 보여요.</p>
      <p>이 시안을 승인하시면 이 규칙 변경도 함께 승인한 것으로 봐요. 랜딩만 지금처럼 두고 싶으시면 <b class="say">랜딩은 그대로</b>라고 말씀해 주세요. 그러면 로그인·가입 화면에만 반응을 넣어요.</p></li>
    </ol>
  </div>
  <p class="foot">시안 속 숫자, 이름, 메일 주소는 모두 예시예요. 실제 관리자 메일은 나중에 정해서 넣어요. 화면 아래 바닥글은 이번에 바꾸지 않아요.</p>
</div></section>`

const pageCss = `
/* page: one reading column of sections; each has a score badge, plain notes, and phone/PC drawings scaled from their design width.
   Same tokens as the app (light only, on purpose). Press reaction 150ms. */
:root { --warn-soft: #FDF4E3; }
html { background: var(--surface); scroll-padding-top: 16px; }
body { background: var(--surface); color: var(--ink); font-variant-numeric: tabular-nums; }
.wrap { max-width: 1280px; margin: 0 auto; padding: 0 16px; }
.nw { white-space: nowrap; }
.blk { display: block; }
.intro { padding: 32px 0 40px; }
.eyebrow { font-size: 13px; line-height: 20px; font-weight: 600; color: var(--accent); }
.intro h1 { margin-top: 8px; font-size: 32px; line-height: 40px; font-weight: 600; letter-spacing: -0.02em; text-wrap: balance; }
.intro .lead { margin-top: 12px; font-size: 16px; line-height: 26px; color: var(--ink2); max-width: 40em; }
.sum { margin-top: 24px; width: 100%; max-width: 520px; border-collapse: collapse; }
.sum th, .sum td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); font-size: 15px; line-height: 24px; }
.sum tr > :first-child { padding-left: 0; } .sum tr > :last-child { padding-right: 0; }
.sum thead th { font-size: 13px; line-height: 20px; font-weight: 500; color: var(--muted); border-bottom-color: var(--ink); }
.sum tbody th { font-weight: 500; }
.sum .sub { display: block; font-size: 13px; line-height: 20px; color: var(--muted); font-weight: 400; }
.sum .n { text-align: right; width: 88px; }
.sum .now { color: var(--muted); }
.sum .aft { font-weight: 600; color: var(--accent-dark); }
.sum a { color: var(--ink); text-decoration: none; text-underline-offset: 3px; }
.sum a:hover { text-decoration: underline; }
.intro .note { margin-top: 12px; font-size: 13px; line-height: 20px; color: var(--muted); }
.sec { border-top: 1px solid var(--line); padding: 40px 0 48px; scroll-margin-top: 8px; }
.sec-h { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.sec-n { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 4px; background: var(--ink); color: #fff; font-size: 14px; font-weight: 600; }
.sec-h h2 { font-size: 24px; line-height: 32px; font-weight: 600; letter-spacing: -0.01em; }
.score { display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 4px; font-size: 14px; color: var(--ink2); white-space: nowrap; }
.score b { font-weight: 600; }
.s-now b { color: var(--muted); }
.s-arrow { color: var(--muted); }
.s-aft b { color: var(--accent-dark); }
.sec-p { margin-top: 12px; font-size: 16px; line-height: 26px; color: var(--ink2); max-width: 44em; }
.nb-t { margin-top: 24px; font-size: 16px; line-height: 24px; font-weight: 600; }
.nb { margin-top: 8px; border-top: 1px solid var(--line); max-width: 860px; }
.nb li { display: grid; grid-template-columns: 16px 1fr; gap: 8px; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 15px; line-height: 24px; color: var(--ink2); }
.nb li::before { content: ''; width: 6px; height: 6px; margin: 9px 0 0 4px; background: var(--accent); border-radius: 1px; }
.nb b { color: var(--ink); font-weight: 600; }
.nb a { color: var(--accent); font-weight: 500; text-underline-offset: 3px; }
.kb-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin-top: 16px; }
.kb-btn { height: 36px; padding: 0 14px; border: 1px solid var(--line-strong); border-radius: 4px; background: var(--surface); color: var(--ink); font: 500 14px/20px var(--font); cursor: pointer; transition: background-color 150ms, border-color 150ms, transform 150ms; }
.kb-btn:hover { background: var(--canvas); }
.kb-btn:active { transform: translateY(1px); }
.kb-btn[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-dark); }
.state-t { margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--line); font-size: 18px; line-height: 26px; font-weight: 600; }
.c-row { display: flex; flex-wrap: wrap; gap: 24px 32px; align-items: flex-start; margin-top: 24px; }
.state-t + .c-row { margin-top: 12px; }
.fig { margin: 0; min-width: 0; }
.fig-ph { flex: 0 1 392px; }
.fig-pc { flex: 1 1 520px; }
.cap { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 32px; font-size: 13px; line-height: 20px; color: var(--muted); }
.cap-l { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; }
.cap b { color: var(--ink); font-weight: 600; font-size: 14px; }
.zoom { flex: none; height: 44px; margin: -6px -4px; padding: 0 4px; border: 0; background: none; color: var(--accent); font: 500 14px/20px var(--font); cursor: pointer; text-underline-offset: 3px; }
.zoom:hover { text-decoration: underline; }
.btab { display: flex; align-items: center; gap: 8px; min-width: 0; height: 30px; margin-top: 4px; padding: 0 10px; border: 1px solid var(--line-strong); border-bottom: 0; border-radius: 4px 4px 0 0; background: var(--canvas); font-size: 13px; line-height: 20px; color: var(--ink); overflow: hidden; white-space: nowrap; }
.btab-k { flex: none; font-size: 12px; color: var(--muted); padding-right: 8px; border-right: 1px solid var(--line-strong); }
.screen { position: relative; overflow: hidden; border: 1px solid var(--line-strong); border-radius: 0 0 4px 4px; background: var(--canvas); }
.screen.scroll { overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; scrollbar-width: thin; }
.sizer { position: relative; overflow: hidden; }
.vp { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
.decide-wrap { border-top: 1px solid var(--line); padding: 40px 0 64px; }
.decide { max-width: 860px; padding: 20px 24px 24px; border: 1px solid var(--accent); border-radius: 4px; background: var(--accent-soft); }
.decide h2 { font-size: 22px; line-height: 30px; font-weight: 600; }
.dl-list { margin-top: 12px; }
.dl-list li { display: grid; gap: 8px; font-size: 15px; line-height: 24px; color: var(--ink2); }
.dl-list .q { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; font-size: 17px; line-height: 26px; font-weight: 600; color: var(--ink); }
.dl-list .q::before { content: '1'; display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 4px; background: var(--accent); color: #fff; font-size: 13px; }
.say { font-weight: 600; color: var(--ink); }
.decide-wrap .foot { margin-top: 16px; font-size: 13px; line-height: 20px; color: var(--muted); max-width: 860px; }
.toast { position: fixed; left: 50%; bottom: 24px; z-index: 50; max-width: calc(100vw - 32px); padding: 10px 16px; border-radius: 8px; background: var(--ink); color: #fff; font-size: 14px; line-height: 20px; font-weight: 500; box-shadow: 0 1px 2px rgb(17 24 39 / 0.06), 0 6px 16px rgb(17 24 39 / 0.1); transform: translate(-50%, 8px); opacity: 0; pointer-events: none; transition: opacity 150ms, transform 150ms; }
.toast.on { transform: translate(-50%, 0); opacity: 1; }
.toast b { color: #8DB0F4; font-weight: 600; margin-right: 6px; }
#zoom { width: calc(100vw - 16px); max-width: 1480px; height: calc(100% - 32px); max-height: none; padding: 0; border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 1px 2px rgb(17 24 39 / 0.06), 0 6px 16px rgb(17 24 39 / 0.1); background: var(--surface); color: var(--ink); }
#zoom::backdrop { background: rgb(17 24 39 / 0.36); }
.zh { height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 6px 0 16px; border-bottom: 1px solid var(--line); }
.zh span { font-weight: 600; }
.zc { height: 44px; padding: 0 16px; border: 1px solid var(--line-strong); border-radius: 4px; background: var(--surface); font: 500 14px/20px var(--font); cursor: pointer; }
.zc:hover { background: var(--canvas); }
.zb { height: calc(100% - 56px); overflow: auto; background: var(--canvas); }
.zb .vp { position: relative; }
@media (min-width: 768px) {
  .wrap { padding: 0 24px; }
  .intro { padding: 56px 0 48px; }
  .intro h1 { font-size: 40px; line-height: 48px; }
  .sec { padding: 56px 0 64px; }
  .sec-h h2 { font-size: 28px; line-height: 36px; }
}

/* ═════ inside the drawings: what changes in the app */
.ui { position: relative; }
.ui button { cursor: pointer; margin: 0; }
.kicker { font-size: 14px; line-height: 22px; font-weight: 600; color: var(--ink2); }
.t-body { font-size: 14px; line-height: 22px; }
/* press reaction (new on landing/auth): 150ms colour change + 1px press-down */
.ui .btn, .ui .link, .ui .tab, .ui .l-nav a, .ui .logo-link, .ui .iconbtn { transition: background-color 150ms, border-color 150ms, color 150ms, opacity 150ms, transform 150ms; }
.ui .btn-primary:hover { background: var(--accent-dark); }
.ui .btn-secondary:hover, .ui .btn-google:hover, .ui .btn-ghost:hover, .ui .iconbtn:hover { background: var(--canvas); }
.ui .btn:active:not(:disabled), .ui .iconbtn:active { transform: translateY(1px); }
.ui .btn:disabled { opacity: 0.6; cursor: progress; }
.ui .l-nav a:hover, .ui .tab:hover { color: var(--ink); }
.ui .link { height: 44px; padding: 0; border: 0; background: none; text-underline-offset: 3px; }
.ui .link:hover { text-decoration: underline; }
.ui .logo-link { display: inline-flex; border-radius: 4px; }
.ui .logo-link:hover { opacity: 0.8; }
.ui .logo-link:focus-visible { outline-offset: -2px; }
.ui .tap { position: relative; }
.ui .tap::after { content: ''; position: absolute; inset: -6px -4px; }
/* skip link: visible on keyboard focus (or the page's keyboard view) */
.skip { position: absolute; left: 16px; top: 10px; z-index: 6; display: inline-flex; align-items: center; height: 36px; padding: 0 14px; border-radius: 4px; background: var(--ink); color: #fff !important; font-size: 14px; font-weight: 500; text-decoration: none; transform: translateY(-64px); }
.skip:focus, body.kb .skip { transform: none; outline: 2px solid var(--accent); outline-offset: 2px; }
/* preview: real tab list, inactive tabs muted (was faint, 2.5:1 → 4.8:1) */
.pv-tabs { position: relative; overflow: hidden; }
.pv-tabs span { color: var(--muted); flex: none; }
.pv-tabs span.cut { display: none; }
/* landing: no empty gap under the report, phone text one step bigger */
.lp .grid12.top { align-items: start; }
.r-items.one { border-top: 1px solid var(--line); margin-top: 16px; }
.r-items.one.ph { margin-top: 12px; }
.lp .l-hero:not(.ph) .t-lead { font-size: 16px; line-height: 26px; }
.lp.ph .t-lead { font-size: 16px; line-height: 24px; }
.lp.ph .l-hero .t-lead { margin-top: 0; }
.flist h3 { font-size: 16px; line-height: 24px; font-weight: 600; }
.flist h3 .chip { font-weight: 500; }
.flist.ph p { font-size: 14px; line-height: 22px; color: var(--ink2); margin-top: 2px; }
.lp .feat { padding-top: 0; }
.lp .feat > .wrap-l { border-top: 1px solid var(--line); padding-top: 96px; }
.lp.ph .feat > .wrap-l { border-top: 0; padding-top: 0; }
.pc-tbl td { vertical-align: top; }
.pc-tbl td:first-child { white-space: nowrap; color: var(--ink2); }
.pc-tbl tr > :nth-child(2) { width: 112px; }
.l-hero.ph .row.t-small { align-items: flex-start; }
.l-hero.ph .row.t-small .ic { margin-top: 3px; }
/* login: 400 column centred in the left half */
.pane-in { margin: 0 auto; }
.pane-l { min-width: 0; }
.auth-form.ph { padding-top: 32px; }
/* auth forms */
.flabel { font-size: 13px; line-height: 20px; font-weight: 600; }
input.inp { width: 100%; font: 400 14px/20px var(--font); color: var(--ink); outline: none; }
input.inp::placeholder { color: var(--faint); }
input.inp:hover { border-color: var(--muted); }
input.inp:focus { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.col480.ph input.inp { font-size: 16px; }
.cb { display: flex; gap: 8px; align-items: flex-start; font-size: 14px; line-height: 22px; }
.cb input { width: 16px; height: 16px; margin: 3px 0 0; accent-color: var(--accent); flex: none; }
.col480.ph .cb { min-height: 44px; }
.result { display: flex; align-items: center; gap: 6px; min-height: 20px; margin-top: 12px; color: var(--ink2); }
.result:empty { margin-top: 0; min-height: 0; }
.result .ic { color: var(--warn); }
.contact { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; padding: 12px 16px; border-radius: 4px; background: var(--canvas); }
.contact .mail { font-weight: 600; color: var(--ink); }
.col480.ph .contact .btn { height: 36px; }
.addr { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
.addr .num { font-size: 14px; color: var(--ink); padding: 2px 6px; border-radius: 4px; background: var(--canvas); }
.btns { display: flex; flex-wrap: wrap; gap: 8px; }
.col480.ph .btns .btn { flex: 1 1 140px; justify-content: center; }
/* app frame (404 inside) */
.app { background: var(--canvas); }
.app .tab { color: var(--ink2); }
.a-tabs { overflow: hidden; }
.tabs-sc { overflow-x: auto; scrollbar-width: none; height: 44px; }
.tabs-sc::-webkit-scrollbar { display: none; }
.a-tabs.ph { overflow: visible; padding: 0; }
.a-tabs.ph .tabs-in { padding: 0 4px; width: max-content; }
.a-hdr.ph .clinic { font-size: 14px; line-height: 22px; }
.a-hdr .row.g12 .logo, .a-hdr .row.g8 .logo { flex: none; }
.main { padding: 24px 0 48px; }
.main.ph { padding: 16px 16px 32px; }
.nf { max-width: 640px; margin: 24px auto 0; padding: 40px 32px; display: flex; flex-direction: column; align-items: center; text-align: center; }
.nf .addr { justify-content: center; }
.main.ph .nf { margin-top: 0; padding: 32px 16px; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; scroll-behavior: auto !important; }
}
`

const js = `
(function () {
  var $ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)) }
  // preview tab rows: real tab list; tabs that do not fully fit are hidden (no clipped words)
  function fitTabs(root) {
    $('[data-fit-tabs]', root).forEach(function (row) {
      var spans = $('span', row), max = row.clientWidth - 16
      spans.forEach(function (s) { s.classList.remove('cut') })
      spans.forEach(function (s) { if (s.offsetLeft + s.offsetWidth > max) s.classList.add('cut') })
    })
  }
  // fit the 1440 / 390 drawings into the page column
  function fit() {
    fitTabs(document)
    $('main .screen').forEach(function (s) {
      var vp = s.querySelector('.vp'), sizer = s.querySelector('.sizer'), w = +s.getAttribute('data-w'), vh = +s.getAttribute('data-vh') || 0
      var k = Math.min(1, s.clientWidth / w)
      vp.style.transform = 'scale(' + k + ')'
      var h = Math.ceil(vp.offsetHeight * k)
      sizer.style.height = h + 'px'
      s.style.height = (vh ? Math.min(vh, h) : h) + 'px'
    })
  }
  fit()
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit)
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(fit, 60) })

  var toast = document.getElementById('toast'), tt
  function say(m) {
    toast.innerHTML = '<b>시안</b>' + m
    toast.classList.add('on'); clearTimeout(tt); tt = setTimeout(function () { toast.classList.remove('on') }, 2600)
  }
  function now() {
    try { return new Date().toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul' }) } catch (e) { return '오후 2:31' }
  }
  // waiting state: label swap + disabled, then back
  function busy(btn, text, ms, done) {
    var lab = btn.querySelector('[data-label]') || btn, keep = lab.innerHTML
    btn.disabled = true; btn.setAttribute('aria-busy', 'true'); lab.textContent = text
    setTimeout(function () { btn.disabled = false; btn.removeAttribute('aria-busy'); lab.innerHTML = keep; if (done) done() }, ms)
  }
  var SAY = {
    start: '누르면 로그인 화면으로 가요',
    nav: '누르면 그 칸으로 내려가요',
    ai: '누르면 아래 AI 분석 칸으로 내려가요',
    home: '로고를 누르면 처음 소개 화면(랜딩)으로 가요',
    skip: '누르면 위 메뉴를 건너뛰고 본문으로 바로 가요',
    logout: '누르면 로그아웃하고 로그인 화면으로 가요',
    login: '누르면 로그인 화면으로 가요',
    dash: '누르면 대시보드로 가요',
    tab: '누르면 그 탭 화면으로 가요',
    acct: '누르면 계정 메뉴가 열려요'
  }
  var CLOCK = '<svg class="ic" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 4.75V8l2.25 1.5"/></svg>'
  document.addEventListener('click', function (e) {
    var z = e.target.closest('.zoom')
    if (z) { openZoom(z.closest('.fig')); return }
    var el = e.target.closest('[data-act]')
    if (!el) return
    var act = el.getAttribute('data-act')
    if (el.tagName === 'A') e.preventDefault()
    if (act === 'google') return busy(el, '구글로 넘어가는 중…', 1600, function () { say('실제로는 구글 로그인 창이 열려요') })
    if (act === 'signup') { e.preventDefault(); return busy(el, '보내는 중…', 1600, function () { say('실제로는 승인 대기 화면으로 넘어가요') }) }
    if (act === 'recheck') {
      var out = el.parentNode.querySelector('[data-result]')
      out.innerHTML = ''
      return busy(el, '확인 중…', 1200, function () { out.innerHTML = CLOCK + '<span>아직 승인 전이에요 · ' + now() + ' 확인</span>' })
    }
    if (act === 'copymail') {
      try { navigator.clipboard.writeText('admin@example.com').catch(function () {}) } catch (err) {}
      var keep = el.textContent; el.textContent = '복사했어요'
      setTimeout(function () { el.textContent = keep }, 2000)
      return
    }
    if (SAY[act]) say(SAY[act])
  })
  document.addEventListener('submit', function (e) { e.preventDefault() })

  // keyboard view: show the skip links
  var kb = document.getElementById('kb-toggle')
  kb.addEventListener('click', function () {
    var on = !document.body.classList.contains('kb')
    document.body.classList.toggle('kb', on); kb.setAttribute('aria-pressed', String(on))
    kb.textContent = on ? '키보드 모습 끄기' : '키보드로 들어온 모습 보기'
  })

  // zoom: the same drawing at full size
  var dlg = document.getElementById('zoom'), zb = dlg.querySelector('.zb'), zt = dlg.querySelector('.zh span')
  function openZoom(f) {
    var vp = f.querySelector('.vp').cloneNode(true)
    vp.style.transform = 'none'
    $('[id]', vp).forEach(function (n) { n.id = n.id + '-z' })
    $('label[for]', vp).forEach(function (n) { n.setAttribute('for', n.getAttribute('for') + '-z') })
    zb.innerHTML = ''; zb.appendChild(vp)
    zt.textContent = f.querySelector('.btab').lastChild.textContent + ' · ' + f.querySelector('.cap b').textContent
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '')
    fitTabs(zb)
  }
  dlg.querySelector('.zc').addEventListener('click', function () { dlg.close ? dlg.close() : dlg.removeAttribute('open') })
})()
`

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UI 90점 시안 — 들어오는 화면</title>
<style>
${fonts}
${base}
${pageCss}
</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="6" height="6" fill="#FFFFFF"/><rect width="1.6" height="6" fill="${C.accent}"/></pattern>
</defs></svg>
<header class="intro"><div class="wrap">
  <p class="eyebrow">시안 · 2026년 10월 31일</p>
  <h1>들어오는 화면 90점 시안</h1>
  <p class="lead">처음 들어오는 다섯 화면을 고친 뒤 모습이에요. 화면마다 휴대폰과 컴퓨터 모습을 나란히 놓았고, 단추는 직접 눌러 볼 수 있어요.</p>
  ${summary}
  <p class="note">점수는 화면 점검표 100점 기준이에요. 이 시안은 실제 앱을 바꾸지 않았어요.</p>
</div></header>
<main>
${landing}
${login}
${signup}
${pending}
${notfound}
${decide}
</main>
<div id="toast" class="toast" role="status" aria-live="polite"></div>
<dialog id="zoom" aria-label="크게 보기"><div class="zh"><span></span><button type="button" class="zc">닫기</button></div><div class="zb"></div></dialog>
<script>${js}</script>
</body>
</html>
`
fs.writeFileSync(DIR + 'index.html', html)
console.log('written', (html.length / 1024).toFixed(0) + ' KB')
