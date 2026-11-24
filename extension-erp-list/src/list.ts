// 'ERP 마감일지 입력 목록' 화면 흐름(spec erp-copy-list design.md 6절, REQ-3903·3905·3906·3907). list.html이 싣는다
// - [목록 만들기]: 기간 막기(지금 pickProblem) → 설정(지금 load, 저장한 적 없으면 설정 화면 열기) → 기간 안 날을 옛날부터 하루씩,
//   앞 답을 받은 뒤 다음 날을 서비스 워커에 묻는다(지금 [비트 값 채우기]와 같은 closing.day 모양 · 120초 · readDay 검사) →
//   다 받으면 목록 모양(rows.js buildList) → 표. 어느 날이든 오류면 멈추고 오류 안내만 보인다(일부 날만 보이는 표는 만들지 않음)
// - 숫자 칸 누름 → 클립보드(안 되면 숨긴 글 칸 + execCommand) → 쪽지 · 복사 표시. [엑셀로 받기] → Blob + a[download]. [설정 열기] → 설정 화면
// - 도우미 답·표·복사 표시는 이 화면 기억(startList 안 변수)에만 둔다. 설정은 읽기만 하고 어디에도 쓰지 않는다(씨암·SONO 고른 것도 쓰지 않음).
//   새로고침하면 처음 안내다. ERP 사이트에는 아무것도 보내지 않는다(이 확장은 사이트에 들어갈 권한이 없다)
import { E_BRIDGE_BAD_REPLY, E_BRIDGE_DISCONNECTED, E_HELPER_TIMEOUT, explain } from '../../extension-erp/src/errors.js'
import { READ_TIMEOUT_MS, readDay } from '../../extension-erp/src/main.js'
import { rangeDays } from '../../extension-erp/src/range.js'
import { localToday, pickProblem, RANGE_TEXT } from '../../extension-erp/src/rangeView.js'
import { load, toGroups } from '../../extension-erp/src/settings.js'
import type { ClosingDay, Settings } from '../../extension-erp/src/types.js'
import { LIST_TEXT, type ListLine, type ListModel } from './listTypes.js'
import { buildList } from './rows.js'
import { copyTail, markCopied, renderError, renderFirst, renderHint, renderList, renderLoading, showToast, syncSlide } from './view.js'
import { fileName, workbookBytes, XLSX_TYPE } from './xlsx.js'

type Row = ListLine & { kind: 'row' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** closing.day 하나(AC-3903.4): 답이 그날 답이면 { day }, 아니면 오류 번호 { code } */
export async function askDay(date: string, settings: Settings): Promise<{ day: ClosingDay } | { code: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<'late'>((done) => {
    timer = setTimeout(() => done('late'), READ_TIMEOUT_MS)
  })
  let reply: unknown
  try {
    reply = await Promise.race([chrome.runtime.sendMessage({ cmd: 'closing.day', args: { date, groups: toGroups(settings) } }), late])
  } catch {
    return { code: E_BRIDGE_DISCONNECTED }
  } finally {
    clearTimeout(timer)
  }
  if (reply === 'late') return { code: E_HELPER_TIMEOUT }
  // 번호 모양이 아니면 E-BRIDGE-BAD-REPLY(explain이 정한다)
  if (isRecord(reply) && reply.type === 'error') return { code: explain(reply.code).code }
  const day = isRecord(reply) && reply.type === 'result' ? readDay(reply.data, date) : null
  return day ? { day } : { code: E_BRIDGE_BAD_REPLY }
}

/** 클립보드: navigator.clipboard.writeText → 실패면 숨긴 글 칸 + execCommand('copy'). 둘 다 안 되면 false */
export async function copyText(doc: Document, text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // 클립보드 길이 막혔다(권한·창 초점 등): 예전 길로 한 번 더
  }
  const area = doc.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  doc.body.append(area)
  area.select()
  let copied = false
  try {
    copied = doc.execCommand('copy') === true
  } catch {
    copied = false
  }
  area.remove()
  return copied
}

/** 목록 모양 → .xlsx 받기(Blob + a[download] 누름, 만든 주소는 한 박자 뒤 지움). 받은 파일 이름 */
export function saveXlsx(doc: Document, model: ListModel, now: Date): string {
  const name = fileName(model)
  const bytes = workbookBytes(model, now)
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type: XLSX_TYPE }))
  const link = doc.createElement('a')
  link.href = url
  link.download = name
  doc.body.append(link)
  link.click()
  link.remove()
  // 바로 지우면 받기가 끊길 수 있다
  setTimeout(() => URL.revokeObjectURL(url), 0)
  return name
}

/** 만든 때 'YYYY-MM-DD HH:MM'(이 PC 시각) */
function madeAtText(now: Date): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return `${localToday(now)} ${two(now.getHours())}:${two(now.getMinutes())}`
}

/** 목록 화면 시작. stop()은 듣기를 떼고 오던 답을 버린다 */
export function startList(doc: Document = document): { stop(): void } {
  const byId = <T extends HTMLElement>(id: string) => {
    const el = doc.getElementById(id)
    if (!el) throw new Error(`list.html에 #${id}가 없다`)
    return el as T
  }
  const fromIn = byId<HTMLInputElement>('from')
  const toIn = byId<HTMLInputElement>('to')
  const make = byId<HTMLButtonElement>('make')
  const xlsx = byId<HTMLButtonElement>('xlsx')
  const help = byId<HTMLElement>('help')
  const stage = byId<HTMLElement>('stage')
  const toast = byId<HTMLElement>('toast')
  const settingsButton = byId<HTMLButtonElement>('openSettings')

  /** [목록 만들기]·[그만두기]·멈춤 때마다 1씩: 앞서 시작한 묻기의 답은 버린다 */
  let run = 0
  /** 지금 보이는 표의 모양(표가 없으면 null) */
  let model: ListModel | null = null
  /** 지금 보이는 표 상자 묶음 */
  let shown: HTMLElement | null = null
  /** 앞서 복사한 칸 · 방금 복사한 칸(data-k). 목록을 다시 만들면 지운다 */
  let copied = new Set<string>()
  let now: string | null = null

  const today = localToday()
  fromIn.value = today
  toIn.value = today
  fromIn.max = today
  toIn.max = today

  const setControls = (busy: boolean, hasList: boolean) => {
    fromIn.disabled = busy
    toIn.disabled = busy
    make.disabled = busy
    xlsx.disabled = !hasList
  }
  const show = (el: HTMLElement) => {
    stage.replaceChildren(el)
    shown = null
  }
  const idle = () => {
    model = null
    setControls(false, false)
    show(renderHint(doc))
  }
  const fail = (code: string) => {
    model = null
    setControls(false, false)
    show(renderError(doc, code))
  }
  const openOptions = () => {
    try {
      chrome.runtime.openOptionsPage().catch(() => {})
    } catch {
      // 확장과 끊긴 화면: 열 수 없다
    }
  }

  async function makeList() {
    help.className = 'help'
    help.textContent = RANGE_TEXT.pick.future
    const from = fromIn.value
    const to = toIn.value
    const problem = pickProblem(from, to, localToday())
    if (problem) {
      help.className = 'help why'
      help.textContent = problem
      return
    }
    run += 1
    const mine = run
    let settings: Settings | null
    try {
      settings = await load()
    } catch {
      if (mine === run) fail(E_BRIDGE_DISCONNECTED)
      return
    }
    if (mine !== run) return
    if (!settings) {
      openOptions()
      model = null
      setControls(false, false)
      show(renderFirst(doc))
      return
    }
    model = null
    copied = new Set()
    now = null
    const days = rangeDays(from, to)
    const cancel = () => {
      run += 1
      idle()
    }
    setControls(true, false)
    show(renderLoading(doc, days.length, 0, cancel))
    const answers: ClosingDay[] = []
    for (const date of days) {
      const got = await askDay(date, settings)
      if (mine !== run) return
      if ('code' in got) {
        fail(got.code)
        return
      }
      answers.push(got.day)
      show(renderLoading(doc, days.length, answers.length, cancel))
    }
    let built: ListModel
    try {
      built = buildList(answers, settings)
    } catch {
      // 날마다 칸 자리가 다르다(뜻밖의 답)
      fail(E_BRIDGE_BAD_REPLY)
      return
    }
    model = built
    setControls(false, true)
    const list = renderList(doc, built, madeAtText(new Date()))
    show(list)
    shown = list
    syncSlide(list)
  }

  /** 숫자 칸 누름(#stage에 하나): 값은 목록 모양에서 data-k(줄 순번|날짜)로 찾는다 */
  async function onStageClick(event: Event) {
    const target = event.target as Element | null
    const button = target?.closest?.<HTMLButtonElement>('button.v')
    const current = model
    if (!button || !current || !shown || !shown.contains(button)) return
    const key = button.dataset.k ?? ''
    const [index, date] = key.split('|')
    const row = current.lines.filter((line): line is Row => line.kind === 'row')[Number(index)]
    const dayIndex = current.days.findIndex((day) => day.date === date)
    const cell = row?.cells[dayIndex]
    if (!row || !cell || !('value' in cell)) return
    const ok = await copyText(doc, cell.value)
    if (model !== current || !shown) return // 그 사이 목록을 다시 만들었다
    if (!ok) {
      showToast(toast, LIST_TEXT.copyFailed, '', true)
      return
    }
    if (now !== null && now !== key) copied.add(now)
    copied.delete(key)
    now = key
    markCopied(shown, key)
    showToast(toast, LIST_TEXT.copied, copyTail(current, row, dayIndex, cell.value))
  }

  const onMake = () => void makeList()
  const onStage = (event: Event) => void onStageClick(event)
  const onXlsx = () => {
    if (!model) return
    showToast(toast, LIST_TEXT.saved, saveXlsx(doc, model, new Date()))
  }
  const onSettings = () => {
    openOptions()
    showToast(toast, LIST_TEXT.settingsOpened)
  }
  const onResize = () => {
    if (shown) syncSlide(shown)
  }

  make.addEventListener('click', onMake)
  stage.addEventListener('click', onStage)
  xlsx.addEventListener('click', onXlsx)
  settingsButton.addEventListener('click', onSettings)
  doc.defaultView?.addEventListener('resize', onResize)
  idle()

  return {
    stop() {
      run += 1
      make.removeEventListener('click', onMake)
      stage.removeEventListener('click', onStage)
      xlsx.removeEventListener('click', onXlsx)
      settingsButton.removeEventListener('click', onSettings)
      doc.defaultView?.removeEventListener('resize', onResize)
    },
  }
}

// 확장 화면(list.html)으로 열렸을 때만 스스로 시작한다(시험은 startList를 부른다)
if (typeof chrome !== 'undefined' && chrome.runtime?.id && typeof document !== 'undefined' && document.getElementById('listMain')) startList()
