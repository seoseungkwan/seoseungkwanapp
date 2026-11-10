// ERP 마감일지 화면(`/h/closing`) 쪽 흐름(design.md 1절·4절, REQ-3609). content.ts가 import()로 불러 startPage()를 부른다
// - 주소가 /h/closing이고 '마감 일자'가 있을 때만 오른쪽 아래에 단추를 붙인다. 화면 안 이동(주소만 바뀜)은 0.5초마다 보고 안다
// - 누르면: 마감 일자 읽기 → 설정(저장한 적 없으면 설정 화면 열기) → 서비스 워커에 closing.day(120초) → 날짜가 그대로면
//   cells.ts 칸 계획대로 fill.ts가 채우고 panel.ts가 안내한다. 오류·날짜 바뀜이면 어느 칸도 바꾸지 않는다. 저장은 사용자가 누른다
// - 도우미 답은 이 흐름 안에서만 쓰고 어디에도 두지 않는다
import { planCells } from './cells.js'
import { fillAll } from './fill.js'
import { createDock, HOST_ID, type Dock, type View } from './panel.js'
import { load, toGroups } from './settings.js'
import type { ClosingDay, MoneyKey, Settings } from './types.js'

/** 단추를 붙이는 화면 주소 */
export const PAGE_PATH = '/h/closing'
/** 화면 안 이동을 보는 간격 */
export const WATCH_MS = 500
/** 도우미 답을 기다리는 가장 긴 시간(서비스 워커도 같은 시간에 연결을 닫는다) */
export const READ_TIMEOUT_MS = 120_000

const DATE_LABEL = '마감 일자'
const YEAR_PICKER = '연도 선택'
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/
const TODAY = /(\d{4}-\d{2}-\d{2})\s*\(오늘\)/
/** 서비스 워커가 120초를 넘겼을 때 주는 번호(background.ts) */
const E_HELPER_TIMEOUT = 'E-HELPER-TIMEOUT'
const E_HELPER_MISSING = 'E-HELPER-MISSING'
/** ERP 도우미가 이 PC 등록을 찾지 못함(설치 때 등록을 취소했거나 못 한 때, AC-3606.3) */
const E_BIT_NOT_REGISTERED = 'E-BIT-NOT-REGISTERED'
const E_BRIDGE_BAD_REPLY = 'E-BRIDGE-BAD-REPLY'
/** 서비스 워커에 닿지 못함(확장을 다시 읽어 이 화면의 내용 스크립트가 끊긴 때 등) */
const E_BRIDGE_DISCONNECTED = 'E-BRIDGE-DISCONNECTED'
/** 도우미 오류 번호 모양(src/lib/bridge/protocol.ts와 같음). 아니면 글을 보이지 않고 E-BRIDGE-BAD-REPLY */
const ERROR_CODE = /^E-[A-Z0-9]+(?:-[A-Z0-9]+)*$/

const tidy = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim()

/** 있는 날짜인 'YYYY-MM-DD'면 그대로, 아니면 null */
function realDay(text: string): string | null {
  const m = DAY.exec(text)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const at = new Date(Date.UTC(y, mo - 1, d))
  return at.getUTCFullYear() === y && at.getUTCMonth() === mo - 1 && at.getUTCDate() === d ? text : null
}

function dateLabels(doc: Document): HTMLLabelElement[] {
  return [...doc.querySelectorAll('label')].filter((label) => tidy(label.textContent) === DATE_LABEL)
}

/**
 * 마감 일자: '마감 일자' label과 같은 줄의 날짜 칸(input.datepicker-input, '연도 선택' 칸 말고) 값,
 * 없으면 원무 권한 화면의 'YYYY-MM-DD (오늘)' 글자. 고르지 않았거나 날짜가 아니면 null
 */
export function readDate(doc: Document): string | null {
  for (const label of dateLabels(doc)) {
    // 같은 줄: label의 부모부터 세 겹까지(달력 도구가 칸을 감싸도 찾게)
    let row = label.parentElement
    for (let up = 0; row && up < 3; up += 1, row = row.parentElement) {
      const input = [...row.querySelectorAll<HTMLInputElement>('input.datepicker-input')].find(
        (el) => el.getAttribute('aria-label') !== YEAR_PICKER,
      )
      if (input) return realDay(input.value.trim())
      const today = TODAY.exec(row.textContent ?? '')
      if (today) return realDay(today[1])
    }
  }
  return null
}

/** 단추를 둘 화면인가: 주소가 /h/closing이고 '마감 일자'가 있다 */
export function onClosingPage(doc: Document): boolean {
  const pathname = doc.defaultView?.location.pathname ?? ''
  return (pathname === PAGE_PATH || pathname === `${PAGE_PATH}/`) && dateLabels(doc).length > 0
}

// --- 도우미 답 모양 검사(아는 칸이 맞는 모양일 때만 쓴다) ---

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isCount = (value: unknown) => value === null || isNumber(value)
const numbers = (value: unknown, keys: string[]) => isRecord(value) && keys.every((key) => isNumber(value[key]))
const THREE = ['new', 'first90', 'return']
const MONEY: MoneyKey[] = ['total', 'insurer', 'receivableIn', 'unpaidNew', 'noncovered', 'discount', 'disabledFund', 'received', 'card', 'cash', 'transfer', 'refund']

/** closing.day 답(design.md 2절 모양)이고 부른 날짜의 답이면 그대로, 아니면 null */
export function readDay(data: unknown, date: string): ClosingDay | null {
  if (!isRecord(data) || data.date !== date) return null
  const { patients, groups, ages, money, reservations, injection, warnings } = data
  const ok =
    numbers(patients, [...THREE, 'noExamFee', 'total']) &&
    isRecord(patients) &&
    isCount(patients.ptVisit) &&
    Array.isArray(groups) &&
    groups.every((g) => numbers(g, [...THREE, 'patients', 'total', 'unpaidVisits']) && isRecord(g) && typeof g.key === 'string') &&
    Array.isArray(ages) &&
    ages.every((a) => numbers(a, THREE) && isRecord(a) && typeof a.band === 'string') &&
    isRecord(money) &&
    MONEY.every((key) => isCount(money[key])) &&
    isNumber(data.inpatientVisits) &&
    isRecord(reservations) &&
    isNumber(reservations.patients) &&
    Array.isArray(reservations.kinds) &&
    reservations.kinds.every((k) => numbers(k, ['total', 'visited', 'changed', 'canceled']) && isRecord(k) && typeof k.kind === 'string') &&
    (injection === null || (numbers(injection, ['newPatients', 'newLines']) && isRecord(injection) && isCount(injection.firstTime))) &&
    numbers(warnings, ['unpaidVisits', 'unknownAge']) &&
    isRecord(warnings) &&
    ['moneyUnconfirmed', 'splitUnconfirmed', 'noHistory'].every((key) => typeof warnings[key] === 'boolean')
  return ok ? (data as ClosingDay) : null
}

// --- 서비스 워커에 묻기 ---

type Outcome = { kind: 'day'; day: ClosingDay } | { kind: 'view'; view: View }

const errorView = (code: unknown): View => {
  if (code === E_HELPER_MISSING) return { kind: 'errHelper' }
  if (code === E_BIT_NOT_REGISTERED) return { kind: 'errNotRegistered' }
  if (code === E_HELPER_TIMEOUT) return { kind: 'errTimeout' }
  return { kind: 'errBit', code: typeof code === 'string' && ERROR_CODE.test(code) ? code : E_BRIDGE_BAD_REPLY }
}

async function askDay(date: string, settings: Settings): Promise<Outcome> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<'late'>((done) => {
    timer = setTimeout(() => done('late'), READ_TIMEOUT_MS)
  })
  let reply: unknown
  try {
    reply = await Promise.race([chrome.runtime.sendMessage({ cmd: 'closing.day', args: { date, groups: toGroups(settings) } }), late])
  } catch {
    return { kind: 'view', view: { kind: 'errBit', code: E_BRIDGE_DISCONNECTED } }
  } finally {
    clearTimeout(timer)
  }
  if (reply === 'late') return { kind: 'view', view: { kind: 'errTimeout' } }
  if (isRecord(reply) && reply.type === 'error') return { kind: 'view', view: errorView(reply.code) }
  const day = isRecord(reply) && reply.type === 'result' ? readDay(reply.data, date) : null
  return day ? { kind: 'day', day } : { kind: 'view', view: { kind: 'errBit', code: E_BRIDGE_BAD_REPLY } }
}

/** 설정 화면은 서비스 워커가 연다(내용 스크립트는 확장 화면을 열 수 없다) */
function openSettings(): void {
  try {
    chrome.runtime.sendMessage({ open: 'options' }).catch(() => {})
  } catch {
    // 확장과 끊긴 화면: 열 수 없다
  }
}

/** ERP 화면에서 단추를 붙이고 지킨다. stop()은 단추를 떼고 보기를 멈춘다 */
export function startPage(doc: Document = document): { stop(): void } {
  doc.getElementById(HOST_ID)?.remove() // 앞서 붙은 것(확장을 다시 읽은 뒤 등)
  /** 화면을 떠날 때마다 1씩: 떠나기 전에 시작한 읽기의 답은 버린다 */
  let visit = 0
  let busy = false
  const dock: Dock = createDock(doc, { onFill: () => void run(), onOpenSettings: openSettings })

  async function run() {
    if (busy) return
    const mine = visit
    const still = () => mine === visit
    dock.hide()
    const date = readDate(doc)
    if (!date) {
      dock.show({ kind: 'errDate' })
      return
    }
    busy = true
    try {
      let settings: Settings | null
      try {
        settings = await load()
      } catch {
        if (still()) dock.show({ kind: 'errBit', code: E_BRIDGE_DISCONNECTED })
        return
      }
      if (!still()) return
      if (!settings) {
        openSettings()
        dock.show({ kind: 'first' })
        return
      }
      dock.setReading(true)
      const outcome = await askDay(date, settings)
      if (!still()) return
      dock.setReading(false)
      if (outcome.kind === 'view') {
        dock.show(outcome.view)
        return
      }
      if (readDate(doc) !== date) {
        dock.show({ kind: 'dateChanged' })
        return
      }
      const result = await fillAll(doc, planCells(outcome.day, settings))
      if (still()) dock.show({ kind: 'done', date, result, day: outcome.day })
    } finally {
      if (still()) {
        busy = false
        dock.setReading(false)
      }
    }
  }

  function leave() {
    visit += 1
    busy = false
    dock.setReading(false)
    dock.hide()
    dock.host.remove()
  }

  function watch() {
    const here = onClosingPage(doc)
    if (here && !dock.host.isConnected) doc.body.append(dock.host)
    else if (!here && dock.host.isConnected) leave()
  }

  watch()
  const timer = setInterval(watch, WATCH_MS)
  return {
    stop() {
      clearInterval(timer)
      leave()
    },
  }
}
