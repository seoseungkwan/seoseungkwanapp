// @vitest-environment jsdom
// TASK-3 REQ-3701·3702·3704·3705: 기간 안내 몸통(rangeView.ts). 글은 승인된 시안 docs/mockups/erp-closing-range/ ①~⑤와
// design.md 4절 그대로이고, 예시 숫자는 시안의 2026년 10월(10월 1일~31일 중 26일 · 새로 18 · 이미 8(작성중 5 · 확정 3) · 건너뛸 5).
// 숫자·날짜는 가짜이고 환자 정보는 없다
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OVERLAP_TEXT } from './panel'
import { MAX_DAYS, type Block, type FailWhy, type RangeAction, type RangeView, type RunSummary, type ScanSummary } from './rangeTypes'
import { dayList, periodLabel, RANGE_TEXT, renderRange } from './rangeView'
import type { OverlapChoice } from './types'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const MOCKUP = readFileSync(path.join(ROOT, 'docs', 'mockups', 'erp-closing-range', 'index.html'), 'utf8')
const DESIGN = readFileSync(path.join(ROOT, 'specs', 'erp-closing-range', 'design.md'), 'utf8')
/** design.md 4절(기간 안내) */
const SECTION = DESIGN.slice(DESIGN.indexOf('## 4. '), DESIGN.indexOf('## 5. '))

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

// 시안 예시: 2026년 10월. 진료 0건 5일, 작성중 5일 · 확정 3일, 나머지 18일은 새로
const OCT = (d: number) => `2026-10-${String(d).padStart(2, '0')}`
const ALL = Array.from({ length: 31 }, (_, i) => OCT(i + 1))
const ZERO = [4, 9, 11, 18, 25].map(OCT)
const DRAFT = [2, 7, 14, 20, 27].map(OCT)
const CONFIRMED = [6, 13, 21].map(OCT)
const WRITTEN = [...DRAFT, ...CONFIRMED].sort()
const FRESH = ALL.filter((d) => !ZERO.includes(d) && !WRITTEN.includes(d))
const FILL = ALL.filter((d) => !ZERO.includes(d))
const ZERO_SKIPS = ZERO.map((date) => ({ date, why: 'zero' as const }))

const WRITTEN_LIST = '10/2 · 10/6 확정 · 10/7 · 10/13 확정 · 10/14 · 10/20 · 10/21 확정 · 10/27'
const ZERO_LIST = '10/4 · 10/9 · 10/11 · 10/18 · 10/25'
const SAVES = "날마다 ERP의 '전체 저장'과 '일일 상세 저장'을 확장이 눌러요. 상태(작성중·확정)는 그대로 둬요."
const STAY = '도는 동안 이 크롬 창을 닫거나 다른 화면으로 옮기지 마세요.'
const AGAIN = '그날을 열어 [비트 값 채우기]로 다시 해 주세요.'
const UNTOUCHED_END = '직접 넣는 칸(담당자·지출·특이사항 등)은 건드리지 않았어요.'

function scan(o: Partial<ScanSummary> = {}): ScanSummary {
  return {
    from: OCT(1),
    to: OCT(31),
    fill: FILL,
    fresh: FRESH,
    written: WRITTEN.map((date) => ({ date, status: CONFIRMED.includes(date) ? 'confirmed' : 'draft' })),
    zero: ZERO,
    unloaded: [],
    overlapVisits: 9,
    ...o,
  }
}
function run(o: Partial<RunSummary> = {}): RunSummary {
  return { from: OCT(1), to: OCT(31), total: 26, saved: [], skipped: [], failed: [], remaining: [], ...o }
}

function draw(view: RangeView) {
  const act = vi.fn<(a: RangeAction) => void>()
  const el = renderRange(document, view, act, OVERLAP_TEXT)
  document.body.append(el)
  const $ = <T extends Element = HTMLElement>(sel: string) => el.querySelector<T>(sel)
  const $$ = <T extends Element = HTMLElement>(sel: string) => [...el.querySelectorAll<T>(sel)]
  const kids = () => [...el.children]
  const classes = () => kids().map((c) => c.className)
  const acts = () => $$('.acts button').map(text)
  const button = (label: string) => {
    const found = $$<HTMLButtonElement>('button').find((b) => text(b) === label)
    if (!found) throw new Error(`[${label}] 단추가 없다: ${$$('button').map(text).join(', ')}`)
    return found
  }
  const check = () => $$('.check > *').map(text)
  const warns = () => $$('.warns > li').map(text)
  return { el, act, $, $$, kids, classes, acts, button, check, warns }
}

/** 시험의 오늘(시안과 같은 2026-11-13, 한국 시간). confirm처럼 today가 없는 안내는 이 PC 시계로 올해를 안다 */
const TODAY = new Date('2026-11-13T09:00:00+09:00')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('periodLabel·dayList 날짜 모양(design.md 4절)', () => {
  it.each<[string, string, string]>([
    ['2026-10-14', '2026-10-14', '10월 14일'],
    ['2026-10-01', '2026-10-31', '10월 1일~31일'],
    ['2026-09-28', '2026-10-03', '9월 28일~10월 3일'],
    ['2025-12-29', '2026-01-02', '2025년 12월 29일~2026년 1월 2일'],
  ])('AC-3702.2: periodLabel(%s, %s)는 %s', (from, to, want) => {
    expect(periodLabel(from, to)).toBe(want)
  })

  it.each<[string, string, string, string]>([
    ['2025-10-14', '2025-10-14', '2026-11-13', '2025년 10월 14일'],
    ['2025-10-01', '2025-10-31', '2026-11-13', '2025년 10월 1일~31일'],
    ['2025-09-28', '2025-10-03', '2026-11-13', '2025년 9월 28일~10월 3일'],
    ['2026-10-14', '2026-10-14', '2026-11-13', '10월 14일'],
    ['2026-10-01', '2026-10-31', '2026-11-13', '10월 1일~31일'],
    ['2026-09-28', '2026-10-03', '2026-11-13', '9월 28일~10월 3일'],
    ['2025-12-29', '2026-01-02', '2026-11-13', '2025년 12월 29일~2026년 1월 2일'],
    ['2026-01-02', '2026-01-02', '2027-01-05', '2026년 1월 2일'],
  ])("AC-3701.2: periodLabel(%s, %s, 오늘 %s) — 같은 날·같은 달·같은 해 모양은 그 해가 오늘의 해가 아니면 앞에 '{Y}년 '", (from, to, today, want) => {
    expect(periodLabel(from, to, today)).toBe(want)
  })

  it('AC-3701.2: today를 주지 않으면 해를 붙이지 않는다(지금 모양 그대로)', () => {
    expect(periodLabel('2025-10-01', '2025-10-31')).toBe('10월 1일~31일')
    expect(periodLabel('2025-10-14', '2025-10-14')).toBe('10월 14일')
  })

  it("AC-3702.2: dayList는 'M/D'를 ' · '로 잇고 확정한 날은 뒤에 ' 확정', 옛날부터다", () => {
    expect(dayList(WRITTEN, CONFIRMED)).toBe(WRITTEN_LIST)
    expect(dayList(ZERO)).toBe(ZERO_LIST)
    expect(dayList([OCT(9), OCT(4)])).toBe('10/4 · 10/9')
    expect(dayList([])).toBe('')
  })

  it("AC-3702.2: dayList는 10개까지 쓰고 넘으면 ' 외 {k}일'(숫자는 쉼표)이다", () => {
    expect(dayList(FILL.slice(0, 10))).toBe('10/1 · 10/2 · 10/3 · 10/5 · 10/6 · 10/7 · 10/8 · 10/10 · 10/12 · 10/13')
    expect(dayList(FILL.slice(0, 12), [OCT(2)])).toBe('10/1 · 10/2 확정 · 10/3 · 10/5 · 10/6 · 10/7 · 10/8 · 10/10 · 10/12 · 10/13 외 2일')
    const many = Array.from({ length: 1244 }, (_, i) => {
      const d = new Date(Date.UTC(2020, 0, 1 + i))
      return d.toISOString().slice(0, 10)
    })
    expect(dayList(many).endsWith(' 외 1,234일')).toBe(true)
  })
})

describe('AC-3701.1·3701.2 기간 고르기(pick, 시안 ②)', () => {
  const pick = (from = OCT(1), to = OCT(31), today = '2026-11-13'): RangeView => ({ kind: 'pick', from, to, today })
  const inputs = (p: ReturnType<typeof draw>) => p.$$<HTMLInputElement>('input')
  const why = (p: ReturnType<typeof draw>) => {
    const line = p.$('.why')
    return line && !line.hidden ? text(line) : null
  }
  const type = (input: HTMLInputElement, value: string) => {
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  it("AC-3701.1: '채울 기간을 골라 주세요.' · 시작일·끝일 날짜 칸(처음 값·max = 오늘) · 안내 · [닫기]·[살펴보기]", () => {
    const p = draw(pick())
    expect(text(p.$('.lead'))).toBe('채울 기간을 골라 주세요.')
    const [from, to] = inputs(p)
    expect(inputs(p)).toHaveLength(2)
    for (const input of [from, to]) {
      expect(input.type).toBe('date')
      expect(input.max).toBe('2026-11-13')
    }
    expect(from.value).toBe('2026-10-01')
    expect(to.value).toBe('2026-10-31')
    expect(p.$$('.dates label').map((l) => text(l.querySelector('span')))).toEqual(['시작일', '끝일'])
    expect(from.closest('label')?.textContent).toContain('시작일')
    expect(to.closest('label')?.textContent).toContain('끝일')
    expect(text(p.$('.small'))).toBe(
      '오늘 뒤 날짜는 고를 수 없어요. [살펴보기]를 누르면 기간 안 날마다 이미 적어 둔 것이 있는지 먼저 봐요. 아직 아무 칸도 바꾸지 않아요.',
    )
    expect(why(p)).toBeNull()
    expect(p.acts()).toEqual(['닫기', '살펴보기'])
    expect(p.button('살펴보기').disabled).toBe(false)
    expect(p.button('살펴보기').classList.contains('btn-1')).toBe(true)
    expect(p.button('닫기').classList.contains('btn-2')).toBe(true)
    expect(p.classes()).toEqual(['lead', 'dates', 'why', 'small', 'acts'])
  })

  it('AC-3701.1: [살펴보기]는 지금 두 칸 값으로 scan을 부른다', () => {
    const p = draw(pick())
    p.button('살펴보기').click()
    expect(p.act).toHaveBeenCalledWith({ kind: 'scan', from: '2026-10-01', to: '2026-10-31' })
    const [from, to] = inputs(p)
    type(from, '2026-11-01')
    type(to, '2026-11-13')
    p.button('살펴보기').click()
    expect(p.act).toHaveBeenLastCalledWith({ kind: 'scan', from: '2026-11-01', to: '2026-11-13' })
    expect(p.act).toHaveBeenCalledTimes(2)
  })

  it.each<[string, string, string, string]>([
    ['시작일이 빔', '', '2026-10-31', '시작일과 끝일을 골라 주세요.'],
    ['끝일이 빔', '2026-10-01', '', '시작일과 끝일을 골라 주세요.'],
    ['시작일 > 끝일', '2026-10-31', '2026-10-01', '시작일이 끝일보다 뒤예요.'],
    ['끝일 > 오늘', '2026-11-01', '2026-11-14', '오늘 뒤 날짜는 고를 수 없어요.'],
    ['둘 다 오늘 뒤', '2026-11-20', '2026-11-21', '오늘 뒤 날짜는 고를 수 없어요.'],
    ['93일(8/13~11/13)', '2026-08-13', '2026-11-13', '한 번에 92일까지 고를 수 있어요.'],
    ['한 해(해 넘김)', '2025-11-13', '2026-11-13', '한 번에 92일까지 고를 수 있어요.'],
  ])('AC-3701.2: %s이면 [살펴보기]가 disabled이고 까닭 한 줄이 보이며, 눌러도 scan이 없다', (_name, fromValue, toValue, line) => {
    const p = draw(pick())
    const [from, to] = inputs(p)
    type(from, fromValue)
    type(to, toValue)
    expect(why(p)).toBe(line)
    expect(p.button('살펴보기').disabled).toBe(true)
    p.button('살펴보기').click()
    expect(p.act).not.toHaveBeenCalled()
    // 고치면 다시 열린다
    type(from, '2026-11-01')
    type(to, '2026-11-13')
    expect(why(p)).toBeNull()
    expect(p.button('살펴보기').disabled).toBe(false)
  })

  it("AC-3701.2: 양 끝 포함 92일(MAX_DAYS)까지는 되고 93일이면 '한 번에 92일까지 고를 수 있어요.'로 막힌다(달·해 넘김도)", () => {
    expect(MAX_DAYS).toBe(92)
    expect(RANGE_TEXT.pick.tooLong).toBe('한 번에 92일까지 고를 수 있어요.')
    const p = draw(pick())
    const [from, to] = inputs(p)
    for (const [a, b, blocked] of [
      ['2026-08-14', '2026-11-13', false],
      ['2026-08-13', '2026-11-13', true],
      ['2025-12-01', '2026-03-02', false],
      ['2025-12-01', '2026-03-03', true],
      ['2024-01-01', '2024-04-01', false],
      ['2024-01-01', '2024-04-02', true],
    ] as const) {
      type(from, a)
      type(to, b)
      expect(why(p), `${a}~${b}`).toBe(blocked ? '한 번에 92일까지 고를 수 있어요.' : null)
      expect(p.button('살펴보기').disabled, `${a}~${b}`).toBe(blocked)
      p.button('살펴보기').click()
    }
    expect(p.act.mock.calls).toEqual([
      [{ kind: 'scan', from: '2026-08-14', to: '2026-11-13' }],
      [{ kind: 'scan', from: '2025-12-01', to: '2026-03-02' }],
      [{ kind: 'scan', from: '2024-01-01', to: '2024-04-01' }],
    ])
  })

  it('AC-3701.2: 막는 줄은 차례대로 첫 하나 — 빈 칸 → 시작일 > 끝일 → 오늘 뒤 → 92일', () => {
    const p = draw(pick())
    const [from, to] = inputs(p)
    type(from, '')
    type(to, '2027-12-31')
    expect(why(p)).toBe('시작일과 끝일을 골라 주세요.')
    type(from, '2027-12-31')
    type(to, '2025-01-01')
    expect(why(p)).toBe('시작일이 끝일보다 뒤예요.')
    type(from, '2025-01-01')
    type(to, '2026-11-14')
    expect(why(p)).toBe('오늘 뒤 날짜는 고를 수 없어요.')
    type(to, '2026-11-13')
    expect(why(p)).toBe('한 번에 92일까지 고를 수 있어요.')
  })

  it('AC-3701.2: 처음 값이 93일이면 처음부터 막혀 있다', () => {
    const p = draw(pick('2026-08-13', '2026-11-13'))
    expect(why(p)).toBe('한 번에 92일까지 고를 수 있어요.')
    expect(p.button('살펴보기').disabled).toBe(true)
  })

  it('AC-3701.2: change 이벤트로도 다시 본다', () => {
    const p = draw(pick())
    const [, to] = inputs(p)
    to.value = '2026-09-30'
    to.dispatchEvent(new Event('change', { bubbles: true }))
    expect(why(p)).toBe('시작일이 끝일보다 뒤예요.')
  })

  it('AC-3701.2: 처음 값이 맞지 않으면 처음부터 막혀 있다(시작일 = 끝일 = 오늘은 된다)', () => {
    expect(draw(pick('2026-11-13', '2026-11-12')).button('살펴보기').disabled).toBe(true)
    document.body.innerHTML = ''
    const today = draw(pick('2026-11-13', '2026-11-13'))
    expect(today.button('살펴보기').disabled).toBe(false)
    expect(why(today)).toBeNull()
  })

  it('AC-3701.2: [닫기]는 close만 부른다', () => {
    const p = draw(pick())
    p.button('닫기').click()
    expect(p.act.mock.calls).toEqual([[{ kind: 'close' }]])
  })
})

describe('AC-3701.3 원무 계정(todayOnly)', () => {
  it("AC-3701.3: '이 계정은 오늘 마감일지만 열 수 있어…' · '날짜를 고를 수 있는 계정으로…' · [닫기]", () => {
    const p = draw({ kind: 'todayOnly' })
    expect(p.kids().map(text)).toEqual([
      '이 계정은 오늘 마감일지만 열 수 있어 기간 채우기를 쓸 수 없어요.',
      '날짜를 고를 수 있는 계정으로 열어 주세요. 아무 칸도 바꾸지 않았어요.',
      '닫기',
    ])
    expect(p.classes()).toEqual(['lead', 'small', 'acts'])
    expect(p.$$('input')).toHaveLength(0)
    p.button('닫기').click()
    expect(p.act.mock.calls).toEqual([[{ kind: 'close' }]])
  })
})

describe('AC-3702.1 살펴보는 중(scanning)', () => {
  it("AC-3702.1: '기간 안 날을 살펴보는 중이에요.' · 진행 막대 · '{N}일 중 {k}일' · '아직 아무 칸도 바꾸지 않아요.' · [그만두기]", () => {
    const p = draw({ kind: 'scanning', total: 31, done: 11 })
    expect(p.kids().map(text)).toEqual(['기간 안 날을 살펴보는 중이에요.', '', '31일 중 11일', '아직 아무 칸도 바꾸지 않아요.', '그만두기'])
    expect(p.classes()).toEqual(['lead', 'prog', 'small', 'small', 'acts'])
    const bar = p.$('.prog') as HTMLElement
    expect(bar.getAttribute('role')).toBe('progressbar')
    expect(bar.getAttribute('aria-valuemax')).toBe('31')
    expect(bar.getAttribute('aria-valuenow')).toBe('11')
    expect((bar.querySelector('i') as HTMLElement).style.width).toBe('35.5%')
    p.button('그만두기').click()
    expect(p.act.mock.calls).toEqual([[{ kind: 'cancelScan' }]])
  })

  it('AC-3702.1: 숫자는 쉼표, 0일이면 막대는 0%', () => {
    const p = draw({ kind: 'scanning', total: 1234, done: 0 })
    expect(text(p.$$('.small')[0])).toBe('1,234일 중 0일')
    expect((p.$('.prog i') as HTMLElement).style.width).toBe('0%')
  })
})

describe('AC-3702.2·3702.3·3702.4 한 번 승인(confirm, 시안 ③)', () => {
  it('AC-3702.2 AC-3702.3: 시안 ③ 그대로 — 굵은 줄 · 묶음 셋 · 경고 셋(지난번 씨암) · 작은 줄 · [닫기]·[덮어쓰고 저장 시작]', () => {
    const p = draw({ kind: 'confirm', scan: scan(), last: 'carm' })
    expect(text(p.$('.lead'))).toBe('10월 1일~31일 중 26일을 비트 값으로 덮어쓰고 저장해요.')
    expect(p.check()).toEqual([
      '새로 채울 날 18일',
      `이미 적어 둔 날 8일 — 작성중 5일 · 확정 3일 (${WRITTEN_LIST})`,
      `진료 0건이라 건너뛸 날 5일 (${ZERO_LIST})`,
    ])
    expect(p.$$('.check b').map(text)).toEqual(['18일', '8일', '5일'])
    expect(p.warns()).toEqual([
      '이미 적어 둔 8일도 비트 값으로 바뀌어요. 확정한 날도 바뀌어요.',
      SAVES,
      '씨암·SONO를 같이 받은 진료는 지난번 고른 대로 씨암에 넣어요.',
    ])
    expect(text(p.$('.small'))).toBe(STAY)
    expect(p.acts()).toEqual(['닫기', '덮어쓰고 저장 시작'])
    expect(p.button('덮어쓰고 저장 시작').disabled).toBe(false)
    expect(p.button('덮어쓰고 저장 시작').classList.contains('btn-1')).toBe(true)
    expect(p.classes()).toEqual(['lead', 'check', 'warns', 'small', 'acts'])
  })

  it.each<[OverlapChoice, string]>([
    ['carm', '씨암·SONO를 같이 받은 진료는 지난번 고른 대로 씨암에 넣어요.'],
    ['sono', '씨암·SONO를 같이 받은 진료는 지난번 고른 대로 SONO에 넣어요.'],
    ['both', '씨암·SONO를 같이 받은 진료는 지난번 고른 대로 씨암·SONO 둘 다에 넣어요.'],
  ])('AC-3702.3: 지난번 고른 것(%s)이 있으면 묻지 않고 그 줄이며, [덮어쓰고 저장 시작]은 그 고른 것으로 start', (last, line) => {
    const p = draw({ kind: 'confirm', scan: scan(), last })
    expect(p.warns().at(-1)).toBe(line)
    expect(p.$$('[aria-pressed]')).toHaveLength(0)
    p.button('덮어쓰고 저장 시작').click()
    expect(p.act.mock.calls).toEqual([[{ kind: 'start', choice: last }]])
  })

  it("AC-3702.3: 지난번 고른 것이 없으면 '…{K}건 있어요. 어디에 넣을까요?'와 세 단추이고, 하나를 누를 때까지 [덮어쓰고 저장 시작]이 disabled다", () => {
    const p = draw({ kind: 'confirm', scan: scan({ overlapVisits: 1234 }) })
    const ask = p.$$('.warns > li').at(-1) as HTMLElement
    expect(text(ask.querySelector('p'))).toBe('씨암·SONO를 같이 받은 진료가 1,234건 있어요. 어디에 넣을까요?')
    const picks = [...ask.querySelectorAll<HTMLButtonElement>('button')]
    expect(picks.map(text)).toEqual(['씨암에 넣기', 'SONO에 넣기', '둘 다 넣기'])
    expect(picks.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false'])
    expect(picks.map((b) => b.type)).toEqual(['button', 'button', 'button'])
    // 고르는 단추는 단추 줄(.acts) 밖에 있다
    expect(p.acts()).toEqual(['닫기', '덮어쓰고 저장 시작'])
    const start = p.button('덮어쓰고 저장 시작')
    expect(start.disabled).toBe(true)
    start.click()
    expect(p.act).not.toHaveBeenCalled()
    p.button('SONO에 넣기').click()
    expect(picks.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
    expect(start.disabled).toBe(false)
    // 고르기만으로는 아무것도 부르지 않는다
    expect(p.act).not.toHaveBeenCalled()
    p.button('둘 다 넣기').click()
    expect(picks.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true'])
    start.click()
    expect(p.act.mock.calls).toEqual([[{ kind: 'start', choice: 'both' }]])
  })

  it('AC-3702.3: 함께 있는 진료가 없으면 그 줄이 없고 start에 choice가 없다(지난번 고른 것이 있어도)', () => {
    for (const last of [undefined, 'sono'] as const) {
      const p = draw({ kind: 'confirm', scan: scan({ overlapVisits: 0 }), ...(last ? { last } : {}) })
      expect(p.warns(), String(last)).toEqual(['이미 적어 둔 8일도 비트 값으로 바뀌어요. 확정한 날도 바뀌어요.', SAVES])
      expect(p.button('덮어쓰고 저장 시작').disabled).toBe(false)
      p.button('덮어쓰고 저장 시작').click()
      expect(p.act.mock.calls, String(last)).toEqual([[{ kind: 'start' }]])
      document.body.innerHTML = ''
    }
  })

  it("AC-3702.2: 확정한 날이 없으면 경고 첫 줄에 ' 확정한 날도 바뀌어요.'가 없고, 이미 적어 둔 날이 없으면 그 경고 줄과 묶음 줄이 없다", () => {
    const drafts = scan({ written: DRAFT.map((date) => ({ date, status: 'draft' as const })), overlapVisits: 0 })
    const p = draw({ kind: 'confirm', scan: drafts })
    expect(p.warns()[0]).toBe('이미 적어 둔 5일도 비트 값으로 바뀌어요.')
    expect(p.check()[1]).toBe('이미 적어 둔 날 5일 — 작성중 5일 · 확정 0일 (10/2 · 10/7 · 10/14 · 10/20 · 10/27)')
    document.body.innerHTML = ''
    const none = draw({ kind: 'confirm', scan: scan({ written: [], fresh: FILL, overlapVisits: 0 }) })
    expect(none.check()).toEqual(['새로 채울 날 26일', `진료 0건이라 건너뛸 날 5일 (${ZERO_LIST})`])
    expect(none.warns()).toEqual([SAVES])
  })

  it("AC-3702.2: 살펴볼 때 불러오지 못한 날은 '확인하지 못한 날 {u}일 — 채울 때 다시 불러와요 ({날짜})'이고 S에 든다, 건너뛸 날이 0이면 그 줄이 없다", () => {
    const fresh = FRESH.filter((d) => d !== OCT(3) && d !== OCT(5))
    const p = draw({ kind: 'confirm', scan: scan({ fresh, unloaded: [OCT(5), OCT(3)], zero: [], overlapVisits: 0 }) })
    expect(p.check()).toEqual([
      '새로 채울 날 16일',
      `이미 적어 둔 날 8일 — 작성중 5일 · 확정 3일 (${WRITTEN_LIST})`,
      '확인하지 못한 날 2일 — 채울 때 다시 불러와요 (10/3 · 10/5)',
    ])
    expect(text(p.$('.lead'))).toBe('10월 1일~31일 중 26일을 비트 값으로 덮어쓰고 저장해요.')
  })

  it("AC-3702.2: 시작일 = 끝일이면 '{기간}을 비트 값으로 덮어쓰고 저장해요.'", () => {
    const one = scan({ from: OCT(14), to: OCT(14), fill: [OCT(14)], fresh: [], written: [{ date: OCT(14), status: 'draft' }], zero: [], overlapVisits: 0 })
    const p = draw({ kind: 'confirm', scan: one })
    expect(text(p.$('.lead'))).toBe('10월 14일을 비트 값으로 덮어쓰고 저장해요.')
    expect(p.check()).toEqual(['이미 적어 둔 날 1일 — 작성중 1일 · 확정 0일 (10/14)'])
  })

  it("AC-3701.2: 기간의 해가 올해(이 PC 시계)가 아니면 굵은 줄 기간 앞에 '{Y}년 '이 붙는다(세 모양 모두)", () => {
    const LAST = (d: number) => `2025-10-${String(d).padStart(2, '0')}`
    const old = scan({ from: LAST(1), to: LAST(31), overlapVisits: 0 })
    expect(text(draw({ kind: 'confirm', scan: old }).$('.lead'))).toBe('2025년 10월 1일~31일 중 26일을 비트 값으로 덮어쓰고 저장해요.')
    document.body.innerHTML = ''
    const one = scan({ from: LAST(14), to: LAST(14), fill: [LAST(14)], fresh: [LAST(14)], written: [], zero: [], overlapVisits: 0 })
    expect(text(draw({ kind: 'confirm', scan: one }).$('.lead'))).toBe('2025년 10월 14일을 비트 값으로 덮어쓰고 저장해요.')
    document.body.innerHTML = ''
    const none = scan({ from: '2025-09-28', to: '2025-10-03', fill: [], fresh: [], written: [], zero: [], overlapVisits: 0 })
    expect(text(draw({ kind: 'confirm', scan: none }).$('.lead'))).toBe('2025년 9월 28일~10월 3일에는 채울 날이 없어요.')
  })

  it('AC-3701.2: 올해는 이 PC 시계로 정한다 — 시계가 2027년이면 2026년 기간에 해가 붙는다', () => {
    vi.setSystemTime(new Date('2027-01-05T09:00:00+09:00'))
    expect(text(draw({ kind: 'confirm', scan: scan({ overlapVisits: 0 }) }).$('.lead'))).toBe(
      '2026년 10월 1일~31일 중 26일을 비트 값으로 덮어쓰고 저장해요.',
    )
  })

  it("AC-3702.4: S = 0이면 '{기간}에는 채울 날이 없어요.' · 건너뛸 날 묶음 · [닫기]만 있고, [닫기]는 close", () => {
    const empty = scan({ from: OCT(3), to: OCT(4), fill: [], fresh: [], written: [], zero: [OCT(3), OCT(4)], overlapVisits: 0 })
    const p = draw({ kind: 'confirm', scan: empty, last: 'carm' })
    expect(p.kids().map(text)).toEqual(['10월 3일~4일에는 채울 날이 없어요.', '진료 0건이라 건너뛸 날 2일 (10/3 · 10/4)', '닫기'])
    expect(p.classes()).toEqual(['lead', 'check', 'acts'])
    expect(p.$('.warns')).toBeNull()
    p.button('닫기').click()
    expect(p.act.mock.calls).toEqual([[{ kind: 'close' }]])
  })

  it('AC-3702.2: [닫기]는 close만 부른다', () => {
    const p = draw({ kind: 'confirm', scan: scan(), last: 'carm' })
    p.button('닫기').click()
    expect(p.act.mock.calls).toEqual([[{ kind: 'close' }]])
  })
})

describe('AC-3704.1 채우는 중(running, 시안 ④)', () => {
  const running = (o: Partial<Extract<RangeView, { kind: 'running' }>> = {}): RangeView => ({
    kind: 'running',
    total: 26,
    saved: 11,
    current: OCT(14),
    ...o,
  })

  it("AC-3704.1: '26일 중 11일 저장했어요.' · 진행 막대(11/26) · '지금: 10월 14일 채우는 중' · 멈추기 안내 · [멈추기]", () => {
    const p = draw(running())
    expect(p.kids().map(text)).toEqual([
      '26일 중 11일 저장했어요.',
      '',
      '지금: 10월 14일 채우는 중',
      '[멈추기]를 누르면 지금 날까지 저장하고 멈춰요. 멈춘 뒤 다시 시작하면 남은 날부터 이어 가요.',
      '멈추기',
    ])
    expect(p.classes()).toEqual(['lead', 'prog', 'small', 'small', 'acts'])
    const bar = p.$('.prog') as HTMLElement
    expect([bar.getAttribute('aria-valuenow'), bar.getAttribute('aria-valuemax')]).toEqual(['11', '26'])
    expect((bar.querySelector('i') as HTMLElement).style.width).toBe('42.3%')
    expect(p.acts()).toEqual(['멈추기'])
  })

  it("AC-3704.2: [멈추기]를 누르면 stop을 한 번 부르고, 단추는 막히고 글자가 '멈추는 중…'이다", () => {
    const p = draw(running())
    const stop = p.button('멈추기')
    stop.click()
    expect(p.act.mock.calls).toEqual([[{ kind: 'stop' }]])
    expect(stop.disabled).toBe(true)
    expect(text(stop)).toBe('멈추는 중…')
    stop.click()
    expect(p.act).toHaveBeenCalledTimes(1)
  })

  it("AC-3704.2: stopping이면 처음부터 '멈추는 중…'으로 막혀 있다", () => {
    const p = draw(running({ stopping: true, saved: 1234, total: 2000 }))
    expect(text(p.$('.lead'))).toBe('2,000일 중 1,234일 저장했어요.')
    const stop = p.button('멈추는 중…')
    expect(stop.disabled).toBe(true)
    stop.click()
    expect(p.act).not.toHaveBeenCalled()
  })
})

describe('결과 줄(stopped·blocked·end 같이 씀, design.md 4절)', () => {
  it.each<[FailWhy, string]>([
    ['load', 'ERP가 그날을 불러오지 못했어요.'],
    ['w1Error', 'ERP가 업무일지 1 저장 오류를 알렸어요.'],
    ['w1Timeout', 'ERP가 업무일지 1을 저장했다는 답을 주지 않았어요.'],
    ['w2Error', 'ERP가 업무일지 2 저장 오류를 알렸어요(업무일지 1은 저장됨).'],
    ['w2Timeout', 'ERP가 업무일지 2를 저장했다는 답을 주지 않았어요(업무일지 1은 저장됨).'],
  ])("AC-3705.1: 저장 못 한 까닭 %s는 '{M/D}: %s 그날을 열어 [비트 값 채우기]로 다시 해 주세요.'", (why, line) => {
    const p = draw({ kind: 'end', run: run({ saved: FILL.slice(1), failed: [{ date: OCT(1), why }] }) })
    expect(text(p.$('.check > .bad'))).toBe('저장 못 한 날 1일')
    expect(p.$$('.fails li').map(text)).toEqual([`10/1: ${line} ${AGAIN}`])
  })

  it('AC-3705.1: 진료 0건 · 저장하지 않은 입력이 남은 날 · 저장 못 한 날 차례이고, 날짜는 옛날부터다', () => {
    const p = draw({
      kind: 'end',
      run: run({
        saved: [OCT(1)],
        skipped: [...ZERO_SKIPS, { date: OCT(12), why: 'draft' }, { date: OCT(3), why: 'zero' }, { date: OCT(8), why: 'draft' }],
        failed: [
          { date: OCT(20), why: 'w2Timeout' },
          { date: OCT(5), why: 'load' },
        ],
      }),
    })
    expect(p.$$('.check > *').map((c) => c.className)).toEqual(['', '', 'bad', 'fails'])
    expect(p.$$('.check > p').map(text)).toEqual([
      '건너뛴 날 6일 — 진료 0건 (10/3 · 10/4 · 10/9 · 10/11 · 10/18 · 10/25)',
      '건너뛴 날 2일 — 저장하지 않은 입력이 남은 날 (10/8 · 10/12)',
      '저장 못 한 날 2일',
    ])
    expect(p.$$('.fails li').map(text)).toEqual([
      `10/5: ERP가 그날을 불러오지 못했어요. ${AGAIN}`,
      `10/20: ERP가 업무일지 2를 저장했다는 답을 주지 않았어요(업무일지 1은 저장됨). ${AGAIN}`,
    ])
    expect(p.$$('.check b').map(text)).toEqual(['6일', '2일'])
  })
})

describe('AC-3705.1 끝(end, 시안 ⑤)', () => {
  it("AC-3705.1: 시안 ⑤ 그대로 — '25일을 비트 값으로 저장했어요.' · 건너뛴 날 5일 · 저장 못 한 날 1일 · 작은 줄 · [닫기]", () => {
    const p = draw({
      kind: 'end',
      run: run({ saved: FILL.filter((d) => d !== OCT(20)), skipped: ZERO_SKIPS, failed: [{ date: OCT(20), why: 'w1Timeout' }] }),
    })
    expect(text(p.$('.lead'))).toBe('25일을 비트 값으로 저장했어요.')
    expect(text(p.$('.lead .ok'))).toBe('25일')
    expect(p.$$('.check > p').map(text)).toEqual([`건너뛴 날 5일 — 진료 0건 (${ZERO_LIST})`, '저장 못 한 날 1일'])
    expect(p.$$('.fails li').map(text)).toEqual([`10/20: ERP가 업무일지 1을 저장했다는 답을 주지 않았어요. ${AGAIN}`])
    expect(text(p.$('.small'))).toBe(UNTOUCHED_END)
    expect(p.acts()).toEqual(['닫기'])
    expect(p.classes()).toEqual(['lead', 'check', 'small', 'acts'])
    p.button('닫기').click()
    expect(p.act.mock.calls).toEqual([[{ kind: 'close' }]])
  })

  it("AC-3705.1: 0인 줄은 없고, 저장한 날이 0이면 '저장한 날이 없어요.'", () => {
    const all = draw({ kind: 'end', run: run({ saved: FILL }) })
    expect(text(all.$('.lead'))).toBe('26일을 비트 값으로 저장했어요.')
    expect(all.$('.check')).toBeNull()
    expect(all.classes()).toEqual(['lead', 'small', 'acts'])
    document.body.innerHTML = ''
    const none = draw({ kind: 'end', run: run({ skipped: [{ date: OCT(1), why: 'draft' }] }) })
    expect(text(none.$('.lead'))).toBe('저장한 날이 없어요.')
    expect(none.$('.lead .ok')).toBeNull()
    expect(none.check()).toEqual(['건너뛴 날 1일 — 저장하지 않은 입력이 남은 날 (10/1)'])
    expect(none.$('.bad')).toBeNull()
  })
})

describe('AC-3704.2 멈춤(stopped)', () => {
  it("AC-3704.2: '멈췄어요. {k}일 저장했어요.' · '남은 날 {r}일 ({날짜})' · 결과 줄 · [닫기]·[이어서 하기]", () => {
    const p = draw({ kind: 'stopped', run: run({ saved: FILL.slice(0, 11), skipped: ZERO_SKIPS, remaining: FILL.slice(11) }) })
    expect(text(p.$('.lead'))).toBe('멈췄어요. 11일 저장했어요.')
    expect(text(p.kids()[1])).toBe('남은 날 15일 (10/15 · 10/16 · 10/17 · 10/19 · 10/20 · 10/21 · 10/22 · 10/23 · 10/24 · 10/26 외 5일)')
    expect(p.check()).toEqual([`건너뛴 날 5일 — 진료 0건 (${ZERO_LIST})`])
    expect(p.acts()).toEqual(['닫기', '이어서 하기'])
    expect(p.button('이어서 하기').classList.contains('btn-1')).toBe(true)
    expect(p.classes()).toEqual(['lead', '', 'check', 'acts'])
    p.button('이어서 하기').click()
    p.button('닫기').click()
    expect(p.act.mock.calls).toEqual([[{ kind: 'resume' }], [{ kind: 'close' }]])
  })

  it('AC-3704.2: 결과 줄이 없으면 묶음이 없다', () => {
    const p = draw({ kind: 'stopped', run: run({ saved: [OCT(1)], remaining: [OCT(2)] }) })
    expect(p.kids().slice(0, 2).map(text)).toEqual(['멈췄어요. 1일 저장했어요.', '남은 날 1일 (10/2)'])
    expect(p.classes()).toEqual(['lead', '', 'acts'])
  })
})

describe('AC-3705.2 멈추는 경우(blocked)', () => {
  const blockedRun = () => run({ saved: FILL.slice(0, 3), remaining: FILL.slice(3), failed: [{ date: OCT(2), why: 'w2Error' }] })
  const DONE = '3일 저장했어요. 남은 23일은 하지 않았어요.'

  it.each<[string, Block, string, string, string[]]>([
    [
      'dialog',
      { kind: 'dialog' },
      'ERP 화면에 안내 창이 떠서 멈췄어요.',
      'ERP 창을 보고 닫은 뒤 [이어서 하기]를 눌러 주세요.',
      ['닫기', '이어서 하기'],
    ],
    [
      'todayOnly',
      { kind: 'todayOnly' },
      '이 계정은 오늘 마감일지만 열 수 있어 기간 채우기를 쓸 수 없어요.',
      '날짜를 고를 수 있는 계정으로 열어 주세요. 아무 칸도 바꾸지 않았어요.',
      ['닫기'],
    ],
    [
      'noSaveBar',
      { kind: 'noSaveBar' },
      '업무일지 2 저장 줄이 없어 멈췄어요.',
      'ERP에 진료실이 하나 이상 있어야 업무일지 2를 저장할 수 있어요. 확인한 뒤 [이어서 하기]를 눌러 주세요.',
      ['닫기', '이어서 하기'],
    ],
    [
      'readOnly',
      { kind: 'readOnly' },
      '이 화면은 읽기 전용이라 저장할 수 없어요(본사 열람 등).',
      '저장할 수 있는 계정으로 열어 주세요.',
      ['닫기'],
    ],
    [
      'helper',
      { kind: 'helper', code: 'E-HELPER-TIMEOUT' },
      '도우미가 답하지 않아요(120초).',
      '잠시 뒤 다시 해 주세요. (번호 E-HELPER-TIMEOUT)',
      ['닫기', '이어서 하기'],
    ],
    [
      'dateChanged',
      { kind: 'dateChanged' },
      '채우는 동안 ERP 마감 일자가 바뀌어 멈췄어요.',
      '그날은 저장하지 않았어요. 도는 동안에는 마감 일자를 바꾸지 말고 [이어서 하기]를 눌러 주세요.',
      ['닫기', '이어서 하기'],
    ],
    [
      'cellsMissing',
      { kind: 'cellsMissing', count: 3 },
      'ERP 화면에서 찾지 못한 칸이 3개 있어 멈췄어요.',
      'ERP 화면이 바뀌었을 수 있어요. 그날은 아무 칸도 바꾸지 않았어요. [비트 값 채우기]를 누르면 어느 칸인지 보여요.',
      ['닫기'],
    ],
    [
      'noSaveButton',
      { kind: 'noSaveButton' },
      'ERP 저장 단추를 찾지 못해 멈췄어요.',
      "'전체 저장'과 '일일 상세 저장'이 하나씩 있어야 해요. ERP 화면이 바뀌었을 수 있어요. 그날은 아무 칸도 바꾸지 않았어요.",
      ['닫기'],
    ],
    [
      'overlapUnpicked',
      { kind: 'overlapUnpicked' },
      '씨암·SONO를 같이 받은 진료를 어디에 넣을지 정하지 않아 멈췄어요.',
      '그날은 아무 칸도 바꾸지 않았어요. [닫기] 뒤 [기간 채우기]를 다시 하면 살펴본 뒤 어디에 넣을지 물어요.',
      ['닫기'],
    ],
    [
      'unexpected',
      { kind: 'unexpected' },
      '확장에 뜻밖의 문제가 생겨 멈췄어요.',
      "이 화면을 새로고침(F5)한 뒤 [기간 채우기]를 다시 해 주세요. 저장한 날은 '이미 적어 둔 날'로 보여요.",
      ['닫기'],
    ],
  ])('AC-3705.2: %s — 굵은 줄 · 작은 줄 · k/r 줄 · 결과 줄 · 단추(이어서 하기는 dialog·noSaveBar·helper·dateChanged만)', (_name, block, what, how, acts) => {
    const p = draw({ kind: 'blocked', block, run: blockedRun() })
    expect(text(p.$('.lead'))).toBe(what)
    expect(text(p.$('.small'))).toBe(how)
    expect(text(p.kids()[2])).toBe(DONE)
    expect(p.check()[0]).toBe('저장 못 한 날 1일')
    expect(p.$$('.fails li').map(text)).toEqual([`10/2: ERP가 업무일지 2 저장 오류를 알렸어요(업무일지 1은 저장됨). ${AGAIN}`])
    expect(p.acts()).toEqual(acts)
    expect(p.classes()).toEqual([block.kind === 'helper' ? 'lead err' : 'lead', 'small', '', 'check', 'acts'])
    p.button('닫기').click()
    if (acts.includes('이어서 하기')) p.button('이어서 하기').click()
    expect(p.act.mock.calls).toEqual(acts.includes('이어서 하기') ? [[{ kind: 'close' }], [{ kind: 'resume' }]] : [[{ kind: 'close' }]])
  })

  it("AC-3705.2: cellsMissing의 칸 수는 쉼표를 붙이고, 새 까닭의 굵은 줄은 'lead'다(오류 빨강은 도우미만)", () => {
    const p = draw({ kind: 'blocked', block: { kind: 'cellsMissing', count: 1234 }, run: run({ remaining: FILL }) })
    expect(text(p.$('.lead'))).toBe('ERP 화면에서 찾지 못한 칸이 1,234개 있어 멈췄어요.')
    expect(text(p.kids()[2])).toBe('0일 저장했어요. 남은 26일은 하지 않았어요.')
    expect(p.$('.lead')?.className).toBe('lead')
  })

  it('AC-3705.2: 도우미 오류는 errors.ts explain 글 그대로이고, 번호 모양이 아니면 E-BRIDGE-BAD-REPLY(HTML로 읽지 않음)', () => {
    const p = draw({ kind: 'blocked', block: { kind: 'helper', code: 'E-BIT-READ-FAILED' }, run: run({ remaining: FILL }) })
    expect(p.kids().map(text).slice(0, 3)).toEqual([
      '비트 자료를 읽지 못했어요.',
      '잠시 뒤 다시 해 주세요. 계속되면 이 번호를 알려 주세요. (번호 E-BIT-READ-FAILED)',
      '0일 저장했어요. 남은 26일은 하지 않았어요.',
    ])
    expect(p.$('.check')).toBeNull()
    document.body.innerHTML = ''
    const bad = draw({ kind: 'blocked', block: { kind: 'helper', code: '<img src=x onerror=alert(1)>' }, run: run() })
    expect(bad.$('img')).toBeNull()
    expect(bad.el.textContent).not.toContain('<img')
    expect(text(bad.$('.lead'))).toBe('도우미 답의 모양이 맞지 않아 쓰지 않았어요.')
    expect(text(bad.$('.small'))).toContain('(번호 E-BRIDGE-BAD-REPLY)')
  })
})

describe('AC-3705.3 글은 textContent·단추 줄은 맨 끝', () => {
  const views: RangeView[] = [
    { kind: 'pick', from: OCT(1), to: OCT(31), today: '2026-11-13' },
    { kind: 'todayOnly' },
    { kind: 'scanning', total: 31, done: 3 },
    { kind: 'confirm', scan: scan() },
    { kind: 'confirm', scan: scan({ fill: [], fresh: [], written: [] }) },
    { kind: 'running', total: 26, saved: 11, current: OCT(14) },
    { kind: 'stopped', run: run({ remaining: FILL }) },
    { kind: 'blocked', block: { kind: 'dialog' }, run: run() },
    { kind: 'end', run: run({ saved: FILL }) },
  ]

  it.each(views.map((v) => [v.kind, v] as const))('AC-3705.3: %s 안내의 단추 줄(.acts)은 맨 끝 자식이고 단추는 type=button', (_kind, view) => {
    const p = draw(view)
    expect(p.el.lastElementChild?.className).toBe('acts')
    for (const b of p.$$<HTMLButtonElement>('button')) expect(b.type).toBe('button')
  })

  it('AC-3705.3: rangeView.ts는 HTML 글을 넣는 길(innerHTML·outerHTML·insertAdjacentHTML)을 쓰지 않는다', () => {
    const source = readFileSync(path.join(ROOT, 'extension-erp', 'src', 'rangeView.ts'), 'utf8')
    expect(source).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|DOMParser|createContextualFragment/)
  })
})

describe('글은 승인된 시안·design.md 4절 그대로', () => {
  const quoted = (t: string) => expect(SECTION, t).toContain(`'${t}'`)

  it('AC-3701.1~3705.2: 고정 글은 design.md 4절에 따옴표째 있다', () => {
    for (const t of [
      RANGE_TEXT.button,
      RANGE_TEXT.pick.lead,
      RANGE_TEXT.pick.from,
      RANGE_TEXT.pick.to,
      RANGE_TEXT.pick.help,
      RANGE_TEXT.pick.empty,
      RANGE_TEXT.pick.reversed,
      RANGE_TEXT.pick.future,
      RANGE_TEXT.todayOnly.what,
      RANGE_TEXT.todayOnly.how,
      RANGE_TEXT.scanning.lead,
      RANGE_TEXT.scanning.help,
      RANGE_TEXT.confirm.confirmedToo,
      RANGE_TEXT.confirm.saves,
      RANGE_TEXT.confirm.stay,
      RANGE_TEXT.running.help,
      RANGE_TEXT.running.stopping,
      RANGE_TEXT.blocked.dialog.what,
      RANGE_TEXT.blocked.dialog.how,
      RANGE_TEXT.blocked.noSaveBar.what,
      RANGE_TEXT.blocked.noSaveBar.how,
      RANGE_TEXT.blocked.readOnly.what,
      RANGE_TEXT.blocked.readOnly.how,
      RANGE_TEXT.pick.tooLong,
      RANGE_TEXT.blocked.dateChanged.what,
      RANGE_TEXT.blocked.dateChanged.how,
      RANGE_TEXT.blocked.cellsMissing.how,
      RANGE_TEXT.blocked.noSaveButton.what,
      RANGE_TEXT.blocked.noSaveButton.how,
      RANGE_TEXT.blocked.overlapUnpicked.what,
      RANGE_TEXT.blocked.overlapUnpicked.how,
      RANGE_TEXT.blocked.unexpected.what,
      RANGE_TEXT.blocked.unexpected.how,
      RANGE_TEXT.end.none,
      RANGE_TEXT.end.untouched,
      RANGE_TEXT.result.again,
      ...Object.values(RANGE_TEXT.result.why),
      ...Object.values(RANGE_TEXT.head),
    ]) {
      quoted(t)
    }
    expect(Object.keys(RANGE_TEXT.result.why)).toEqual(['load', 'w1Error', 'w1Timeout', 'w2Error', 'w2Timeout'])
    for (const label of [
      RANGE_TEXT.close,
      RANGE_TEXT.pick.scan,
      RANGE_TEXT.scanning.cancel,
      RANGE_TEXT.confirm.start,
      RANGE_TEXT.running.stop,
      RANGE_TEXT.resume,
    ]) {
      expect(SECTION, label).toContain(`[${label}]`)
    }
  })

  it('AC-3702.2~3705.1: 자리 글({})은 design.md 4절 모양 그대로다', () => {
    quoted(RANGE_TEXT.scanning.count(71, 72).replace('71', '{N}').replace('72', '{k}'))
    quoted(RANGE_TEXT.confirm.lead('{기간}', 7).replace('7', '{S}'))
    quoted(RANGE_TEXT.confirm.leadOne('{기간}'))
    quoted(RANGE_TEXT.confirm.none('{기간}'))
    quoted(RANGE_TEXT.confirm.fresh(7).replace('7', '{n}'))
    quoted(RANGE_TEXT.confirm.written(71, 72, 73, '{dayList}').replace('71', '{m}').replace('72', '{a}').replace('73', '{b}'))
    quoted(RANGE_TEXT.confirm.unloaded(7, '{dayList}').replace('7', '{u}'))
    quoted(RANGE_TEXT.confirm.zero(7, '{dayList}').replace('7', '{z}'))
    quoted(RANGE_TEXT.confirm.overwrite(7).replace('7', '{m}'))
    quoted(RANGE_TEXT.confirm.overlapLast('{OVERLAP_TEXT.into}'))
    quoted(RANGE_TEXT.confirm.overlapAsk(7).replace('7', '{K}'))
    quoted(RANGE_TEXT.running.lead(71, 72).replace('71', '{S}').replace('72', '{k}'))
    quoted(RANGE_TEXT.running.now('{M월 D일}'))
    quoted(RANGE_TEXT.stopped.lead(7).replace('7', '{k}'))
    quoted(RANGE_TEXT.stopped.rest(7, '{dayList}').replace('7', '{r}'))
    quoted(RANGE_TEXT.blocked.done(71, 72).replace('71', '{k}').replace('72', '{r}'))
    quoted(RANGE_TEXT.blocked.cellsMissing.what(7).replace('7', '{n}'))
    quoted(RANGE_TEXT.end.lead(7).replace('7', '{n}'))
    quoted(RANGE_TEXT.result.zero(7, '{dayList}').replace('7', '{z}'))
    quoted(RANGE_TEXT.result.draft(7, '{dayList}').replace('7', '{d}'))
    quoted(RANGE_TEXT.result.failed(7).replace('7', '{f}'))
    expect(SECTION).toContain("' 외 {k}일'")
    expect(SECTION).toContain("' 확정'")
  })

  it('AC-3701.1~3705.1: 시안 ①~⑤에 있는 글은 시안 파일에도 그대로 있다', () => {
    for (const t of [
      RANGE_TEXT.button,
      RANGE_TEXT.pick.lead,
      RANGE_TEXT.pick.help,
      RANGE_TEXT.confirm.saves,
      RANGE_TEXT.confirm.stay,
      RANGE_TEXT.running.help,
      RANGE_TEXT.end.untouched,
      RANGE_TEXT.result.again,
      RANGE_TEXT.head.confirm,
      RANGE_TEXT.head.running,
      RANGE_TEXT.head.end,
      RANGE_TEXT.confirm.lead(periodLabel(OCT(1), OCT(31)), 26),
      RANGE_TEXT.running.lead(26, 11),
      RANGE_TEXT.running.now('10월 14일'),
      RANGE_TEXT.confirm.overwrite(8) + RANGE_TEXT.confirm.confirmedToo,
    ]) {
      expect(MOCKUP, t).toContain(t)
    }
  })
})
