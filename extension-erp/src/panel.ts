// ERP 마감일지 화면 오른쪽 아래의 [비트 값 채우기] 단추와 결과 안내(REQ-3609, design.md 5절).
// 글·모양은 승인된 목업 docs/mockups/erp-closing-fill/ ①~⑪ 그대로다(목업의 노란 띠·점선 표시는 앱에 없다).
// 기본값 (아)·(사)대로 보류 줄(held)을 더하고 미수납 경고 줄의 뒤 문장을 뗐다(design.md 5절, TASK-14).
// 씨암·SONO가 함께 있는 진료 묻기와 채운 뒤 그 줄(OVERLAP_TEXT)은 design.md 5절 글 그대로다(TASK-15, 목업 없이 명세 글로 만듦).
// 채우기 전·뒤 새 안내(FLOW_TEXT·SKIP_TEXT: 오늘 뒤 날짜·진료 0건·읽기 전용·이미 적힌 칸 묻기·맞춰 볼 숫자·까닭별 칸·되돌리기·
// [지난 결과])와 오류 글(errors.ts)은 design.md 5-1·5-2 글 그대로다(TASK-17, 사용자 자동 승인으로 목업 없이 명세 글로 만듦).
// - ERP 화면 글꼴·색이 스며들거나 우리 모양이 ERP를 건드리지 않게 그림자 뿌리 안에 그린다. ERP 뿌리(div#root) 밖 body 끝에 붙는다
// - 글은 모두 textContent로만 넣는다(도우미 오류 번호도 HTML로 읽지 않는다). 숫자·칸 이름만 보이고 환자 정보는 없다
// - 안내가 열려 있을 때 Esc는 안내를 닫는다(ERP 화면의 키 처리는 막지 않는다)
// - 안내가 창보다 길면 안에서 스크롤하고(늘 보이는 스크롤 막대), 단추 줄은 안내 아래에 붙어 늘 보인다. 한글 낱말은 가운데서 끊지 않는다(TASK-21)
// 기간 채우기(spec erp-closing-range TASK-3): [비트 값 채우기] 왼쪽 [기간 채우기] 단추와, 같은 안내 틀에 그리는 기간 안내(몸통은 rangeView.ts).
// 글·모양은 승인된 시안 docs/mockups/erp-closing-range/ ①~⑤와 design.md 4절 그대로다
// 의사랑판(spec erp-uisarang TASK-11, design.md 8-9·9-3): setSource('uisarang')이면 단추 줄이 [기간 채우기] [엑셀로 받기] [의사랑 값 채우기]가 되고,
// 같은 안내 틀에 의사랑 안내(몸통은 uisView.ts)를 그린다. 비트 자료원(처음 그대로)이면 그리는 단추·안내 DOM은 지금과 같다
import { HELD_SALES, type Where } from './cells.js'
import { explainFor } from './errors.js'
import { shortPlace, type FillResult } from './fill.js'
import type { RangeAction, RangeView } from './rangeTypes.js'
import { RANGE_TEXT, renderRange } from './rangeView.js'
import { GROUP_NAMES, type ClosingDay, type OverlapChoice } from './types.js'
import { UIS_TEXT } from './uisText.js'
import type { Source } from './uisTypes.js'
import { renderUis, type PanelWords, type UisAction, type UisView } from './uisView.js'

/** ERP 화면에 붙이는 요소의 id */
export const HOST_ID = 'erp-closing-fill'

/** 고정 글(목업 그대로) */
export const TEXT = {
  title: '비트 값 채우기',
  button: '비트 값 채우기',
  reading: '비트에서 읽는 중…',
  close: '안내 닫기',
  openSettings: '설정 열기',
  end: '확인한 뒤 업무일지 1 [전체 저장]과 업무일지 2 [일일 상세 저장]을 눌러 주세요.',
  first: '처음 한 번 설정 화면에서 코드를 확인하고 [저장]을 눌러 주세요.',
  firstHelp: '설정 화면을 새 탭으로 열었어요. 아무 칸도 바꾸지 않았어요.',
  untouched: '아무 칸도 바꾸지 않았어요.',
  noDate: '마감 일자를 먼저 골라 주세요.',
  dateChanged: '읽는 동안 마감 일자가 바뀌어 채우지 않았어요. 다시 눌러 주세요.',
  filled: (date: string, n: number) => `${date} 비트 값으로 ${count(n)}칸을 채웠어요. 저장은 하지 않았어요.`,
  /** 보류 줄(기본값 (아)): 보류 묶음 이름을 ·로 잇는다. 예: '씨암·SONO 치료별 매출은 채우지 않았어요. 직접 넣어 주세요.' */
  held: (names: readonly string[]) => `${names.join('·')} 치료별 매출은 채우지 않았어요. 직접 넣어 주세요.`,
} as const

/** 채우기 전·뒤 안내 글(design.md 5-1, TASK-17) */
export const FLOW_TEXT = {
  untouched: TEXT.untouched,
  future: (date: string) => `마감 일자(${date})가 오늘보다 뒤예요.`,
  futureHow: '날짜를 확인해 주세요.',
  zero: (date: string) => `${date}에는 비트 진료가 한 건도 없어요.`,
  zeroHow: '마감 일자가 맞는지 확인해 주세요. 맞으면 [그래도 채우기]로 채울 수 있어요(쉬는 날 예약 칸 등).',
  zeroUntouched: '아직 아무 칸도 바꾸지 않았어요.',
  goAnyway: '그래도 채우기',
  readOnly: '이 화면은 읽기 전용이라 채울 수 없어요(본사 열람 등).',
  ask: (n: number) => `이미 적힌 칸 ${count(n)}개가 비트 값으로 바뀌어요.`,
  askRows: (line: string) => `바뀌는 칸: ${line}`,
  askHelp: '[빈 칸만]을 누르면 적힌 칸은 그대로 두고 빈 칸만 채워요.',
  replace: '바꾸기',
  emptyOnly: '빈 칸만',
  checkTitle: '비트와 맞춰 볼 숫자',
  checkTotal: (won: number | null) => `외래 총매출 ${unit(won, '원')}`,
  checkReceived: (won: number | null) => `진료수납액 ${unit(won, '원')}`,
  checkPatients: (n: number | null) => `환자 합계 ${unit(n, '명')}`,
  checkHelp: '비트 화면의 같은 숫자와 먼저 견주어 보세요.',
  kept: (n: number) => `이미 적힌 ${count(n)}칸은 그대로 두었어요.`,
  undo: '되돌리기',
  undone: (n: number) => `되돌렸어요. ${count(n)}칸을 채우기 전 값으로 돌렸어요. 저장은 하지 않았어요.`,
  undoneGone: (k: number) => `화면이 바뀌어 ${count(k)}칸은 되돌리지 못했어요.`,
  /** 채운 뒤 손으로 고친 칸은 되돌리지 않았다(TASK-21, AC-3618.2) */
  undoneEdited: (k: number) => `채운 뒤 손으로 고친 ${count(k)}칸은 그대로 두었어요.`,
  undoDateChanged: '마감 일자가 바뀌어 되돌리지 않았어요.',
  last: '지난 결과',
  /** 짧은 줄 이름이 10줄을 넘을 때 끝에 붙는다 */
  more: (k: number) => ` 외 ${count(k)}줄`,
  /** 오류 안내 작은 줄(design.md 5-2 머리) */
  errUntouched: (code: string) => `아무 칸도 바꾸지 않았어요. (번호 ${code})`,
}

/** 넣지 않은 칸 묶음(design.md 5-1 차례): 제목 · 할 일 */
export const SKIP_TEXT = {
  notFound: { title: '화면에서 찾지 못한 칸', help: 'ERP 화면에서 찾지 못해 그대로 둔 칸이에요. 직접 넣어 주세요.' },
  therapist: { title: '치료사별 입력 줄', help: '치료사별로 넣는 줄이라 그대로 두었어요. 치료사별 칸에 직접 넣어 주세요.' },
  locked: { title: '읽기 전용 칸', help: '잠긴 칸이라 그대로 두었어요.' },
  noName: {
    title: 'ERP 줄 이름이 빈 기타 줄',
    help: '설정 화면에서 그 기타 줄의 ERP 줄 이름을 업무일지 2 줄 이름과 똑같이 넣어 주세요.',
  },
  unpicked: { title: '고르지 않아 건너뛴 칸', help: '설정에서 코드를 고르지 않은 항목이라 그대로 두었어요.' },
} as const

/** 짧은 줄 이름을 보이는 가장 많은 줄 수 */
export const MAX_PLACES = 10

/** 의사랑 안내(uisView.ts)가 쓰는 지금 안내 글(spec erp-uisarang design.md 10-2 '지금 그대로') */
export const UIS_PANEL_WORDS: PanelWords = {
  placeLine,
  skip: SKIP_TEXT,
  end: TEXT.end,
  firstHelp: TEXT.firstHelp,
  kept: FLOW_TEXT.kept,
  errUntouched: FLOW_TEXT.errUntouched,
}

/** 씨암·SONO가 함께 있는 진료 묻기와 채운 뒤 줄(design.md 5절 '겹친 진료 묻기', TASK-15) */
export const OVERLAP_TEXT = {
  ask: (visits: number, carm: number, sono: number) =>
    `씨암·SONO 코드가 함께 있는 진료가 ${count(visits)}건 있어요(씨암 쪽 ${count(carm)}원 · SONO 쪽 ${count(sono)}원). 어디에 넣을까요?`,
  /** 단추 글(차례 = 단추 차례) */
  choice: { carm: '씨암에 넣기', sono: 'SONO에 넣기', both: '둘 다 넣기' } as Record<OverlapChoice, string>,
  /** 지난번 고른 단추 글 끝에 붙는다 */
  last: ' (지난번)',
  into: { carm: '씨암에', sono: 'SONO에', both: '씨암·SONO 둘 다에' } as Record<OverlapChoice, string>,
  done: (visits: number, choice: OverlapChoice) => `함께 있는 진료 ${count(visits)}건은 ${OVERLAP_TEXT.into[choice]} 넣었어요.`,
}

const CHOICES: readonly OverlapChoice[] = ['carm', 'sono', 'both']

/** 묻는 줄에 보이는 숫자와 지난번 고른 것 */
export type OverlapAsk = { visits: number; carm: number; sono: number; last?: OverlapChoice }

/** design.md 5절 경고 글 */
const WARN = {
  moneyUnconfirmed:
    '환불·변경수납 등이 있는 날이에요. 외래 수입 8칸(총매출·청구액·비급여·미수입금·진료수납액·카드·현금·계좌)은 비트 수납 줄을 그대로 더한 값이라 다를 수 있어요. 확인해 주세요.',
  splitUnconfirmed: '청구액·비급여는 비트에서 딱 나눠지지 않아 그대로 더한 값이에요. 확인해 주세요.',
  unpaidVisits: (n: number) => `수납이 끝나지 않은 진료 ${count(n)}건이 있어요.`,
  refund: (won: number) => `환불 ${count(won)}원이 있어요. 금액을 확인해 주세요.`,
  unknownAge: (n: number) => `생년월일이 없는 환자 ${count(n)}명은 연령별 표에 넣지 않았어요.`,
  noHistory: '예전 자료가 따로 있어 주사1회환자는 채우지 않았어요.',
  inpatient: '입원 접수가 있어 입원수입 칸은 채우지 않았어요.',
}

function count(n: number): string {
  return n.toLocaleString('ko-KR')
}

/** 쉼표 숫자 + 단위, 값이 없으면 '—'(AC-3613.1) */
function unit(n: number | null, suffix: string): string {
  return typeof n === 'number' && Number.isFinite(n) ? `${count(n)}${suffix}` : '—'
}

/** 짧은 줄 이름(같은 줄은 한 번)을 ' · '로 잇고, 10줄을 넘으면 ' 외 {K}줄'(design.md 5-1) */
export function placeLine(places: readonly Where[]): string {
  const names = [...new Set(places.map(shortPlace))]
  const shown = names.slice(0, MAX_PLACES).join(' · ')
  return names.length > MAX_PLACES ? shown + FLOW_TEXT.more(names.length - MAX_PLACES) : shown
}

/** 안내 상태(목업 ③~⑪ + design.md 5-1) */
export type View =
  | {
      kind: 'done'
      date: string
      result: FillResult
      day: ClosingDay
      overlap?: { visits: number; choice: OverlapChoice }
      /** [되돌리기]를 보인다(넣은 칸이 있고 아직 되돌리지 않음) */
      canUndo?: boolean
    }
  | { kind: 'first' }
  | { kind: 'errDate' }
  | { kind: 'dateChanged' }
  | { kind: 'err'; code: string }
  | { kind: 'future'; date: string }
  | { kind: 'readOnly' }
  | { kind: 'undone'; restored: number; gone: number; edited: number }
  | { kind: 'undoDateChanged' }

/** 해당하는 경고 줄만, design.md 5절 차례로 */
export function warningLines(day: ClosingDay): string[] {
  const w = day.warnings
  const lines: string[] = []
  if (w.moneyUnconfirmed) lines.push(WARN.moneyUnconfirmed)
  if (w.splitUnconfirmed) lines.push(WARN.splitUnconfirmed)
  if (w.unpaidVisits > 0) lines.push(WARN.unpaidVisits(w.unpaidVisits))
  const refund = day.money.refund
  if (typeof refund === 'number' && refund > 0) lines.push(WARN.refund(refund))
  if (w.unknownAge > 0) lines.push(WARN.unknownAge(w.unknownAge))
  if (w.noHistory) lines.push(WARN.noHistory)
  if (day.inpatientVisits > 0) lines.push(WARN.inpatient)
  return lines
}

// 목업 모양 그대로(토큰 값은 docs/UI_GUIDE.md). z-index는 ERP 화면 위에 보이도록 높게 둔다
const CSS = `
:host{all:initial}
*{box-sizing:border-box;margin:0;padding:0}
[hidden]{display:none !important}
ul{list-style:none}
.nw{white-space:nowrap}
.dock{--surface:#FFFFFF;--canvas:#F7F8FA;--line:#E5E7EB;--line-strong:#D1D5DB;--muted:#6B7280;--ink-2:#374151;--ink:#111827;
--accent:#2563EB;--accent-strong:#1D4ED8;--negative:#C2410C;--warning:#B45309;--warning-soft:#FDF4E3;--ok:#15803D;--r-control:4px;--r-float:8px;
--shadow-float:0 8px 24px rgba(17,24,39,.14),0 1px 3px rgba(17,24,39,.08);
position:fixed;right:24px;bottom:24px;z-index:2147483000;display:flex;flex-direction:column;align-items:flex-end;gap:12px;max-width:calc(100vw - 48px);
font-family:'Pretendard','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;color:var(--ink);font-size:14px;line-height:22px;font-variant-numeric:tabular-nums;text-align:left}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}
.row{display:flex;align-items:center;gap:8px}
.fill-btn{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 18px;border-radius:var(--r-control);background:var(--accent);color:var(--surface);font-size:15px;font-weight:600;box-shadow:var(--shadow-float);white-space:nowrap}
.fill-btn:hover{background:var(--accent-strong)}
.fill-btn:disabled{background:#93A6C9;cursor:default}
.panel{width:440px;max-width:100%;max-height:calc(100vh - 210px);overflow-x:hidden;overflow-y:auto;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-float);box-shadow:var(--shadow-float);color:var(--ink-2);font-size:14px;line-height:22px;word-break:keep-all;overflow-wrap:anywhere}
.panel::-webkit-scrollbar{width:10px}
.panel::-webkit-scrollbar-track{background:transparent}
.panel::-webkit-scrollbar-thumb{background:#C4C9D2;border-radius:5px;border:2px solid #FFFFFF}
.panel::-webkit-scrollbar-thumb:hover{background:#9CA3AF}
.ph{display:flex;justify-content:space-between;align-items:center;padding:10px 12px 0 18px}
.pt{font-size:12px;font-weight:500;color:var(--muted)}
.x{width:32px;height:32px;border-radius:var(--r-control);color:var(--muted);font-size:18px}
.x:hover{background:var(--canvas)}
.pb{padding:4px 18px 16px;display:flex;flex-direction:column;gap:12px}
.lead{font-size:15px;line-height:23px;font-weight:600;color:var(--ink)}
.lead.err{color:var(--negative)}
.lead.err::before{content:'!';display:inline-flex;justify-content:center;align-items:center;width:18px;height:18px;margin-right:6px;border-radius:50%;background:var(--negative);color:#fff;font-size:12px;vertical-align:1px}
.small{font-size:13px;line-height:20px;color:var(--muted)}
.check{display:flex;flex-direction:column;gap:2px;background:var(--canvas);border:1px solid var(--line);border-radius:var(--r-control);padding:10px 12px}
.check .h{font-size:12px;line-height:18px;font-weight:600;color:var(--muted)}
.check .n{font-weight:600;color:var(--ink)}
.check .small{margin-top:2px}
.kept,.ovl{color:var(--ink)}
.blk{border-top:1px solid var(--line);padding-top:10px;display:flex;flex-direction:column;gap:4px}
.blk .h{font-weight:600;color:var(--ink)}
.blk b{color:var(--ink);font-weight:600}
.blk .rows{color:var(--ink-2);word-break:keep-all}
.warns{display:flex;flex-direction:column;gap:8px;background:var(--warning-soft);border-radius:var(--r-control);padding:10px 12px}
.warns li{display:flex;gap:8px;align-items:flex-start;color:var(--ink-2)}
.warns li::before{content:'!';flex:none;display:inline-flex;justify-content:center;align-items:center;width:18px;height:18px;margin-top:2px;border-radius:50%;background:var(--warning);color:#fff;font-size:12px;font-weight:600}
.end{border-top:1px solid var(--line);padding-top:10px;color:var(--ink)}
.acts{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;position:sticky;bottom:0;z-index:1;background:var(--surface);border-top:1px solid var(--line);margin:0 -18px -16px;padding:10px 18px 16px}
.btn{display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 14px;border-radius:var(--r-control);font-weight:500;white-space:nowrap}
.btn-2{border:1px solid var(--line-strong);background:var(--surface);color:var(--ink)}
.btn-2:hover{background:var(--canvas)}
.btn-2:disabled{color:var(--muted);cursor:default}
.last{height:44px;box-shadow:var(--shadow-float)}
.fill-btn2{display:inline-flex;align-items:center;height:44px;padding:0 16px;border-radius:var(--r-control);background:var(--surface);color:var(--ink);border:1px solid var(--line-strong);font-size:15px;font-weight:600;box-shadow:var(--shadow-float);white-space:nowrap}
.fill-btn2:hover{background:var(--canvas)}
.fill-btn2:disabled{background:var(--surface);color:var(--muted);cursor:default}
.btn-1{background:var(--accent);color:var(--surface);font-weight:600}
.btn-1:hover{background:var(--accent-strong)}
.btn-1:disabled{background:#93A6C9;cursor:default}
.btn-2[aria-pressed=true]{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent);color:var(--accent-strong);font-weight:600}
.dates{display:flex;align-items:flex-end;gap:8px}
.dates label{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;font-size:12px;line-height:18px;color:var(--muted)}
.dates input{height:36px;width:100%;border:1px solid var(--line-strong);border-radius:var(--r-control);padding:0 10px;font:inherit;font-size:14px;color:var(--ink);background:var(--surface)}
.dates .tilde{padding-bottom:7px;color:var(--muted)}
.why{font-size:13px;line-height:20px;font-weight:500;color:var(--negative)}
.prog{height:10px;background:var(--line);border-radius:5px;overflow:hidden}
.prog i{display:block;height:100%;background:var(--accent)}
.check b{color:var(--ink);font-weight:600}
.ok{color:var(--ok);font-weight:600}
.bad{color:var(--negative);font-weight:600}
.fails{display:flex;flex-direction:column;gap:2px;padding-left:12px}
.ask{display:flex;flex-direction:column;gap:6px}
.picks{display:flex;flex-wrap:wrap;gap:6px}
.files{display:flex;flex-direction:column;gap:6px;background:var(--canvas);border:1px solid var(--line);border-radius:var(--r-control);padding:10px 12px}
.files ol{list-style:none;display:flex;flex-direction:column;gap:6px}
.files .h{font-size:12px;line-height:18px;font-weight:600;color:var(--muted);display:flex;justify-content:space-between;gap:8px}
.files li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:baseline}
.files .nm{color:var(--ink)}
.files .st{font-size:13px;white-space:nowrap;color:var(--ink-2)}
.files .st.ok,.files .st.bad{font-weight:600}
.files .st.ok{color:var(--ok)}
.files .st.bad{color:var(--negative)}
.files .st.ok::before{content:'✓ '}
.blk .whys{display:flex;flex-direction:column;gap:2px;color:var(--ink)}
.blk .whys li{padding-left:12px;position:relative}
.blk .whys li::before{content:'·';position:absolute;left:2px;color:var(--muted)}
@media (max-width:600px){.dock{right:12px;bottom:12px;max-width:calc(100vw - 24px)}.panel{max-height:calc(100vh - 190px)}}
`

type Child = Node | string | null | undefined | false

function element<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag)
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value)
  for (const child of children) if (child) node.append(child)
  return node
}

export type Dock = {
  /** ERP 화면에 붙일 요소(그림자 뿌리를 품음) */
  host: HTMLElement
  /** 읽는 중: 단추 글을 바꾸고 막으며 안내를 숨긴다([지난 결과]도 막힘) */
  setReading(on: boolean): void
  show(view: View): void
  /**
   * 씨암·SONO가 함께 있는 진료를 어디에 넣을지 묻는다(design.md 5절). 누른 단추의 선택으로 끝나고,
   * [안내 닫기](단추·×)·Esc·hide()·다른 안내를 보이면 null(아무것도 고르지 않음)로 끝난다. 지난번 고른 단추는 ' (지난번)'이 붙고 먼저 포커스를 받는다
   */
  askOverlap(ask: OverlapAsk): Promise<OverlapChoice | null>
  /** 진료 0건인 날(design.md 5-1): [그래도 채우기]면 true, [안내 닫기](먼저 포커스)·×·Esc·다른 안내면 false */
  askZero(date: string): Promise<boolean>
  /**
   * 이미 적힌 칸 묻기(design.md 5-1): [바꾸기] 'all' · [빈 칸만](먼저 포커스) 'empty' · [안내 닫기]·×·Esc·다른 안내 null.
   * places = 이미 적힌 칸 자리(N = 칸 수, 바뀌는 칸 = 짧은 줄 이름)
   */
  askWritten(places: readonly Where[]): Promise<'all' | 'empty' | null>
  /** 단추 옆 [지난 결과]가 다시 열 안내. null이면 [지난 결과]가 없다 */
  setLast(view: View | null): void
  hide(): void
  /**
   * 기간 안내(design.md 4절)를 같은 안내 틀에 보인다. 열린 묻기는 null로 끝나고, 다른 안내(show·묻기)를 보이면 사라진다.
   * ×·Esc는 pick·todayOnly·confirm·stopped·blocked·end에서만 안내를 닫고 onRangeAction({ kind: 'close' })를 부른다(scanning·running엔 ×가 없다)
   */
  showRange(view: RangeView): void
  /** 기간 살펴보기·채우기가 도는 중: [기간 채우기]·[비트 값 채우기]·[지난 결과]를 막는다(안내는 그대로 둔다) */
  setRangeBusy(on: boolean): void
  /**
   * 이 PC의 자료원(spec erp-uisarang design.md 9-3). 'uisarang'이면 큰 단추 글 '의사랑 값 채우기', 그 왼쪽에 [엑셀로 받기](버금 단추)를 끼우고
   * 지금 안내(show·묻기)의 머리도 '의사랑 값 채우기', show(err)는 의사랑 오류 글이다. 'bit'(처음)이면 지금 그대로
   */
  setSource(source: Source): void
  /** 의사랑 엑셀 읽는 중: 누른 단추('fill' 큰 단추 · 'export' [엑셀로 받기]) 글이 '의사랑 엑셀 읽는 중…', 세 단추와 [지난 결과]를 막고 안내를 숨긴다. null이면 풂 */
  setUisReading(which: 'fill' | 'export' | null): void
  /**
   * 의사랑 안내(design.md 10-1~10-3, 몸통은 uisView.ts)를 같은 안내 틀에 보인다. 열린 묻기는 null로 끝난다.
   * 안내 단추는 onUisAction(그 동작)을 부르고, [안내 닫기]·[닫기]·×·Esc는 안내를 닫은 뒤 onUisAction('close')
   */
  showUis(view: UisView): void
  /** [지난 결과]가 다시 열 의사랑 안내. null이면 [지난 결과]가 없다(setLast와 같은 자리 하나) */
  setLastUis(view: UisView | null): void
}

type Pending = { resolve(value: unknown): void; cancel: unknown }

/** ×·Esc가 없는 기간 안내(도는 중) */
const RANGE_OPEN: ReadonlySet<RangeView['kind']> = new Set(['scanning', 'running'])

export function createDock(
  doc: Document,
  handlers: {
    onFill(): void
    onOpenSettings(): void
    onUndo(): void
    /** [기간 채우기]. 주지 않으면 아무 일 없다(spec erp-closing-range TASK-4가 main에서 잇는다) */
    onRange?(): void
    /** 기간 안내 단추·×·Esc. 'close'는 안내를 닫은 뒤 부른다. 주지 않으면 닫기만 한다 */
    onRangeAction?(action: RangeAction): void
    /** 의사랑 단추 줄 [엑셀로 받기](spec erp-uisarang). 주지 않으면 아무 일 없다 */
    onExport?(): void
    /** 의사랑 안내 단추·×·Esc. 'close'는 안내를 닫은 뒤 부른다. 주지 않으면 닫기만 한다 */
    onUisAction?(action: UisAction): void
  },
): Dock {
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: Child[]) =>
    element(doc, tag, attrs, ...children)

  const host = h('div', { id: HOST_ID })
  const root = host.attachShadow({ mode: 'open' })
  const body = h('div', { class: 'pb' })
  const close = h('button', { type: 'button', class: 'x', 'aria-label': TEXT.close }, '×')
  const title = h('span', { class: 'pt' }, TEXT.title)
  const panel = h('div', { class: 'panel', role: 'status' }, h('div', { class: 'ph' }, title, close), body)
  panel.hidden = true
  const button = h('button', { type: 'button', class: 'fill-btn' }, TEXT.button)
  const rangeButton = h('button', { type: 'button', class: 'fill-btn2' }, RANGE_TEXT.button)
  const lastButton = h('button', { type: 'button', class: 'btn btn-2 last' }, FLOW_TEXT.last)
  /** 의사랑 [엑셀로 받기]: 의사랑 자료원일 때만 단추 줄에 끼운다(비트면 DOM에 없다) */
  const exportButton = h('button', { type: 'button', class: 'fill-btn2' }, UIS_TEXT.exportButton)
  const buttonRow = h('div', { class: 'row' }, lastButton, rangeButton, button)
  root.append(h('style', {}, CSS), h('div', { class: 'dock' }, panel, buttonRow))

  /** [지난 결과]가 다시 열 안내(비트 안내 또는 의사랑 안내) */
  let last: { uis: false; view: View } | { uis: true; view: UisView } | null = null
  /** 아직 답하지 않은 묻기. 끝내면 비운다 */
  let pending: Pending | null = null
  /** 지금 보이는 기간 안내(없으면 null) */
  let range: RangeView['kind'] | null = null
  /** 지금 보이는 것이 의사랑 안내인가(×·Esc가 onUisAction('close')를 부른다) */
  let uisOpen = false
  /** 이 PC의 자료원(setSource, 처음은 비트) */
  let source: Source = 'bit'
  /** [비트 값 채우기] 읽는 중 · 기간 살펴보기·채우기 도는 중 · 의사랑 엑셀 읽는 중(누른 단추) */
  let reading = false
  let rangeBusy = false
  let uisReading: 'fill' | 'export' | null = null
  const cancel = () => {
    const open = pending
    pending = null
    open?.resolve(open.cancel)
  }

  /** [지난 결과]는 지난 결과가 있고 안내가 닫혀 있을 때만 보인다 */
  const refreshLast = () => {
    lastButton.hidden = last === null || !panel.hidden
  }
  /** 읽는 중이거나 기간이 도는 중이면 단추 줄([엑셀로 받기] 포함)과 [지난 결과]를 막는다(AC-3701.4). 의사랑은 누른 단추 글이 바뀐다 */
  const refreshButtons = () => {
    const off = reading || rangeBusy || uisReading !== null
    button.disabled = off
    rangeButton.disabled = off
    lastButton.disabled = off
    exportButton.disabled = off
    if (source === 'uisarang') {
      button.textContent = reading || uisReading === 'fill' ? UIS_TEXT.reading : UIS_TEXT.button
      exportButton.textContent = uisReading === 'export' ? UIS_TEXT.reading : UIS_TEXT.exportButton
    } else button.textContent = reading ? TEXT.reading : TEXT.button
  }
  const setPanel = (open: boolean) => {
    panel.hidden = !open
    refreshLast()
  }
  /** 머리 작은 글과 × (기간 안내가 아니면 range = null, 지금 안내 그대로. 의사랑 자료원이면 머리는 '의사랑 값 채우기') */
  const setHead = (kind: RangeView['kind'] | null) => {
    range = kind
    uisOpen = false
    title.textContent = kind !== null ? RANGE_TEXT.head[kind] : source === 'uisarang' ? UIS_TEXT.head.fill : TEXT.title
    close.hidden = kind !== null && RANGE_OPEN.has(kind)
  }
  const hide = () => {
    setPanel(false)
    cancel()
    range = null
    uisOpen = false
  }
  /** 기간 안내를 닫고 알린다([닫기]·×·Esc) */
  const closeRange = () => {
    hide()
    handlers.onRangeAction?.({ kind: 'close' })
  }
  /** 의사랑 안내를 닫고 알린다([안내 닫기]·[닫기]·×·Esc) */
  const closeUis = () => {
    hide()
    handlers.onUisAction?.('close')
  }
  /** ×·Esc: 기간 안내면 닫을 수 있을 때만 closeRange, 의사랑 안내면 closeUis, 아니면 지금처럼 hide */
  const dismiss = () => {
    if (uisOpen) closeUis()
    else if (range === null) hide()
    else if (!RANGE_OPEN.has(range)) closeRange()
  }
  const rangeAct = (action: RangeAction) => {
    if (action.kind === 'close') closeRange()
    else handlers.onRangeAction?.(action)
  }
  const uisAct = (action: UisAction) => {
    if (action === 'close') closeUis()
    else handlers.onUisAction?.(action)
  }
  refreshLast()

  button.addEventListener('click', () => {
    if (!button.disabled) handlers.onFill()
  })
  rangeButton.addEventListener('click', () => {
    if (!rangeButton.disabled) handlers.onRange?.()
  })
  exportButton.addEventListener('click', () => {
    if (!exportButton.disabled) handlers.onExport?.()
  })
  close.addEventListener('click', dismiss)
  lastButton.addEventListener('click', () => {
    if (lastButton.disabled || !last) return
    if (last.uis) showUis(last.view)
    else show(last.view)
  })
  // 안내가 열려 있을 때 Esc로 닫는다. ERP 쪽 키 처리는 그대로 받게 preventDefault·stopPropagation 하지 않는다
  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && host.isConnected && !panel.hidden) dismiss()
  })

  const lead = (text: Child, err = false) => h('p', { class: err ? 'lead err' : 'lead' }, text)
  const plain = (text: string) => h('p', {}, text)
  const small = (text: string) => h('p', { class: 'small' }, text)
  const actButton = (label: string, onClick: () => void) => {
    const one = h('button', { type: 'button', class: 'btn btn-2' }, label)
    one.addEventListener('click', onClick)
    return one
  }

  /** 넣지 않은 칸 묶음 하나: 제목 '{이름} {N}칸' · 짧은 줄 이름 · 할 일 */
  const skipBlock = (kind: keyof typeof SKIP_TEXT, places: readonly Where[]) =>
    places.length > 0 &&
    h(
      'div',
      { class: 'blk' },
      h('p', { class: 'h' }, `${SKIP_TEXT[kind].title} `, h('b', {}, `${count(places.length)}칸`)),
      h('p', { class: 'rows' }, placeLine(places)),
      small(SKIP_TEXT[kind].help),
    )

  function doneParts(view: Extract<View, { kind: 'done' }>): Child[] {
    const { result, day } = view
    const warnings = warningLines(day)
    const skipped = (skip: 'notFound' | 'therapist' | 'locked') => result.skipped.filter((s) => s.skip === skip).map((s) => s.where)
    const settings = actButton(TEXT.openSettings, () => handlers.onOpenSettings())
    return [
      h(
        'div',
        { class: 'check' },
        h('p', { class: 'h' }, FLOW_TEXT.checkTitle),
        h('p', { class: 'n' }, FLOW_TEXT.checkTotal(day.money.total)),
        h('p', { class: 'n' }, FLOW_TEXT.checkReceived(day.money.received)),
        h('p', { class: 'n' }, FLOW_TEXT.checkPatients(day.patients.total)),
        small(FLOW_TEXT.checkHelp),
      ),
      lead(TEXT.filled(view.date, result.filled)),
      result.kept > 0 && h('p', { class: 'kept' }, FLOW_TEXT.kept(result.kept)),
      view.overlap && h('p', { class: 'ovl' }, OVERLAP_TEXT.done(view.overlap.visits, view.overlap.choice)),
      skipBlock('notFound', skipped('notFound')),
      skipBlock('therapist', skipped('therapist')),
      skipBlock('locked', skipped('locked')),
      skipBlock('noName', result.noName),
      skipBlock('unpicked', result.unpicked),
      result.held > 0 && h('div', { class: 'blk held' }, h('p', {}, TEXT.held(HELD_SALES.map((key) => GROUP_NAMES[key])))),
      warnings.length > 0 && h('ul', { class: 'warns' }, ...warnings.map((line) => h('li', {}, line))),
      h('p', { class: 'end' }, TEXT.end),
      h('div', { class: 'acts' }, view.canUndo === true && actButton(FLOW_TEXT.undo, () => handlers.onUndo()), settings),
    ]
  }

  function parts(view: View): Child[] {
    switch (view.kind) {
      case 'done':
        return doneParts(view)
      case 'first':
        return [lead(TEXT.first), small(TEXT.firstHelp), h('div', { class: 'acts' }, actButton(TEXT.openSettings, () => handlers.onOpenSettings()))]
      case 'err': {
        // 비트면 explain과 같은 글(explainFor(code, 'bit') = explain(code)), 의사랑이면 의사랑 오류 글(AC-4212.6)
        const e = explainFor(view.code, source)
        return [lead(e.what, true), plain(e.how), small(FLOW_TEXT.errUntouched(e.code))]
      }
      case 'future':
        return [lead(FLOW_TEXT.future(view.date)), plain(FLOW_TEXT.futureHow), small(FLOW_TEXT.untouched)]
      case 'readOnly':
        return [lead(FLOW_TEXT.readOnly), small(FLOW_TEXT.untouched)]
      case 'undone':
        return [
          lead(FLOW_TEXT.undone(view.restored)),
          view.edited > 0 && plain(FLOW_TEXT.undoneEdited(view.edited)),
          view.gone > 0 && plain(FLOW_TEXT.undoneGone(view.gone)),
        ]
      case 'undoDateChanged':
        return [lead(FLOW_TEXT.undoDateChanged), small(FLOW_TEXT.untouched)]
      case 'errDate':
        return [lead(TEXT.noDate)]
      case 'dateChanged':
        return [lead(TEXT.dateChanged)]
    }
  }

  function show(view: View) {
    cancel()
    setHead(null)
    body.replaceChildren(...parts(view).filter((p): p is Node | string => Boolean(p)))
    setPanel(true)
  }

  /** 의사랑 안내: 머리 글 · 몸통 자식(uisView.ts) → 지금 안내 틀(.pb), 단추가 있으면 맨 끝 단추 줄(.acts) */
  function showUis(view: UisView) {
    cancel()
    setHead(null)
    const drawn = renderUis(doc, view, uisAct, UIS_PANEL_WORDS)
    title.textContent = drawn.head
    uisOpen = true
    body.replaceChildren(...drawn.body.childNodes, ...(drawn.buttons.length > 0 ? [h('div', { class: 'acts' }, ...drawn.buttons)] : []))
    setPanel(true)
  }

  /**
   * 묻기 하나를 연다. 단추마다 그 값으로 끝나고(안내는 열린 채), [안내 닫기]·×·Esc·hide()·다른 안내면 cancelValue로 끝난다.
   * 앞선 묻기의 떨어진 단추가 다음 묻기를 끝내지 않게 단추는 제 묻기가 열려 있을 때만 듣는다
   */
  function ask<T>(
    lines: Child[],
    choices: { label: string; value: T; attrs?: Record<string, string> }[],
    cancelValue: T,
    options: { focus?: number; closeButton?: boolean } = {},
  ): Promise<T> {
    cancel()
    setHead(null)
    return new Promise<T>((resolve) => {
      const mine: Pending = { resolve: resolve as (value: unknown) => void, cancel: cancelValue }
      pending = mine
      const buttons = choices.map((choice) => {
        const one = h('button', { type: 'button', class: 'btn btn-2', ...choice.attrs }, choice.label)
        one.addEventListener('click', () => {
          if (pending !== mine) return
          pending = null
          resolve(choice.value)
        })
        return one
      })
      if (options.closeButton) {
        buttons.push(
          actButton(TEXT.close, () => {
            if (pending === mine) hide()
          }),
        )
      }
      body.replaceChildren(...lines.filter((p): p is Node | string => Boolean(p)), h('div', { class: 'acts' }, ...buttons))
      setPanel(true)
      if (options.focus !== undefined) buttons[options.focus]?.focus()
    })
  }

  return {
    host,
    setReading(on) {
      reading = on
      refreshButtons()
      if (on) hide()
    },
    show,
    askOverlap(question) {
      const choices = CHOICES.map((choice) => ({
        label: OVERLAP_TEXT.choice[choice] + (question.last === choice ? OVERLAP_TEXT.last : ''),
        value: choice as OverlapChoice | null,
        attrs: { 'data-choice': choice },
      }))
      // 다른 두 묻기처럼 끝에 [안내 닫기](AC-3618.3): 누르면 null(아무것도 고르지 않음)
      return ask([lead(OVERLAP_TEXT.ask(question.visits, question.carm, question.sono))], choices, null, {
        focus: question.last ? CHOICES.indexOf(question.last) : undefined,
        closeButton: true,
      })
    },
    askZero(date) {
      return ask(
        [lead(FLOW_TEXT.zero(date)), plain(FLOW_TEXT.zeroHow), small(FLOW_TEXT.zeroUntouched)],
        [{ label: FLOW_TEXT.goAnyway, value: true }],
        false,
        { focus: 1, closeButton: true },
      )
    },
    askWritten(places) {
      return ask<'all' | 'empty' | null>(
        [lead(FLOW_TEXT.ask(places.length)), plain(FLOW_TEXT.askRows(placeLine(places))), small(FLOW_TEXT.askHelp)],
        [
          { label: FLOW_TEXT.replace, value: 'all' },
          { label: FLOW_TEXT.emptyOnly, value: 'empty' },
        ],
        null,
        { focus: 1, closeButton: true },
      )
    },
    setLast(view) {
      last = view === null ? null : { uis: false, view }
      refreshLast()
    },
    hide,
    showRange(view) {
      cancel()
      setHead(view.kind)
      // 몸통 자식(굵은 줄 … 단추 줄)을 지금 안내 틀(.pb)로 옮긴다: 간격·스크롤·늘 보이는 단추 줄 규칙이 그대로 선다
      const drawn = renderRange(doc, view, rangeAct, OVERLAP_TEXT)
      body.replaceChildren(...drawn.childNodes)
      setPanel(true)
    },
    setRangeBusy(on) {
      rangeBusy = on
      refreshButtons()
    },
    setSource(next) {
      source = next
      // 의사랑이면 [기간 채우기]와 큰 단추 사이에 [엑셀로 받기], 비트면 뗀다(비트 단추 줄 DOM은 지금 그대로)
      if (next === 'uisarang') buttonRow.insertBefore(exportButton, button)
      else exportButton.remove()
      refreshButtons()
    },
    setUisReading(which) {
      uisReading = which
      refreshButtons()
      if (which !== null) hide()
    },
    showUis,
    setLastUis(view) {
      last = view === null ? null : { uis: true, view }
      refreshLast()
    },
  }
}
