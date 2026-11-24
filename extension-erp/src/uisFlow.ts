// 의사랑판 ERP 화면 흐름(spec erp-uisarang design.md 8-7·9-4, TASK-14). main.ts가 자료원을 정해(decideSource) 의사랑이면 단추 셋을 여기로 잇는다
// - 자료원 정하기: 저장된 설정으로 먼저 정하고(비트만 = 비트 · 의사랑만 = 의사랑, 도우미 부름 없음), 둘 다 저장돼 있을 때만 closing.source를
//   한 번(5초) 묻는다. 둘 다 없으면 도우미를 부르지 않고 비트다 — 명세(AC-4211.1)는 이때도 묻지만, 설정 저장 전 비트 화면은 도우미를 부르지 않는다는
//   지금 시험(AC-3609.2·AC-3701.3)과 AC-4215.2·4215.3을 지키려고 묻지 않는다. 그 대신 비트 흐름이 '설정 없음'에 닿으면 main.ts가 다시 정한다
// - [의사랑 값 채우기]: 마감 일자 없음·오늘 뒤 → 지금 글 · 의사랑 설정 없음 → 설정 화면 + ⑭ · 읽는 중 → closing.day(toUisArgs) →
//   오류 → 의사랑 오류 글 · 답에 source 없음(비트 도우미) → E-CLOSING-WRONG-SOURCE · 틀린 답 → E-BRIDGE-BAD-REPLY · 날짜 바뀜 → 지금 글 ·
//   멈춤(stopOf) → ⑥⑦⑨⑩⑪⑫ · 진료 0건 묻기 · 읽기 전용 · 이미 적힌 칸 묻기(survey(planUisCells)) · fillAll → 결과 안내(③④⑤⑧)
// - [엑셀로 받기](단추 줄): 앞 다섯 단계 같음 → ⑥⑨⑩⑪⑫면 멈춤(⑦은 묻지 않고 받음) → .xlsx 받기 → 받았어요 안내. ERP 칸은 바꾸지 않는다
// - 들고 있는 답(held): 마지막으로 읽은 답 하나를 이 화면 기억에만 둔다(chrome.storage에 쓰지 않음). 안내 안 [있는 엑셀로 채우기]·[엑셀로 받기]·
//   [의사랑 값 채우기]는 다시 읽지 않고 이것을 쓴다. 단추 줄 두 단추는 늘 다시 읽는다(새로 저장한 엑셀을 읽고 지우려고). 쓸 때 마감 일자가
//   다르면 버리고 지금 dateChanged 글, 화면을 떠나면(reset) 버린다
// - [되돌리기]·[지난 결과]·읽기 전용·묻기는 지금 비트 흐름(main.ts)과 같은 차례·같은 글이다
// - 받기는 내용 스크립트의 Blob 주소 + a[download] 누름이고(새 권한 없음) Blob 주소는 1초 안에 되돌린다. 파일·답을 어디에도 저장하지 않는다
import { readDate } from './erpday.js'
import { E_BRIDGE_BAD_REPLY, E_BRIDGE_DISCONNECTED, E_CLOSING_FUTURE_DATE, E_CLOSING_WRONG_SOURCE, E_HELPER_TIMEOUT } from './errors.js'
import { fillAll, survey, undoAll, type FillMode, type UndoEntry } from './fill.js'
import type { Dock } from './panel.js'
import type { ClosingCommand } from './types.js'
import { planUisCells, readUisDay, stopOf, uisCells } from './uisCells.js'
import { loadUis, savedSources, toUisArgs } from './uisSettings.js'
import { UIS_SHEET_NAME, UIS_SHEET_WIDTHS, uisFileName, uisSheetRows } from './uisSheet.js'
import type { Send, Source, UisDay, UisSettings } from './uisTypes.js'
import type { UisAction, UisView } from './uisView.js'
import { workbookBytes, XLSX_TYPE } from './xlsxWrite.js'

/** closing.source 답을 기다리는 가장 긴 시간(넘으면 비트) */
export const SOURCE_TIMEOUT_MS = 5_000
/** 의사랑 closing.day 답을 기다리는 가장 긴 시간(서비스 워커도 같은 시간에 연결을 닫는다, main.ts READ_TIMEOUT_MS와 같음) */
export const UIS_READ_TIMEOUT_MS = 120_000
/** 받기 Blob 주소를 되돌리기까지(누른 뒤 1초 안) */
export const REVOKE_MS = 500

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 도우미 명령 하나: result면 data, error면 번호, 끊김 E-BRIDGE-DISCONNECTED, 늦음 E-HELPER-TIMEOUT, 그 밖 E-BRIDGE-BAD-REPLY */
async function ask(send: Send, cmd: ClosingCommand, args: Record<string, unknown>, ms: number): Promise<{ data: unknown } | { code: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<'late'>((done) => {
    timer = setTimeout(() => done('late'), ms)
  })
  let reply: unknown
  try {
    reply = await Promise.race([send(cmd, args), late])
  } catch {
    return { code: E_BRIDGE_DISCONNECTED }
  } finally {
    clearTimeout(timer)
  }
  if (reply === 'late') return { code: E_HELPER_TIMEOUT }
  if (isRecord(reply) && reply.type === 'error') return { code: typeof reply.code === 'string' ? reply.code : E_BRIDGE_BAD_REPLY }
  if (isRecord(reply) && reply.type === 'result') return { data: reply.data }
  return { code: E_BRIDGE_BAD_REPLY }
}

/**
 * 이 PC의 자료원(AC-4211.1, design.md 11절 19): 비트 설정만 → 비트 · 의사랑 설정만 → 의사랑(둘 다 도우미 부름 없음) ·
 * 둘 다 → closing.source를 한 번 묻고(5초) { source: 'uisarang' }일 때만 의사랑, 그 밖(비트 답·옛 도우미·도우미 없음·늦음·틀린 답)은 비트.
 * 둘 다 없거나 저장소를 못 읽으면 부르지 않고 비트(머리 주석 — 명세와 다른 곳). 던지지 않는다
 */
export async function decideSource(send: Send): Promise<Source> {
  let saved: { bit: boolean; uis: boolean }
  try {
    saved = await savedSources()
  } catch {
    return 'bit'
  }
  if (!saved.uis) return 'bit'
  if (!saved.bit) return 'uisarang'
  const got = await ask(send, 'closing.source', {}, SOURCE_TIMEOUT_MS)
  return 'data' in got && isRecord(got.data) && got.data.source === 'uisarang' ? 'uisarang' : 'bit'
}

/** .xlsx 바이트를 받게 한다(AC-4213.4): Blob 주소 + a[download]를 한 번 누르고 a를 뗀 뒤, 그 주소를 REVOKE_MS 뒤 되돌린다 */
export function downloadBytes(doc: Document, bytes: Uint8Array, name: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: XLSX_TYPE }))
  const link = doc.createElement('a')
  link.href = url
  link.download = name
  link.hidden = true
  doc.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_MS)
  }
}

/** 들고 있는 답: 읽은 마감 일자 · 답 · 그때 쓴 의사랑 설정(칸 계획이 답의 묶음과 맞게) */
type Held = { date: string; day: UisDay; settings: UisSettings }
/** [되돌리기]·[지난 결과] 기억(이 화면에만) */
type Memory = { date: string; undo: UndoEntry[]; view: Extract<UisView, { kind: 'done' }> }

export type UisFlow = {
  /** 단추 줄 [의사랑 값 채우기](늘 다시 읽는다) */
  fill(): Promise<void>
  /** 단추 줄 [엑셀로 받기](늘 다시 읽는다) */
  exportXlsx(): Promise<void>
  /** 단추 줄 [기간 채우기]: ⑬만 */
  range(): void
  /** 의사랑 안내 단추(panel onUisAction) */
  act(a: UisAction): void
  /** 화면을 떠남: 들고 있는 답·기억을 버리고 떠나기 전에 시작한 일의 답은 버린다 */
  reset(): void
}

export function createUisFlow(deps: { doc: Document; dock: Dock; send: Send; openSettings(): void; today(): string }): UisFlow {
  const { doc, dock, send } = deps
  /** reset()마다 1씩: 앞서 시작한 일은 끝에서 버린다 */
  let epoch = 0
  let busy = false
  let held: Held | null = null
  let memory: Memory | null = null

  const remember = (next: Memory | null) => {
    memory = next
    dock.setLastUis(next ? next.view : null)
  }

  /** 하나씩만 돈다(도는 중 누름은 무시). still() = 그사이 화면을 떠나지 않았나 */
  async function guarded(work: (still: () => boolean) => Promise<void>): Promise<void> {
    if (busy) return
    const mine = epoch
    const still = () => mine === epoch
    busy = true
    try {
      await work(still)
    } finally {
      if (still()) {
        busy = false
        dock.setUisReading(null)
      }
    }
  }

  /** 마감 일자가 date가 아니면 들고 있는 답을 버리고 지금 글을 보인 뒤 true */
  const moved = (date: string) => {
    if (readDate(doc) === date) return false
    held = null
    dock.show({ kind: 'dateChanged' })
    return true
  }

  /** 안내 안 단추가 쓸 들고 있는 답(마감 일자가 그대로일 때만). 없거나 날짜가 다르면 버리고 지금 dateChanged 글 */
  function heldNow(): Held | null {
    const h = held
    if (h && readDate(doc) === h.date) return h
    held = null
    dock.show({ kind: 'dateChanged' })
    return null
  }

  /** 단추 줄: 앞 다섯 단계 → closing.day → 답 검사 → 들고 있는 답. 멈추거나 오류면 null(안내는 이미 보임) */
  async function read(which: 'fill' | 'export', still: () => boolean): Promise<Held | null> {
    dock.hide()
    const date = readDate(doc)
    if (!date) {
      dock.show({ kind: 'errDate' })
      return null
    }
    if (date > deps.today()) {
      dock.show({ kind: 'future', date })
      return null
    }
    let settings: UisSettings | null
    try {
      settings = await loadUis()
    } catch {
      if (still()) dock.showUis({ kind: 'err', code: E_BRIDGE_DISCONNECTED })
      return null
    }
    if (!still()) return null
    if (!settings) {
      deps.openSettings()
      dock.showUis({ kind: 'first' })
      return null
    }
    dock.setUisReading(which)
    const got = await ask(send, 'closing.day', toUisArgs(date, settings), UIS_READ_TIMEOUT_MS)
    if (!still()) return null
    dock.setUisReading(null)
    if ('code' in got) {
      // 도우미가 오늘 뒤 날짜라고 하면 확장의 같은 멈춤 글(비트와 같음)
      if (got.code === E_CLOSING_FUTURE_DATE) dock.show({ kind: 'future', date })
      else dock.showUis({ kind: 'err', code: got.code })
      return null
    }
    const day = readUisDay(got.data, date)
    if (!day) {
      // source 칸이 없는 답 = 비트 자료원 도우미의 답
      const bitHelper = isRecord(got.data) && !('source' in got.data)
      dock.showUis({ kind: 'err', code: bitHelper ? E_CLOSING_WRONG_SOURCE : E_BRIDGE_BAD_REPLY })
      return null
    }
    if (moved(date)) return null
    held = { date, day, settings }
    return held
  }

  /** 읽은 답으로 다음 차례: 채우기면 멈춤 → 채움, 받기면 ⑥⑨⑩⑪⑫ 멈춤(⑦은 묻지 않음) → 받기 */
  async function next(which: 'fill' | 'export', h: Held, still: () => boolean): Promise<void> {
    const stop = stopOf(h.day)
    if (which === 'fill') {
      if (stop) dock.showUis({ kind: 'stop', stop, day: h.day, action: 'fill' })
      else await fillFrom(h, still)
      return
    }
    if (stop && stop.kind !== 'some') dock.showUis({ kind: 'stop', stop, day: h.day, action: 'export' })
    else exportFrom(h)
  }

  /** 진료 0건 묻기 → 읽기 전용 → 이미 적힌 칸 묻기 → 채움 → 결과 안내(지금 비트 하루 채우기와 같은 차례) */
  async function fillFrom(h: Held, still: () => boolean): Promise<void> {
    const { date, day, settings } = h
    if (day.patients.total === 0) {
      const go = await dock.askZero(date)
      if (!still() || !go || moved(date)) return
    }
    const plan = planUisCells(day, settings)
    const seen = await survey(doc, plan)
    if (!still()) return
    if (seen.fillable === 0 && seen.locked > 0) {
      dock.show({ kind: 'readOnly' })
      return
    }
    let mode: FillMode = 'all'
    if (seen.written.length > 0) {
      const answer = await dock.askWritten(seen.written)
      if (!still() || answer === null) return
      mode = answer
    }
    if (moved(date)) return
    // 다음 채우기: 앞 기억을 지우고 이번 것만 둔다
    remember(null)
    const result = await fillAll(doc, plan, mode)
    if (!still()) return
    const view: Memory['view'] = { kind: 'done', day, cells: uisCells(day, settings), result, canUndo: result.undo.length > 0 }
    remember({ date, undo: result.undo, view })
    dock.showUis(view)
  }

  /** 시트 줄 → .xlsx → 받기 → 받았어요 안내(ERP 칸은 건드리지 않음). 시트를 만들지 못하면 E-BRIDGE-BAD-REPLY */
  function exportFrom(h: Held): void {
    let fileName: string
    try {
      const bytes = workbookBytes(uisSheetRows(h.day, h.settings), { sheetName: UIS_SHEET_NAME, widths: UIS_SHEET_WIDTHS }, new Date())
      fileName = uisFileName(h.day.date)
      downloadBytes(doc, bytes, fileName)
    } catch {
      dock.showUis({ kind: 'err', code: E_BRIDGE_BAD_REPLY })
      return
    }
    dock.showUis({ kind: 'exported', day: h.day, fileName })
  }

  /** [되돌리기]: 채울 때와 같은 마감 일자일 때만(지금 비트와 같음) */
  async function undo(): Promise<void> {
    if (busy || !memory) return
    const kept = memory
    if (readDate(doc) !== kept.date) {
      dock.show({ kind: 'undoDateChanged' })
      return
    }
    await guarded(async (still) => {
      const { restored, gone, edited } = await undoAll(doc, kept.undo)
      if (!still()) return
      remember(null)
      dock.show({ kind: 'undone', restored, gone, edited })
    })
  }

  /** 안내 안 단추: 들고 있는 답으로 */
  const fromHeld = (work: (h: Held, still: () => boolean) => Promise<void> | void) =>
    void guarded(async (still) => {
      const h = heldNow()
      if (h) await work(h, still)
    })

  return {
    fill: () =>
      guarded(async (still) => {
        const h = await read('fill', still)
        if (h && still()) await next('fill', h, still)
      }),
    exportXlsx: () =>
      guarded(async (still) => {
        const h = await read('export', still)
        if (h && still()) await next('export', h, still)
      }),
    range() {
      dock.showUis({ kind: 'range' })
    },
    act(a) {
      switch (a) {
        case 'close':
          // 안내는 panel이 이미 닫았다. 들고 있는 답은 그대로(같은 마감 일자 동안)
          return
        case 'settings':
          deps.openSettings()
          return
        case 'undo':
          void undo()
          return
        case 'fillAnyway':
          // ⑦ [있는 엑셀로 채우기]: 멈춤을 건너뛰고 진료 0건 묻기부터
          fromHeld((h, still) => fillFrom(h, still))
          return
        case 'fill':
          fromHeld((h, still) => next('fill', h, still))
          return
        case 'export':
          fromHeld((h, still) => next('export', h, still))
          return
      }
    },
    reset() {
      epoch += 1
      busy = false
      held = null
      memory = null
    },
  }
}
