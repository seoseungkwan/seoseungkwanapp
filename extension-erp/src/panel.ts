// ERP 마감일지 화면 오른쪽 아래의 [비트 값 채우기] 단추와 결과 안내(REQ-3609, design.md 5절).
// 글·모양은 승인된 목업 docs/mockups/erp-closing-fill/ ①~⑪ 그대로다(목업의 노란 띠·점선 표시는 앱에 없다).
// - ERP 화면 글꼴·색이 스며들거나 우리 모양이 ERP를 건드리지 않게 그림자 뿌리 안에 그린다. ERP 뿌리(div#root) 밖 body 끝에 붙는다
// - 글은 모두 textContent로만 넣는다(도우미 오류 번호도 HTML로 읽지 않는다). 숫자·칸 이름만 보이고 환자 정보는 없다
import type { FillResult } from './fill.js'
import type { ClosingDay } from './types.js'

/** ERP 화면에 붙이는 요소의 id */
export const HOST_ID = 'erp-closing-fill'

/** 고정 글(목업 그대로) */
export const TEXT = {
  title: '비트 값 채우기',
  button: '비트 값 채우기',
  reading: '비트에서 읽는 중…',
  close: '안내 닫기',
  openSettings: '설정 열기',
  missingHelp: 'ERP 화면에서 찾지 못해 그대로 둔 칸이에요. 직접 넣어 주세요.',
  unpicked: '고르지 않아 건너뛴 칸',
  unpickedHelp: '설정에서 코드를 고르지 않은 항목이라 그대로 두었어요.',
  end: '확인한 뒤 업무일지 1 [전체 저장]과 업무일지 2 [일일 상세 저장]을 눌러 주세요.',
  first: '처음 한 번 설정 화면에서 코드를 확인하고 [저장]을 눌러 주세요.',
  firstHelp: '설정 화면을 새 탭으로 열었어요. 아무 칸도 바꾸지 않았어요.',
  helperMissing: '도우미를 새 판으로 설치해 주세요.',
  bitFailed: '비트에서 읽지 못했어요',
  timeout: '도우미가 답하지 않아요. 잠시 뒤 다시 눌러 주세요.',
  untouched: '아무 칸도 바꾸지 않았어요.',
  noDate: '마감 일자를 먼저 골라 주세요.',
  dateChanged: '읽는 동안 마감 일자가 바뀌어 채우지 않았어요. 다시 눌러 주세요.',
  filled: (date: string, n: number) => `${date} 비트 값으로 ${count(n)}칸을 채웠어요. 저장은 하지 않았어요.`,
  missing: (n: number) => `못 찾은 칸 ${count(n)}칸`,
} as const

/** design.md 5절 경고 글 */
const WARN = {
  moneyUnconfirmed:
    '환불·변경수납 등이 있는 날이에요. 외래 수입 8칸(총매출·청구액·비급여·미수입금·진료수납액·카드·현금·계좌)은 비트 수납 줄을 그대로 더한 값이라 다를 수 있어요. 확인해 주세요.',
  splitUnconfirmed: '청구액·비급여는 비트에서 딱 나눠지지 않아 그대로 더한 값이에요. 확인해 주세요.',
  unpaidVisits: (n: number) => `수납이 끝나지 않은 진료 ${count(n)}건이 있어요. 치료별 매출이 적게 나왔을 수 있어요.`,
  refund: (won: number) => `환불 ${count(won)}원이 있어요. 금액을 확인해 주세요.`,
  unknownAge: (n: number) => `생년월일이 없는 환자 ${count(n)}명은 연령별 표에 넣지 않았어요.`,
  noHistory: '예전 자료가 따로 있어 주사1회환자는 채우지 않았어요.',
  inpatient: '입원 접수가 있어 입원수입 칸은 채우지 않았어요.',
}

function count(n: number): string {
  return n.toLocaleString('ko-KR')
}

/** 안내 상태(목업 ③~⑪) */
export type View =
  | { kind: 'done'; date: string; result: FillResult; day: ClosingDay }
  | { kind: 'first' }
  | { kind: 'errHelper' }
  | { kind: 'errBit'; code: string }
  | { kind: 'errTimeout' }
  | { kind: 'errDate' }
  | { kind: 'dateChanged' }

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
--accent:#2563EB;--accent-strong:#1D4ED8;--negative:#C2410C;--warning:#B45309;--warning-soft:#FDF4E3;--r-control:4px;--r-float:8px;
--shadow-float:0 8px 24px rgba(17,24,39,.14),0 1px 3px rgba(17,24,39,.08);
position:fixed;right:24px;bottom:24px;z-index:2147483000;display:flex;flex-direction:column;align-items:flex-end;gap:12px;max-width:calc(100vw - 48px);
font-family:'Pretendard','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;color:var(--ink);font-size:14px;line-height:22px;font-variant-numeric:tabular-nums;text-align:left}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}
.fill-btn{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 18px;border-radius:var(--r-control);background:var(--accent);color:var(--surface);font-size:15px;font-weight:600;box-shadow:var(--shadow-float);white-space:nowrap}
.fill-btn:hover{background:var(--accent-strong)}
.fill-btn:disabled{background:#93A6C9;cursor:default}
.panel{width:440px;max-width:100%;max-height:calc(100vh - 210px);overflow:auto;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-float);box-shadow:var(--shadow-float);color:var(--ink-2);font-size:14px;line-height:22px}
.ph{display:flex;justify-content:space-between;align-items:center;padding:10px 12px 0 18px}
.pt{font-size:12px;font-weight:500;color:var(--muted)}
.x{width:32px;height:32px;border-radius:var(--r-control);color:var(--muted);font-size:18px}
.x:hover{background:var(--canvas)}
.pb{padding:4px 18px 16px;display:flex;flex-direction:column;gap:12px}
.lead{font-size:15px;line-height:23px;font-weight:600;color:var(--ink)}
.lead.err{color:var(--negative)}
.lead.err::before{content:'!';display:inline-flex;justify-content:center;align-items:center;width:18px;height:18px;margin-right:6px;border-radius:50%;background:var(--negative);color:#fff;font-size:12px;vertical-align:1px}
.small{font-size:13px;line-height:20px;color:var(--muted)}
.blk{border-top:1px solid var(--line);padding-top:10px;display:flex;flex-direction:column;gap:4px}
.blk .h{font-weight:600;color:var(--ink)}
.blk b{color:var(--ink);font-weight:600}
.blk li{padding-left:12px;position:relative}
.blk li::before{content:'·';position:absolute;left:2px;color:var(--muted)}
.warns{display:flex;flex-direction:column;gap:8px;background:var(--warning-soft);border-radius:var(--r-control);padding:10px 12px}
.warns li{display:flex;gap:8px;align-items:flex-start;color:var(--ink-2)}
.warns li::before{content:'!';flex:none;display:inline-flex;justify-content:center;align-items:center;width:18px;height:18px;margin-top:2px;border-radius:50%;background:var(--warning);color:#fff;font-size:12px;font-weight:600}
.end{border-top:1px solid var(--line);padding-top:10px;color:var(--ink)}
.acts{display:flex;justify-content:flex-end;gap:8px}
.btn{display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 14px;border-radius:var(--r-control);font-weight:500;white-space:nowrap}
.btn-2{border:1px solid var(--line-strong);background:var(--surface);color:var(--ink)}
.btn-2:hover{background:var(--canvas)}
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
  /** 읽는 중: 단추 글을 바꾸고 막으며 안내를 숨긴다 */
  setReading(on: boolean): void
  show(view: View): void
  hide(): void
}

export function createDock(doc: Document, handlers: { onFill(): void; onOpenSettings(): void }): Dock {
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: Child[]) =>
    element(doc, tag, attrs, ...children)

  const host = h('div', { id: HOST_ID })
  const root = host.attachShadow({ mode: 'open' })
  const body = h('div', { class: 'pb' })
  const close = h('button', { type: 'button', class: 'x', 'aria-label': TEXT.close }, '×')
  const panel = h('div', { class: 'panel', role: 'status' }, h('div', { class: 'ph' }, h('span', { class: 'pt' }, TEXT.title), close), body)
  panel.hidden = true
  const button = h('button', { type: 'button', class: 'fill-btn' }, TEXT.button)
  root.append(h('style', {}, CSS), h('div', { class: 'dock' }, panel, button))

  button.addEventListener('click', () => {
    if (!button.disabled) handlers.onFill()
  })
  close.addEventListener('click', () => {
    panel.hidden = true
  })

  const settingsButton = () => {
    const open = h('button', { type: 'button', class: 'btn btn-2' }, TEXT.openSettings)
    open.addEventListener('click', () => handlers.onOpenSettings())
    return h('div', { class: 'acts' }, open)
  }
  const lead = (text: Child, err = false) => h('p', { class: err ? 'lead err' : 'lead' }, text)
  const small = (text: string) => h('p', { class: 'small' }, text)

  function parts(view: View): Child[] {
    switch (view.kind) {
      case 'done': {
        const { result, day } = view
        const warnings = warningLines(day)
        return [
          lead(TEXT.filled(view.date, result.filled)),
          result.missing.length > 0 &&
            h(
              'div',
              { class: 'blk' },
              h('p', { class: 'h' }, TEXT.missing(result.missing.length)),
              h('ul', {}, ...result.missing.map((place) => h('li', {}, place))),
              small(TEXT.missingHelp),
            ),
          result.unpicked > 0 &&
            h('div', { class: 'blk' }, h('p', {}, `${TEXT.unpicked} `, h('b', {}, `${count(result.unpicked)}칸`)), small(TEXT.unpickedHelp)),
          warnings.length > 0 && h('ul', { class: 'warns' }, ...warnings.map((line) => h('li', {}, line))),
          h('p', { class: 'end' }, TEXT.end),
          settingsButton(),
        ]
      }
      case 'first':
        return [lead(TEXT.first), small(TEXT.firstHelp), settingsButton()]
      case 'errHelper':
        return [lead(TEXT.helperMissing, true), small(TEXT.untouched)]
      case 'errBit':
        return [lead(h('span', {}, `${TEXT.bitFailed} `, h('span', { class: 'nw' }, `(${view.code})`)), true), small(TEXT.untouched)]
      case 'errTimeout':
        return [lead(TEXT.timeout, true), small(TEXT.untouched)]
      case 'errDate':
        return [lead(TEXT.noDate)]
      case 'dateChanged':
        return [lead(TEXT.dateChanged)]
    }
  }

  return {
    host,
    setReading(on) {
      button.disabled = on
      button.textContent = on ? TEXT.reading : TEXT.button
      if (on) panel.hidden = true
    },
    show(view) {
      body.replaceChildren(...parts(view).filter((p): p is Node | string => Boolean(p)))
      panel.hidden = false
    },
    hide() {
      panel.hidden = true
    },
  }
}
