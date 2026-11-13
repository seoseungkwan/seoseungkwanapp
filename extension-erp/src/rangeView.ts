// 기간 채우기(spec erp-closing-range) 안내 몸통 — design.md 4절. 글은 승인된 시안 docs/mockups/erp-closing-range/ ①~⑤ 그대로이고,
// 시안에 없는 안내(살펴보는 중·멈춤·이어서·함께 있는 진료 묻기·멈춘 까닭)는 design.md 4절 글 그대로다.
// - panel.ts가 이 파일을 부르므로 여기서는 panel.ts를 import하지 않는다(순환). 씨암·SONO 글(OVERLAP_TEXT)은 renderRange에 넘겨받는다
// - 글은 모두 textContent로만 넣는다(도우미 오류 번호도 HTML로 읽지 않는다). 숫자·날짜·칸 이름만 보이고 환자 정보는 없다
// - 모양(class)은 panel.ts 안내 스타일 블록 하나에 있다
import { explain } from './errors.js'
import type { Block, FailWhy, RangeAction, RangeView, RunSummary, ScanSummary } from './rangeTypes.js'
import type { OverlapChoice } from './types.js'

/** 날짜 목록에 보이는 가장 많은 날 수 */
export const MAX_DAYS = 10

/** 씨암·SONO 글(panel.ts OVERLAP_TEXT의 into·choice) */
export type OverlapWords = { into: Record<OverlapChoice, string>; choice: Record<OverlapChoice, string> }

const CHOICES: readonly OverlapChoice[] = ['carm', 'sono', 'both']

function count(n: number): string {
  return n.toLocaleString('ko-KR')
}

/** design.md 4절 글 */
export const RANGE_TEXT = {
  button: '기간 채우기',
  /** 머리 작은 글(.pt) */
  head: {
    pick: '기간 채우기',
    todayOnly: '기간 채우기',
    scanning: '기간 채우기 · 살펴보는 중',
    confirm: '기간 채우기 · 확인',
    running: '기간 채우기 · 저장 중',
    stopped: '기간 채우기 · 멈춤',
    blocked: '기간 채우기 · 멈춤',
    end: '기간 채우기 · 끝',
  } satisfies Record<RangeView['kind'], string>,
  close: '닫기',
  resume: '이어서 하기',
  pick: {
    lead: '채울 기간을 골라 주세요.',
    from: '시작일',
    to: '끝일',
    help: '오늘 뒤 날짜는 고를 수 없어요. [살펴보기]를 누르면 기간 안 날마다 이미 적어 둔 것이 있는지 먼저 봐요. 아직 아무 칸도 바꾸지 않아요.',
    empty: '시작일과 끝일을 골라 주세요.',
    reversed: '시작일이 끝일보다 뒤예요.',
    future: '오늘 뒤 날짜는 고를 수 없어요.',
    scan: '살펴보기',
  },
  todayOnly: {
    what: '이 계정은 오늘 마감일지만 열 수 있어 기간 채우기를 쓸 수 없어요.',
    how: '날짜를 고를 수 있는 계정으로 열어 주세요. 아무 칸도 바꾸지 않았어요.',
  },
  scanning: {
    lead: '기간 안 날을 살펴보는 중이에요.',
    count: (total: number, done: number) => `${count(total)}일 중 ${count(done)}일`,
    help: '아직 아무 칸도 바꾸지 않아요.',
    cancel: '그만두기',
  },
  confirm: {
    lead: (period: string, s: number) => `${period} 중 ${count(s)}일을 비트 값으로 덮어쓰고 저장해요.`,
    /** 시작일 = 끝일 */
    leadOne: (period: string) => `${period}을 비트 값으로 덮어쓰고 저장해요.`,
    /** S = 0 */
    none: (period: string) => `${period}에는 채울 날이 없어요.`,
    fresh: (n: number) => `새로 채울 날 ${count(n)}일`,
    written: (m: number, a: number, b: number, list: string) =>
      `이미 적어 둔 날 ${count(m)}일 — 작성중 ${count(a)}일 · 확정 ${count(b)}일 (${list})`,
    unloaded: (u: number, list: string) => `확인하지 못한 날 ${count(u)}일 — 채울 때 다시 불러와요 (${list})`,
    zero: (z: number, list: string) => `진료 0건이라 건너뛸 날 ${count(z)}일 (${list})`,
    overwrite: (m: number) => `이미 적어 둔 ${count(m)}일도 비트 값으로 바뀌어요.`,
    /** 확정한 날이 있으면 overwrite 뒤에 붙는다 */
    confirmedToo: ' 확정한 날도 바뀌어요.',
    saves: "날마다 ERP의 '전체 저장'과 '일일 상세 저장'을 확장이 눌러요. 상태(작성중·확정)는 그대로 둬요.",
    overlapLast: (into: string) => `씨암·SONO를 같이 받은 진료는 지난번 고른 대로 ${into} 넣어요.`,
    overlapAsk: (k: number) => `씨암·SONO를 같이 받은 진료가 ${count(k)}건 있어요. 어디에 넣을까요?`,
    stay: '도는 동안 이 크롬 창을 닫거나 다른 화면으로 옮기지 마세요.',
    start: '덮어쓰고 저장 시작',
  },
  running: {
    lead: (s: number, k: number) => `${count(s)}일 중 ${count(k)}일 저장했어요.`,
    now: (day: string) => `지금: ${day} 채우는 중`,
    help: '[멈추기]를 누르면 지금 날까지 저장하고 멈춰요. 멈춘 뒤 다시 시작하면 남은 날부터 이어 가요.',
    stop: '멈추기',
    stopping: '멈추는 중…',
  },
  stopped: {
    lead: (k: number) => `멈췄어요. ${count(k)}일 저장했어요.`,
    rest: (r: number, list: string) => `남은 날 ${count(r)}일 (${list})`,
  },
  blocked: {
    done: (k: number, r: number) => `${count(k)}일 저장했어요. 남은 ${count(r)}일은 하지 않았어요.`,
    dialog: { what: 'ERP 화면에 안내 창이 떠서 멈췄어요.', how: 'ERP 창을 보고 닫은 뒤 [이어서 하기]를 눌러 주세요.' },
    noSaveBar: {
      what: '업무일지 2 저장 줄이 없어 멈췄어요.',
      how: 'ERP에 진료실이 하나 이상 있어야 업무일지 2를 저장할 수 있어요. 확인한 뒤 [이어서 하기]를 눌러 주세요.',
    },
    readOnly: { what: '이 화면은 읽기 전용이라 저장할 수 없어요(본사 열람 등).', how: '저장할 수 있는 계정으로 열어 주세요.' },
    /** 도우미 오류 '어떻게' 끝에 붙는 번호('이 번호를 알려 주세요'가 가리킬 번호) */
    code: (code: string) => ` (번호 ${code})`,
  },
  end: {
    lead: (n: number) => `${count(n)}일을 비트 값으로 저장했어요.`,
    none: '저장한 날이 없어요.',
    untouched: '직접 넣는 칸(담당자·지출·특이사항 등)은 건드리지 않았어요.',
  },
  /** 결과 줄(stopped·blocked·end 같이 씀, 0인 줄 없음) */
  result: {
    zero: (z: number, list: string) => `건너뛴 날 ${count(z)}일 — 진료 0건 (${list})`,
    draft: (d: number, list: string) => `건너뛴 날 ${count(d)}일 — 저장하지 않은 입력이 남은 날 (${list})`,
    failed: (f: number) => `저장 못 한 날 ${count(f)}일`,
    again: '그날을 열어 [비트 값 채우기]로 다시 해 주세요.',
    why: {
      load: 'ERP가 그날을 불러오지 못했어요.',
      w1Error: 'ERP가 업무일지 1 저장 오류를 알렸어요.',
      w1Timeout: 'ERP가 업무일지 1을 저장했다는 답을 주지 않았어요.',
      w2Error: 'ERP가 업무일지 2 저장 오류를 알렸어요(업무일지 1은 저장됨).',
      w2Timeout: 'ERP가 업무일지 2를 저장했다는 답을 주지 않았어요(업무일지 1은 저장됨).',
    } satisfies Record<FailWhy, string>,
  },
  /** dayList: 확정한 날 뒤에 붙는다 */
  confirmed: ' 확정',
  /** dayList: 10개를 넘을 때 끝에 붙는다 */
  more: (k: number) => ` 외 ${count(k)}일`,
}

/** 'YYYY-MM-DD' → 숫자 셋 */
function ymd(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number)
  return { y, m, d }
}

/** '{M}월 {D}일' ('지금:' 줄) */
export function dayLabel(date: string): string {
  const { m, d } = ymd(date)
  return `${m}월 ${d}일`
}

/** 'M/D' */
function shortDay(date: string): string {
  const { m, d } = ymd(date)
  return `${m}/${d}`
}

/** 기간 글: 같은 날 · 같은 달 · 같은 해 · 다른 해(design.md 4절) */
export function periodLabel(from: string, to: string): string {
  const a = ymd(from)
  const b = ymd(to)
  if (from === to) return `${a.m}월 ${a.d}일`
  if (a.y === b.y && a.m === b.m) return `${a.m}월 ${a.d}일~${b.d}일`
  if (a.y === b.y) return `${a.m}월 ${a.d}일~${b.m}월 ${b.d}일`
  return `${a.y}년 ${a.m}월 ${a.d}일~${b.y}년 ${b.m}월 ${b.d}일`
}

/** 'M/D'를 ' · '로 옛날부터 잇고, 확정한 날은 뒤에 ' 확정', 10개를 넘으면 앞 10개 + ' 외 {k}일' */
export function dayList(days: readonly string[], confirmed: readonly string[] = []): string {
  const sorted = [...days].sort()
  const marked = new Set(confirmed)
  const shown = sorted
    .slice(0, MAX_DAYS)
    .map((day) => shortDay(day) + (marked.has(day) ? RANGE_TEXT.confirmed : ''))
    .join(' · ')
  return sorted.length > MAX_DAYS ? shown + RANGE_TEXT.more(sorted.length - MAX_DAYS) : shown
}

/** 기간 고르기를 막는 까닭(없으면 null) */
function pickProblem(from: string, to: string, today: string): string | null {
  if (!from || !to) return RANGE_TEXT.pick.empty
  if (from > to) return RANGE_TEXT.pick.reversed
  if (to > today) return RANGE_TEXT.pick.future
  return null
}

type Child = Node | string | null | undefined | false

/**
 * 기간 안내 몸통(design.md 4절). 돌려준 요소의 자식(굵은 줄 … 단추 줄)을 panel.ts가 안내 틀(.pb)에 옮겨 넣는다.
 * 단추는 act로 알린다(고르기·멈추기 표시처럼 그 안내 안에서 끝나는 것만 여기서 바꾼다)
 */
export function renderRange(doc: Document, view: RangeView, act: (action: RangeAction) => void, overlap: OverlapWords): HTMLElement {
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: Child[]) => {
    const node = doc.createElement(tag)
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value)
    for (const child of children) if (child) node.append(child)
    return node
  }
  const lead = (text: Child, err = false) => h('p', { class: err ? 'lead err' : 'lead' }, text)
  const plain = (text: string) => h('p', {}, text)
  const small = (text: string) => h('p', { class: 'small' }, text)
  const button = (label: string, primary: boolean, onClick: () => void) => {
    const one = h('button', { type: 'button', class: primary ? 'btn btn-1' : 'btn btn-2' }, label)
    one.addEventListener('click', () => {
      if (!one.disabled) onClick()
    })
    return one
  }
  const closeButton = () => button(RANGE_TEXT.close, false, () => act({ kind: 'close' }))
  const acts = (...buttons: Child[]) => h('div', { class: 'acts' }, ...buttons)
  /** 묶음 한 줄: 첫 '{N}일'만 굵게 */
  const line = (text: string) => {
    const found = /[\d,]+일/.exec(text)
    if (!found) return h('p', {}, text)
    return h('p', {}, text.slice(0, found.index), h('b', {}, found[0]), text.slice(found.index + found[0].length))
  }
  const progress = (done: number, total: number) => {
    const fill = h('i')
    fill.style.width = `${total > 0 ? Math.round((done / total) * 1000) / 10 : 0}%`
    return h(
      'div',
      { class: 'prog', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done) },
      fill,
    )
  }

  /** 결과 줄: 진료 0건 · 저장하지 않은 입력이 남은 날 · 저장 못 한 날(날마다 까닭). 줄이 없으면 null */
  const results = (run: RunSummary) => {
    const zero = run.skipped.filter((s) => s.why === 'zero').map((s) => s.date)
    const draft = run.skipped.filter((s) => s.why === 'draft').map((s) => s.date)
    const failed = [...run.failed].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    const rows: Child[] = [
      zero.length > 0 && line(RANGE_TEXT.result.zero(zero.length, dayList(zero))),
      draft.length > 0 && line(RANGE_TEXT.result.draft(draft.length, dayList(draft))),
    ]
    if (failed.length > 0) {
      rows.push(
        h('p', { class: 'bad' }, RANGE_TEXT.result.failed(failed.length)),
        h(
          'ul',
          { class: 'fails' },
          ...failed.map((f) => h('li', {}, `${shortDay(f.date)}: ${RANGE_TEXT.result.why[f.why]} ${RANGE_TEXT.result.again}`)),
        ),
      )
    }
    return rows.some(Boolean) ? h('div', { class: 'check' }, ...rows) : null
  }

  const blockText = (block: Block): { what: string; how: string } => {
    switch (block.kind) {
      case 'dialog':
        return RANGE_TEXT.blocked.dialog
      case 'todayOnly':
        return RANGE_TEXT.todayOnly
      case 'noSaveBar':
        return RANGE_TEXT.blocked.noSaveBar
      case 'readOnly':
        return RANGE_TEXT.blocked.readOnly
      case 'helper': {
        const e = explain(block.code)
        return { what: e.what, how: e.how + RANGE_TEXT.blocked.code(e.code) }
      }
    }
  }

  function pick(v: Extract<RangeView, { kind: 'pick' }>): Child[] {
    const input = (value: string) => {
      const one = h('input', { type: 'date', max: v.today, required: '' })
      one.value = value
      return one
    }
    const from = input(v.from)
    const to = input(v.to)
    const why = h('p', { class: 'why' })
    const scan = button(RANGE_TEXT.pick.scan, true, () => {
      if (pickProblem(from.value, to.value, v.today) === null) act({ kind: 'scan', from: from.value, to: to.value })
    })
    const check = () => {
      const problem = pickProblem(from.value, to.value, v.today)
      why.textContent = problem ?? ''
      why.hidden = problem === null
      scan.disabled = problem !== null
    }
    for (const one of [from, to]) {
      one.addEventListener('input', check)
      one.addEventListener('change', check)
    }
    check()
    return [
      lead(RANGE_TEXT.pick.lead),
      h(
        'div',
        { class: 'dates' },
        h('label', {}, h('span', {}, RANGE_TEXT.pick.from), from),
        h('span', { class: 'tilde', 'aria-hidden': 'true' }, '~'),
        h('label', {}, h('span', {}, RANGE_TEXT.pick.to), to),
      ),
      why,
      small(RANGE_TEXT.pick.help),
      acts(closeButton(), scan),
    ]
  }

  function confirm(scan: ScanSummary, last: OverlapChoice | undefined): Child[] {
    const period = periodLabel(scan.from, scan.to)
    const s = scan.fill.length
    const zero = scan.zero.length > 0 && line(RANGE_TEXT.confirm.zero(scan.zero.length, dayList(scan.zero)))
    if (s === 0) return [lead(RANGE_TEXT.confirm.none(period)), zero && h('div', { class: 'check' }, zero), acts(closeButton())]

    const drafts = scan.written.filter((w) => w.status === 'draft').length
    const confirmed = scan.written.filter((w) => w.status === 'confirmed').map((w) => w.date)
    const m = scan.written.length
    const check = h(
      'div',
      { class: 'check' },
      scan.fresh.length > 0 && line(RANGE_TEXT.confirm.fresh(scan.fresh.length)),
      m > 0 &&
        line(
          RANGE_TEXT.confirm.written(
            m,
            drafts,
            confirmed.length,
            dayList(
              scan.written.map((w) => w.date),
              confirmed,
            ),
          ),
        ),
      scan.unloaded.length > 0 && line(RANGE_TEXT.confirm.unloaded(scan.unloaded.length, dayList(scan.unloaded))),
      zero,
    )

    // 함께 있는 진료: 지난번 고른 것이 있으면 그 줄, 없으면 묻고 고를 때까지 [덮어쓰고 저장 시작]을 막는다
    let choice: OverlapChoice | undefined = scan.overlapVisits > 0 ? last : undefined
    const start = button(RANGE_TEXT.confirm.start, true, () => {
      if (scan.overlapVisits > 0 && !choice) return
      act(choice ? { kind: 'start', choice } : { kind: 'start' })
    })
    let overlapLine: Child = null
    if (scan.overlapVisits > 0 && last) {
      overlapLine = h('li', {}, RANGE_TEXT.confirm.overlapLast(overlap.into[last]))
    } else if (scan.overlapVisits > 0) {
      start.disabled = true
      const picks = CHOICES.map((one) =>
        h('button', { type: 'button', class: 'btn btn-2', 'data-choice': one, 'aria-pressed': 'false' }, overlap.choice[one]),
      )
      picks.forEach((pickButton, i) =>
        pickButton.addEventListener('click', () => {
          choice = CHOICES[i]
          for (const other of picks) other.setAttribute('aria-pressed', String(other === pickButton))
          start.disabled = false
        }),
      )
      overlapLine = h('li', {}, h('div', { class: 'ask' }, h('p', {}, RANGE_TEXT.confirm.overlapAsk(scan.overlapVisits)), h('div', { class: 'picks' }, ...picks)))
    }

    return [
      lead(s === 1 && scan.from === scan.to ? RANGE_TEXT.confirm.leadOne(period) : RANGE_TEXT.confirm.lead(period, s)),
      check,
      h(
        'ul',
        { class: 'warns' },
        m > 0 && h('li', {}, RANGE_TEXT.confirm.overwrite(m) + (confirmed.length > 0 ? RANGE_TEXT.confirm.confirmedToo : '')),
        h('li', {}, RANGE_TEXT.confirm.saves),
        overlapLine,
      ),
      small(RANGE_TEXT.confirm.stay),
      acts(closeButton(), start),
    ]
  }

  function running(v: Extract<RangeView, { kind: 'running' }>): Child[] {
    const stop = button(RANGE_TEXT.running.stop, false, () => {
      stop.disabled = true
      stop.textContent = RANGE_TEXT.running.stopping
      act({ kind: 'stop' })
    })
    if (v.stopping) {
      stop.disabled = true
      stop.textContent = RANGE_TEXT.running.stopping
    }
    return [
      lead(RANGE_TEXT.running.lead(v.total, v.saved)),
      progress(v.saved, v.total),
      small(RANGE_TEXT.running.now(dayLabel(v.current))),
      small(RANGE_TEXT.running.help),
      acts(stop),
    ]
  }

  function parts(v: RangeView): Child[] {
    switch (v.kind) {
      case 'pick':
        return pick(v)
      case 'todayOnly':
        return [lead(RANGE_TEXT.todayOnly.what), small(RANGE_TEXT.todayOnly.how), acts(closeButton())]
      case 'scanning':
        return [
          lead(RANGE_TEXT.scanning.lead),
          progress(v.done, v.total),
          small(RANGE_TEXT.scanning.count(v.total, v.done)),
          small(RANGE_TEXT.scanning.help),
          acts(button(RANGE_TEXT.scanning.cancel, false, () => act({ kind: 'cancelScan' }))),
        ]
      case 'confirm':
        return confirm(v.scan, v.last)
      case 'running':
        return running(v)
      case 'stopped':
        return [
          lead(RANGE_TEXT.stopped.lead(v.run.saved.length)),
          plain(RANGE_TEXT.stopped.rest(v.run.remaining.length, dayList(v.run.remaining))),
          results(v.run),
          acts(closeButton(), button(RANGE_TEXT.resume, true, () => act({ kind: 'resume' }))),
        ]
      case 'blocked': {
        const { what, how } = blockText(v.block)
        const canResume = v.block.kind === 'dialog' || v.block.kind === 'noSaveBar' || v.block.kind === 'helper'
        return [
          lead(what, v.block.kind === 'helper'),
          small(how),
          plain(RANGE_TEXT.blocked.done(v.run.saved.length, v.run.remaining.length)),
          results(v.run),
          acts(closeButton(), canResume && button(RANGE_TEXT.resume, true, () => act({ kind: 'resume' }))),
        ]
      }
      case 'end': {
        const n = v.run.saved.length
        const full = RANGE_TEXT.end.lead(n)
        const days = `${count(n)}일`
        return [
          n > 0 ? h('p', { class: 'lead' }, h('span', { class: 'ok' }, days), full.slice(days.length)) : lead(RANGE_TEXT.end.none),
          results(v.run),
          small(RANGE_TEXT.end.untouched),
          acts(closeButton()),
        ]
      }
    }
  }

  return h('div', { class: 'pb' }, ...parts(view))
}
