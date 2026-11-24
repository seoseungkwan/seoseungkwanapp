// 의사랑판(spec erp-uisarang) ERP 화면 안내 안쪽 그리기 — design.md 8-6·10-1~10-3. 글은 design.md 10절(시안 docs/mockups/erp-uisarang/
// 고친 판 ①~⑭, 11절) 그대로이고 글자는 모두 uisText.ts·errors.ts에 있다. 모양(class)은 panel.ts 안내 스타일 블록 하나에 있다
// - panel.ts가 이 파일을 부르므로 여기서는 panel.ts를 import하지 않는다(순환, rangeView.ts와 같은 길). 지금 비트 안내 글
//   (짧은 줄 이름 placeLine · 건너뛴 칸 SKIP_TEXT · 끝 줄 · ⑭ 뒤 줄 · 그대로 둔 칸 · 오류 번호 줄)은 renderUis에 넘겨받는다
// - 글은 모두 textContent로만 넣는다(보고서 라벨 값·오류 번호도 HTML로 읽지 않는다). 숫자·날짜·칸 이름·보고서 이름만 보이고 환자 정보는 없다
// - 단추는 몸통 밖(buttons)으로 돌려준다. panel.ts가 몸통 끝 단추 줄(.acts)에 넣는다
import type { Where } from './cells.js'
import { explainFor } from './errors.js'
import type { FillResult } from './fill.js'
import { checkLines, unreadLines, type UisCell, type UisStop } from './uisCells.js'
import { UIS_FOLDER_TEXT, UIS_REPORT_NAMES, UIS_TEXT } from './uisText.js'
import { UIS_KINDS, UIS_PATIENT } from './uisTypes.js'
import type { UisDay, UisKind, UisReport } from './uisTypes.js'

/** 안내 하나(design.md 8-6) */
export type UisView =
  | { kind: 'stop'; stop: UisStop; day: UisDay; action: 'fill' | 'export' } // ⑥⑦⑨⑩⑪⑫
  | { kind: 'done'; day: UisDay; cells: readonly UisCell[]; result: FillResult; canUndo: boolean } // ③④⑤⑧
  | { kind: 'exported'; day: UisDay; fileName: string } // 10-3
  | { kind: 'range' }
  | { kind: 'first' }
  | { kind: 'err'; code: string }

/** 안내 단추가 알리는 것(design.md 8-6): 닫기 · 있는 엑셀로 채우기 · 엑셀로 받기 · 의사랑 값 채우기 · 되돌리기 · 설정 열기 */
export type UisAction = 'close' | 'fillAnyway' | 'export' | 'fill' | 'undo' | 'settings'

/** 건너뛴 칸 까닭(지금 panel.ts SKIP_TEXT 열쇠) */
export type UisSkipKind = 'notFound' | 'therapist' | 'locked' | 'noName' | 'unpicked'

/** panel.ts가 넘기는 지금 비트 안내 글(design.md 10-2 '지금 그대로' 글) */
export type PanelWords = {
  placeLine(places: readonly Where[]): string
  skip: Readonly<Record<UisSkipKind, { readonly title: string; readonly help: string }>>
  /** 10-2 10. 끝 줄 */
  end: string
  /** ⑭ 뒤 줄 */
  firstHelp: string
  /** [빈 칸만]으로 그대로 둔 칸 줄 */
  kept(n: number): string
  /** 오류 안내 작은 줄 */
  errUntouched(code: string): string
}

/** 10-2 6. 건너뛴 칸 차례(design.md 10-2 적은 차례) */
const SKIPS: readonly UisSkipKind[] = ['unpicked', 'noName', 'notFound', 'therapist', 'locked']

type Child = Node | string | null | undefined | false

/**
 * 의사랑 안내 하나를 그린다. head = 머리 작은 글, body = 안내 몸통(자식들을 panel.ts가 안내 틀로 옮긴다),
 * buttons = 단추 줄 단추(차례 그대로, 없으면 빈 목록). 단추를 누르면 act(그 동작). 'close'도 알리기만 하고 닫기는 panel.ts가 한다
 */
export function renderUis(
  doc: Document,
  view: UisView,
  act: (a: UisAction) => void,
  words: PanelWords,
): { head: string; body: HTMLElement; buttons: HTMLButtonElement[] } {
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: Child[]) => {
    const node = doc.createElement(tag)
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value)
    for (const child of children) if (child) node.append(child)
    return node
  }
  const p = (text: Child, cls = '') => h('p', cls ? { class: cls } : {}, text)
  const lead = (text: string, err = false) => p(text, err ? 'lead err' : 'lead')
  const small = (text: string) => p(text, 'small')
  const button = (label: string, action: UisAction) => {
    const one = h('button', { type: 'button', class: 'btn btn-2' }, label)
    one.addEventListener('click', () => {
      if (!one.disabled) act(action)
    })
    return one
  }
  const T = UIS_TEXT

  /** 칸 묶음 하나: 제목 '{이름} ' + 굵은 '{N}칸' · 짧은 줄 이름 · 그 밖 줄 */
  const block = (title: string, places: readonly Where[], ...rest: Child[]) =>
    h('div', { class: 'blk' }, h('p', { class: 'h' }, `${title} `, h('b', {}, T.cells(places.length))), p(words.placeLine(places), 'rows'), ...rest)

  /** 10-2 3. 지움 · 앞서 읽음 · 종류 모름 · 남김 · 못 지움(빨강) 줄 — 10-3에도 같은 줄 */
  const cleanup = (day: UisDay): Child[] => {
    const u = day.uis
    const read = u.deleted - u.unknownFiles
    const cached = u.reports.filter((r) => r.cached).length
    return [
      read > 0 && p(T.cleanup.deleted(read), 'kept'),
      cached > 0 && p(T.cleanup.cached(cached), 'kept'),
      u.unknownFiles > 0 && p(T.cleanup.unknown(u.unknownFiles), 'kept'),
      u.kept > 0 && p(T.cleanup.kept(u.kept), 'kept'),
      failed(day),
    ]
  }
  const failed = (day: UisDay): Child =>
    day.uis.deleteFailed > 0 && p(T.cleanup.failed(day.uis.deleteFailed, UIS_FOLDER_TEXT[day.uis.folder]), 'bad')

  /** ⑥⑦ 저장할 엑셀 6줄: '{번호}. {보고서}' + 있음 · 있음 (앞서 읽음) · 없음 */
  const saveList = (day: UisDay) => {
    const rows = UIS_KINDS.map((kind, i) => {
      const r = reportOf(day, kind)
      const have = r?.state === 'ok'
      const state = have ? (r.cached ? T.files.cached : T.files.have) : T.files.none
      return h('li', {}, h('span', { class: 'nm' }, T.files.row(i + 1, UIS_REPORT_NAMES[kind])), h('span', { class: have ? 'st ok' : 'st bad' }, state))
    })
    return h('div', { class: 'files' }, h('p', { class: 'h' }, h('span', {}, T.files.head)), h('ol', {}, ...rows))
  }

  /** ⑨ 파일이 있는 보고서마다 조회일(날짜 다름은 빨강, 조회일이 없으면 '찾지 못함') */
  const dateList = (day: UisDay) => {
    const rows = day.uis.reports
      .filter((r) => r.state !== 'missing')
      .map((r) =>
        h(
          'li',
          {},
          h('span', { class: 'nm' }, UIS_REPORT_NAMES[r.kind]),
          h('span', { class: r.state === 'otherDate' ? 'st bad' : 'st' }, r.from === null ? T.date.notFound : T.date.range(r.from, r.to)),
        ),
      )
    const head = h('p', { class: 'h' }, h('span', {}, T.date.headDay(day.date)), h('span', {}, T.date.headExcel))
    return h('div', { class: 'files' }, head, h('ol', {}, ...rows))
  }

  function stopParts(stop: UisStop, day: UisDay): { lines: Child[]; buttons: HTMLButtonElement[] } {
    const folder = UIS_FOLDER_TEXT[day.uis.folder]
    switch (stop.kind) {
      case 'open': {
        // ⑫ 보고서 이름을 짐작한 것만 UIS_KINDS 차례로 한 번씩, 하나도 모르면 'ERP마감 폴더의 엑셀이 …'
        const known = UIS_KINDS.filter((kind) => stop.kinds.includes(kind)).map((kind) => UIS_REPORT_NAMES[kind])
        const how = known.length > 0 ? T.open.how(known.join(' · ')) : T.open.howUnknown
        return { lines: [lead(T.open.lead, true), p(how), small(T.open.why), small(T.open.code)], buttons: [] }
      }
      case 'otherDate':
        return {
          lines: [
            lead(T.date.lead),
            dateList(day),
            p(T.date.how(stop.reports.length, day.date)),
            small(T.date.kept),
            stop.patientDeleted && small(T.date.patientDeleted),
          ],
          buttons: [],
        }
      case 'notAll':
        // 답에 라벨 이름 칸이 없어 늘 '외/입 구분' 글(cond.lead)
        return {
          lines: [lead(T.cond.lead(UIS_REPORT_NAMES[stop.report.kind], stop.report.value ?? '')), p(T.cond.how), small(T.untouched)],
          buttons: [],
        }
      case 'twice':
        // 답에 같은 엑셀 수 칸이 없어 수를 말하지 않는다('여러 개', design.md 10-1 ⑪, 고침 1)
        return {
          lines: [
            lead(T.dup.lead(UIS_REPORT_NAMES[stop.report.kind])),
            p(T.dup.how(folder)),
            small(T.dup.why),
            UIS_PATIENT.includes(stop.report.kind) && small(T.dup.patient),
          ],
          buttons: [],
        }
      case 'missing':
        return {
          lines: [
            lead(T.missing.lead),
            saveList(day),
            small(T.missing.optional),
            p(T.missing.how(day.date)),
            p(T.missing.where(folder), 'kept'),
            small(T.missing.person),
            small(T.untouched),
          ],
          buttons: [button(T.openSettings, 'settings')],
        }
      case 'some': {
        const one = stop.missing.length === 1 ? T.some.one(UIS_REPORT_NAMES[stop.missing[0]]) : T.some.many(stop.missing.length)
        return {
          lines: [lead(one), saveList(day), p(T.missing.how(day.date)), p(T.missing.where(folder), 'kept'), small(`${T.untouched} ${T.some.help}`)],
          buttons: [button(T.close, 'close'), button(T.exportButton, 'export'), button(T.fillAnyway, 'fillAnyway')],
        }
      }
    }
  }

  function doneParts(view: Extract<UisView, { kind: 'done' }>): Child[] {
    const { day, cells, result } = view
    const places = (why: UisCell['why']) => cells.filter((c) => c.why === why)
    const totals = [
      day.money.total !== null && p(T.check.total(day.money.total), 'n'),
      day.money.received !== null && p(T.check.received(day.money.received), 'n'),
      day.patients.total !== null && p(T.check.patients(day.patients.total), 'n'),
    ].filter(Boolean)
    // 4. 엑셀이 없어 비워 둔 칸: 보고서마다 까닭 한 줄(UIS_KINDS 차례)
    const missing = places('missing')
    const absentReports = UIS_KINDS.filter((kind) => missing.some((c) => c.report === kind))
    // 5. 의사랑에서 읽지 못한 칸: 까닭 줄(uisCells.unreadLines) 뒤에 할 일
    const unknown = places('unknown')
    const whys = unreadLines(day, cells)
    // 6. 건너뛴 칸(지금 글 그대로)
    const skipped: Record<UisSkipKind, readonly Where[]> = {
      unpicked: result.unpicked,
      noName: result.noName,
      notFound: result.skipped.filter((s) => s.skip === 'notFound').map((s) => s.where),
      therapist: result.skipped.filter((s) => s.skip === 'therapist').map((s) => s.where),
      locked: result.skipped.filter((s) => s.skip === 'locked').map((s) => s.where),
    }
    const none = places('none')
    // 8. 맞춰 보기 경고(uisCells.checkLines) 뒤에 뒤 줄
    const warnings = checkLines(day)
    const rsv = day.uis.reservations
    return [
      totals.length > 0 && h('div', { class: 'check' }, p(T.check.title, 'h'), ...totals, small(T.check.help)),
      lead(T.filled(day.date, result.filled)),
      result.kept > 0 && p(words.kept(result.kept), 'kept'),
      ...cleanup(day),
      missing.length > 0 &&
        block(T.absent.title, missing.map((c) => c.where), ...absentReports.map((kind) => small(T.absent.why(UIS_REPORT_NAMES[kind])))),
      unknown.length > 0 &&
        block(
          T.unread.title,
          unknown.map((c) => c.where),
          whys.length > 0 && h('ul', { class: 'whys' }, ...whys.map((line) => h('li', {}, line))),
          small(T.unread.help),
        ),
      ...SKIPS.map((kind) => skipped[kind].length > 0 && block(words.skip[kind].title, skipped[kind], small(words.skip[kind].help))),
      none.length > 0 &&
        h(
          'div',
          { class: 'blk' },
          h('p', { class: 'h' }, `${T.none.title} `, h('b', {}, T.cells(none.length))),
          ...T.none.rows.map(([journal, rows]) => h('p', { class: 'rows' }, h('b', {}, journal), ` ${rows}`)),
          small(T.none.help),
        ),
      warnings.length > 0 && h('ul', { class: 'warns' }, ...warnings.map((line) => h('li', {}, line))),
      warnings.length > 0 && small(T.warn.after),
      rsv !== null && p(T.reservations(rsv.total, rsv.visited)),
      p(words.end, 'end'),
    ]
  }

  let head: string = T.head.fill
  let lines: Child[]
  let buttons: HTMLButtonElement[] = []
  switch (view.kind) {
    case 'stop': {
      head = T.head[view.action]
      const drawn = stopParts(view.stop, view.day)
      // 멈춤 안내에도 지우지 못한 파일이 있으면 빨강 줄(design.md 10-1 끝)
      lines = [...drawn.lines, failed(view.day)]
      buttons = drawn.buttons
      break
    }
    case 'done':
      lines = doneParts(view)
      buttons = [
        ...(view.canUndo ? [button(T.undo, 'undo')] : []),
        button(T.exportButton, 'export'),
        button(T.openSettings, 'settings'),
      ]
      break
    case 'exported':
      head = T.head.export
      lines = [lead(T.exported.lead(view.day.date)), p(T.exported.file(view.fileName)), ...cleanup(view.day), small(T.exported.blank)]
      buttons = [button(T.closeShort, 'close'), button(T.button, 'fill')]
      break
    case 'range':
      head = T.head.range
      lines = [lead(T.range.lead), p(T.range.how), small(T.untouched)]
      buttons = [button(T.closeShort, 'close')]
      break
    case 'first':
      lines = [lead(T.first), small(words.firstHelp)]
      buttons = [button(T.openSettings, 'settings')]
      break
    case 'err': {
      const e = explainFor(view.code, 'uisarang')
      lines = [lead(e.what, true), p(e.how), small(words.errUntouched(e.code))]
      break
    }
  }
  return { head, body: h('div', {}, ...lines), buttons }
}

function reportOf(day: UisDay, kind: UisKind): UisReport | undefined {
  return day.uis.reports.find((r) => r.kind === kind)
}
