// @vitest-environment jsdom
// TASK-7 REQ-3609: ERP 화면 오른쪽 아래 [비트 값 채우기] 단추와 결과 안내(panel.ts). 글은 승인된 목업
// docs/mockups/erp-closing-fill/ ①~⑪과 design.md 5절 그대로다. 숫자는 가짜(환자 정보 없음)
// TASK-17 REQ-3612~3614: 새 보기(future·진료 0건·읽기 전용·이미 적힌 칸 묻기·되돌린 뒤)·맞춰 볼 숫자·까닭별 칸·[지난 결과]·Esc·오류 표 글.
// 이 글들은 목업 승인 없이(사용자 자동 승인) design.md 5-1·5-2 글 그대로 만든다
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sampleDay, settingsFirst } from './__tests__/erpPage'
import { HELD_SALES, planCells, type Where } from './cells'
import type { FillResult } from './fill'
import { createDock, FLOW_TEXT, HOST_ID, OVERLAP_TEXT, placeLine, SKIP_TEXT, TEXT, warningLines, type Dock, type View } from './panel'
import type { ClosingDay, OverlapChoice } from './types'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const MOCKUP = readFileSync(path.join(ROOT, 'docs', 'mockups', 'erp-closing-fill', 'index.html'), 'utf8')
const DESIGN = readFileSync(path.join(ROOT, 'specs', 'erp-closing-fill', 'design.md'), 'utf8')
const REQUIREMENTS = readFileSync(path.join(ROOT, 'specs', 'erp-closing-fill', 'requirements.md'), 'utf8')

const END = '확인한 뒤 업무일지 1 [전체 저장]과 업무일지 2 [일일 상세 저장]을 눌러 주세요.'
const W = {
  moneyUnconfirmed:
    '환불·변경수납 등이 있는 날이에요. 외래 수입 8칸(총매출·청구액·비급여·미수입금·진료수납액·카드·현금·계좌)은 비트 수납 줄을 그대로 더한 값이라 다를 수 있어요. 확인해 주세요.',
  splitUnconfirmed: '청구액·비급여는 비트에서 딱 나눠지지 않아 그대로 더한 값이에요. 확인해 주세요.',
  unpaidVisits: (n: number) => `수납이 끝나지 않은 진료 ${n}건이 있어요.`,
  refund: (won: string) => `환불 ${won}원이 있어요. 금액을 확인해 주세요.`,
  unknownAge: (n: number) => `생년월일이 없는 환자 ${n}명은 연령별 표에 넣지 않았어요.`,
  noHistory: '예전 자료가 따로 있어 주사1회환자는 채우지 않았어요.',
  inpatient: '입원 접수가 있어 입원수입 칸은 채우지 않았어요.',
}

/** 보류 줄(requirements 기본값 (아), design.md 5절) */
const HELD = '씨암·SONO 치료별 매출은 채우지 않았어요. 직접 넣어 주세요.'

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

/** 경고 없는 답(refund 0) */
function quietDay(): ClosingDay {
  const day = sampleDay()
  day.money.refund = 0
  return day
}
/** 처음 값 설정에서 고르지 않아 건너뛴 38칸 자리 */
const UNPICKED: Where[] = planCells(sampleDay(), settingsFirst())
  .filter((p) => p.why === 'unpicked')
  .map((p) => p.where)
const result = (o: Partial<FillResult> = {}): FillResult => ({
  filled: 93,
  kept: 0,
  skipped: [],
  unpicked: UNPICKED,
  noName: [],
  unknown: 0,
  held: 0,
  undo: [],
  ...o,
})
const done = (o: { day?: ClosingDay; result?: Partial<FillResult>; canUndo?: boolean } = {}): View => ({
  kind: 'done',
  date: '2026-11-09',
  result: result(o.result),
  day: o.day ?? quietDay(),
  ...(o.canUndo === undefined ? {} : { canUndo: o.canUndo }),
})
/** 맞춰 볼 숫자 블록(quietDay) */
const CHECK = ['비트와 맞춰 볼 숫자', '외래 총매출 11,668,530원', '진료수납액 5,571,630원', '환자 합계 84명', '비트 화면의 같은 숫자와 먼저 견주어 보세요.']

let dock: Dock | null = null
function open() {
  const onFill = vi.fn()
  const onOpenSettings = vi.fn()
  const onUndo = vi.fn()
  dock = createDock(document, { onFill, onOpenSettings, onUndo })
  document.body.append(dock.host)
  const shadow = dock.host.shadowRoot
  if (!shadow) throw new Error('shadowRoot 없음')
  const $ = <T extends Element = HTMLElement>(sel: string) => shadow.querySelector<T>(sel)
  const $$ = (sel: string) => [...shadow.querySelectorAll(sel)]
  const button = () => $<HTMLButtonElement>('.fill-btn') as HTMLButtonElement
  const panel = () => $<HTMLElement>('.panel') as HTMLElement
  const body = () => $<HTMLElement>('.panel .pb') as HTMLElement
  const last = () => $<HTMLButtonElement>('.last') as HTMLButtonElement
  const acts = () => $$('.acts button').map(text)
  const act = (label: string) => $$('.acts button').find((b) => text(b) === label) as HTMLButtonElement
  return { dock, shadow, $, $$, button, panel, body, last, acts, act, onFill, onOpenSettings, onUndo }
}

afterEach(() => {
  dock?.host.remove()
  dock = null
  document.body.innerHTML = ''
})

/** 보류 줄 장치가 그대로 도는지 보려고 HELD_SALES를 잠깐 씨암·SONO로 둔다(TASK-15에서 비움). 끝나면 되돌린다 */
function withHeld(run: () => void) {
  const saved = HELD_SALES.splice(0, HELD_SALES.length, 'carm', 'sono')
  try {
    run()
  } finally {
    HELD_SALES.splice(0, HELD_SALES.length, ...saved)
  }
}

describe('AC-3609.1 단추', () => {
  it("AC-3609.1: 오른쪽 아래에 [비트 값 채우기] 단추 하나가 있고 안내는 처음에 숨어 있다", () => {
    const p = open()
    expect(p.dock.host.id).toBe(HOST_ID)
    expect(p.$$('button.fill-btn')).toHaveLength(1)
    expect(text(p.button())).toBe('비트 값 채우기')
    expect(p.button().disabled).toBe(false)
    expect(p.button().type).toBe('button')
    expect(p.panel().hidden).toBe(true)
    // ERP 화면의 글꼴·색이 스며들지 않게 그림자 뿌리 안에서 그린다. 자리는 오른쪽 아래
    const css = text(p.$('style'))
    expect(css).toContain(':host{all:initial}')
    expect(css).toMatch(/\.dock\{[^}]*position:fixed;right:24px;bottom:24px/)
  })

  it('AC-3609.1: 단추를 누르면 onFill을 부른다', () => {
    const p = open()
    p.button().click()
    expect(p.onFill).toHaveBeenCalledTimes(1)
  })

  it("AC-3609.2: 읽는 중이면 단추 글이 '비트에서 읽는 중…'이고 막히며 안내는 숨는다", () => {
    const p = open()
    p.dock.show({ kind: 'errDate' })
    p.dock.setReading(true)
    expect(text(p.button())).toBe('비트에서 읽는 중…')
    expect(p.button().disabled).toBe(true)
    expect(p.panel().hidden).toBe(true)
    p.button().click()
    expect(p.onFill).not.toHaveBeenCalled()
    p.dock.setReading(false)
    expect(text(p.button())).toBe('비트 값 채우기')
    expect(p.button().disabled).toBe(false)
  })
})

describe('AC-3609.4 채운 뒤 안내', () => {
  it("AC-3609.4 AC-3613.1: 맞춰 볼 숫자 → '{날짜} 비트 값으로 {N}칸을 채웠어요. 저장은 하지 않았어요.' · 건너뛴 칸 · 끝 줄 · [설정 열기]", () => {
    const p = open()
    p.dock.show(done())
    expect(p.panel().hidden).toBe(false)
    expect(p.panel().getAttribute('role')).toBe('status')
    expect(text(p.$('.pt'))).toBe('비트 값 채우기')
    expect(p.$('.x')?.getAttribute('aria-label')).toBe('안내 닫기')
    expect([...(p.$('.check')?.children ?? [])].map(text)).toEqual(CHECK)
    expect(text(p.$('.check .h'))).toBe('비트와 맞춰 볼 숫자')
    expect(text(p.$('.lead'))).toBe('2026-11-09 비트 값으로 93칸을 채웠어요. 저장은 하지 않았어요.')
    expect(p.$('.lead')?.classList.contains('err')).toBe(false)
    const blocks = p.$$('.blk')
    expect(blocks).toHaveLength(1)
    expect(text(blocks[0].querySelector('p'))).toBe('고르지 않아 건너뛴 칸 38칸')
    expect(text(blocks[0].querySelector('b'))).toBe('38칸')
    expect(text(blocks[0].querySelector('.small'))).toBe('설정에서 코드를 고르지 않은 항목이라 그대로 두었어요.')
    expect(p.$('.warns')).toBeNull()
    expect(text(p.$('.end'))).toBe(END)
    expect(p.acts()).toEqual(['설정 열기'])
    // 차례(design.md 5-1): 맞춰 볼 숫자 → 머리글 → 넣지 않은 칸 → 경고 → 끝 줄 → [되돌리기]·[설정 열기]
    expect([...p.body().children].map((c) => c.className)).toEqual(['check', 'lead', 'blk', 'end', 'acts'])
  })

  it('AC-3613.2: 넣지 않은 칸은 까닭별 묶음(찾지 못함 → 치료사별 → 읽기 전용 → 이름 빈 기타 줄 → 고르지 않음) 차례로 제목 · 짧은 줄 이름 · 할 일이다', () => {
    const p = open()
    const skipped: FillResult['skipped'] = [
      { where: { j: 1, box: '진료 · 치료현황', row: '도수치료' }, skip: 'therapist' },
      { where: { j: 2, field: 'ESWT Radial' }, skip: 'notFound' },
      { where: { j: 1, box: '외래 수입', row: '감액' }, skip: 'locked' },
      { where: { j: 2, card: '예약', row: '경과', col: '내원' }, skip: 'notFound' },
      { where: { j: 2, card: '예약', row: '경과', col: '취소' }, skip: 'notFound' },
    ]
    const noName: Where[] = [
      { j: 2, card: '치료별 신환/90일초진/재진 건수', row: '기타2', col: '신환' },
      { j: 2, card: '치료별 매출', row: '기타2', col: '금액(원)' },
    ]
    p.dock.show(done({ result: { filled: 86, skipped, noName } }))
    const blocks = p.$$('.blk')
    expect(blocks.map((b) => [text(b.querySelector('.h')), text(b.querySelector('.rows')), text(b.querySelector('.small'))])).toEqual([
      ['화면에서 찾지 못한 칸 3칸', 'ESWT Radial · 예약 경과', 'ERP 화면에서 찾지 못해 그대로 둔 칸이에요. 직접 넣어 주세요.'],
      ['치료사별 입력 줄 1칸', '치료현황 도수치료', '치료사별로 넣는 줄이라 그대로 두었어요. 치료사별 칸에 직접 넣어 주세요.'],
      ['읽기 전용 칸 1칸', '외래 수입 감액', '잠긴 칸이라 그대로 두었어요.'],
      [
        'ERP 줄 이름이 빈 기타 줄 2칸',
        '치료별 건수 기타2 · 치료별 매출 기타2',
        '설정 화면에서 그 기타 줄의 ERP 줄 이름을 업무일지 2 줄 이름과 똑같이 넣어 주세요.',
      ],
      ['고르지 않아 건너뛴 칸 38칸', placeLine(UNPICKED), '설정에서 코드를 고르지 않은 항목이라 그대로 두었어요.'],
    ])
  })

  it("AC-3613.2: 짧은 줄 이름은 같은 줄을 한 번만, 10줄까지 쓰고 넘으면 ' 외 {K}줄'이다", () => {
    const rows = ['10대미만', '10대', '20대', '30대', '40대', '50대', '60대', '70대', '80대', '90대', '100대', '110대']
    const many: Where[] = rows.flatMap((row) =>
      ['신환', '재진'].map((col): Where => ({ j: 2, card: '연령별 신환/90일초진/재진', row, col })),
    )
    expect(placeLine(many)).toBe(
      '연령별 10대미만 · 연령별 10대 · 연령별 20대 · 연령별 30대 · 연령별 40대 · 연령별 50대 · 연령별 60대 · 연령별 70대 · 연령별 80대 · 연령별 90대 외 2줄',
    )
    expect(placeLine(many.slice(0, 20))).not.toContain('외')
    expect(placeLine([])).toBe('')
    // 처음 값 설정의 고르지 않은 38칸: 같은 줄은 한 번
    expect(placeLine(UNPICKED)).toBe(
      '치료현황 도수상담 · 치료현황 리푸스 · 치료현황 손발톱케어 · 치료현황 CT · 치료현황 수술 · 예약 주사 · 예약 경과 · 예약 진료예약 · 예약 기타(수액,드레싱등) · 치료별 건수 기타2 외 10줄',
    )
  })

  it("AC-3612.3: [빈 칸만]으로 그대로 둔 칸이 있으면 머리글 다음에 '이미 적힌 {K}칸은 그대로 두었어요.'", () => {
    const p = open()
    p.dock.show(done({ result: { filled: 91, kept: 2 } }))
    expect(text(p.$('.kept'))).toBe('이미 적힌 2칸은 그대로 두었어요.')
    expect([...p.body().children].map((c) => c.className)).toEqual(['check', 'lead', 'kept', 'blk', 'end', 'acts'])
    p.dock.show(done())
    expect(p.$('.kept')).toBeNull()
  })

  it('AC-3612.4: 되돌릴 수 있으면 [되돌리기]가 [설정 열기] 앞에 있고 누르면 onUndo를 부른다', () => {
    const p = open()
    p.dock.show(done({ canUndo: true }))
    expect(p.acts()).toEqual(['되돌리기', '설정 열기'])
    p.act('되돌리기').click()
    expect(p.onUndo).toHaveBeenCalledTimes(1)
    expect(p.onOpenSettings).not.toHaveBeenCalled()
    p.dock.show(done({ canUndo: false }))
    expect(p.acts()).toEqual(['설정 열기'])
  })

  it('AC-3609.4: 건너뛴 칸이 없으면 그 줄을 보이지 않는다', () => {
    const p = open()
    p.dock.show(done({ result: { unpicked: [], filled: 131 } }))
    expect(p.$$('.blk')).toHaveLength(0)
    expect(text(p.$('.lead'))).toBe('2026-11-09 비트 값으로 131칸을 채웠어요. 저장은 하지 않았어요.')
  })

  it("AC-3609.4: 보류 칸이 있으면(held > 0) 고르지 않은 칸 줄 바로 아래에 '씨암·SONO 치료별 매출은 채우지 않았어요. 직접 넣어 주세요.' 한 줄", () => {
    const p = open()
    const missing: FillResult['skipped'] = [{ where: { j: 1, box: '진료 · 치료현황', row: '도수치료' }, skip: 'notFound' }]
    const day = quietDay()
    day.warnings.unpaidVisits = 1
    withHeld(() => p.dock.show(done({ day, result: { filled: 90, skipped: missing, held: 2 } })))
    const blocks = p.$$('.blk')
    expect(blocks).toHaveLength(3)
    expect(text(blocks[1].querySelector('p'))).toBe('고르지 않아 건너뛴 칸 38칸')
    expect(text(blocks[2])).toBe(HELD)
    expect(blocks[2].classList.contains('held')).toBe(true)
    expect([...p.body().children].map((c) => c.className)).toEqual(['check', 'lead', 'blk', 'blk', 'blk held', 'warns', 'end', 'acts'])
    // 보류 칸은 채운 칸·못 찾은 칸·고르지 않은 칸 수에 들지 않는다
    expect(text(p.$('.lead'))).toBe('2026-11-09 비트 값으로 90칸을 채웠어요. 저장은 하지 않았어요.')
    expect(text(blocks[0].querySelector('.h'))).toBe('화면에서 찾지 못한 칸 1칸')
  })

  it('AC-3609.4: 고르지 않은 칸이 없어도 보류 줄은 보이고, 보류 칸이 없으면(held 0) 보류 줄이 없다', () => {
    const p = open()
    withHeld(() => p.dock.show(done({ result: { unpicked: [], filled: 129, held: 2 } })))
    expect(p.$$('.blk').map(text)).toEqual([HELD])
    expect([...p.body().children].map((c) => c.className)).toEqual(['check', 'lead', 'blk held', 'end', 'acts'])
    p.dock.show(done({ result: { held: 0 } }))
    expect(p.$$('.held')).toHaveLength(0)
    expect(p.body().textContent).not.toContain('치료별 매출은 채우지 않았어요')
  })

  it('AC-3609.4: [설정 열기]는 onOpenSettings를 부르고, [×]는 안내를 닫는다', () => {
    const p = open()
    p.dock.show(done())
    p.$<HTMLButtonElement>('.acts button')?.click()
    expect(p.onOpenSettings).toHaveBeenCalledTimes(1)
    p.$<HTMLButtonElement>('.x')?.click()
    expect(p.panel().hidden).toBe(true)
    p.dock.hide()
    expect(p.panel().hidden).toBe(true)
  })
})

describe('AC-3609.7 함께 있는 진료 묻기(design.md 5절)', () => {
  const ASK = '씨암·SONO 코드가 함께 있는 진료가 9건 있어요(씨암 쪽 1,886,520원 · SONO 쪽 1,234원). 어디에 넣을까요?'
  const ask = (p: ReturnType<typeof open>, last?: OverlapChoice) =>
    p.dock.askOverlap({ visits: 9, carm: 1_886_520, sono: 1_234, last })
  const choices = (p: ReturnType<typeof open>) => p.$$('.acts button').map(text)

  it('AC-3609.7 AC-3618.3: 묻는 줄과 [씨암에 넣기]·[SONO에 넣기]·[둘 다 넣기]·[안내 닫기]가 보이고, 처음엔 (지난번)이 없다', () => {
    const p = open()
    void ask(p)
    expect(p.panel().hidden).toBe(false)
    expect(text(p.$('.lead'))).toBe(ASK)
    expect(p.$('.lead')?.classList.contains('err')).toBe(false)
    expect(choices(p)).toEqual(['씨암에 넣기', 'SONO에 넣기', '둘 다 넣기', '안내 닫기'])
    expect(p.$$('.acts button').map((b) => b.getAttribute('data-choice'))).toEqual(['carm', 'sono', 'both', null])
    // 처음엔 먼저 포커스를 받는 단추가 없다
    expect(p.shadow.activeElement).toBeNull()
  })

  it('AC-3618.3: [안내 닫기] 단추를 누르면 null로 끝나고 안내가 닫힌다(다른 두 묻기와 같음)', async () => {
    const p = open()
    const answer = ask(p, 'sono')
    p.act('안내 닫기').click()
    await expect(answer).resolves.toBeNull()
    expect(p.panel().hidden).toBe(true)
  })

  it.each<[OverlapChoice, string[]]>([
    ['carm', ['씨암에 넣기 (지난번)', 'SONO에 넣기', '둘 다 넣기', '안내 닫기']],
    ['sono', ['씨암에 넣기', 'SONO에 넣기 (지난번)', '둘 다 넣기', '안내 닫기']],
    ['both', ['씨암에 넣기', 'SONO에 넣기', '둘 다 넣기 (지난번)', '안내 닫기']],
  ])("AC-3609.7: 지난번 고른 것(%s)은 글 끝에 ' (지난번)'이 붙고 먼저 포커스를 받는다", (last, labels) => {
    const p = open()
    void ask(p, last)
    expect(choices(p)).toEqual(labels)
    expect(p.shadow.activeElement?.getAttribute('data-choice')).toBe(last)
  })

  it.each<OverlapChoice>(['carm', 'sono', 'both'])('AC-3609.7: [%s] 단추를 누르면 그 선택으로 끝나고 안내는 그대로 열려 있다', async (choice) => {
    const p = open()
    const answer = ask(p)
    p.$<HTMLButtonElement>(`.acts button[data-choice="${choice}"]`)?.click()
    await expect(answer).resolves.toBe(choice)
  })

  it('AC-3609.7: [안내 닫기](×)·hide()·다른 안내를 보이면 null로 끝난다(아무것도 고르지 않음)', async () => {
    const p = open()
    const closed = ask(p)
    p.$<HTMLButtonElement>('.x')?.click()
    await expect(closed).resolves.toBeNull()
    expect(p.panel().hidden).toBe(true)
    const hidden = ask(p)
    p.dock.hide()
    await expect(hidden).resolves.toBeNull()
    const replaced = ask(p)
    p.dock.show({ kind: 'dateChanged' })
    await expect(replaced).resolves.toBeNull()
    // 그 뒤에 다시 물으면 새로 고를 수 있다
    const again = ask(p)
    p.$<HTMLButtonElement>('.acts button[data-choice="carm"]')?.click()
    await expect(again).resolves.toBe('carm')
  })

  it('AC-3609.7: 채운 뒤 안내에 함께 있는 진료 줄이 머리글 바로 다음에 있다', () => {
    const lines: [OverlapChoice, string][] = [
      ['carm', '함께 있는 진료 9건은 씨암에 넣었어요.'],
      ['sono', '함께 있는 진료 9건은 SONO에 넣었어요.'],
      ['both', '함께 있는 진료 9건은 씨암·SONO 둘 다에 넣었어요.'],
    ]
    for (const [choice, line] of lines) {
      const p = open()
      p.dock.show({ ...done(), overlap: { visits: 9, choice } } as View)
      expect(text(p.$('.ovl')), choice).toBe(line)
      expect([...p.body().children].map((c) => c.className), choice).toEqual(['check', 'lead', 'ovl', 'blk', 'end', 'acts'])
      p.dock.host.remove()
    }
    const p = open()
    p.dock.show(done())
    expect(p.$('.ovl')).toBeNull()
  })

  it('AC-3609.7: 글은 design.md 5절 겹친 진료 묻기 글 그대로다', () => {
    const section = DESIGN.slice(DESIGN.indexOf('- 겹친 진료 묻기(TASK-15'))
    const line = section.slice(0, section.indexOf('\n'))
    expect(line).toContain(`'${OVERLAP_TEXT.ask(1, 2, 3).replace('1건', '{N}건').replace('2원', '{A}원').replace('3원', '{B}원')}'`)
    for (const label of ['씨암에 넣기', 'SONO에 넣기', '둘 다 넣기', TEXT.close]) expect(line).toContain(`[${label}]`)
    expect(Object.values(OVERLAP_TEXT.choice)).toEqual(['씨암에 넣기', 'SONO에 넣기', '둘 다 넣기'])
    expect(line).toContain(`'${OVERLAP_TEXT.last}'`)
    expect(line).toContain("'함께 있는 진료 {N}건은 {씨암에 | SONO에 | 씨암·SONO 둘 다에} 넣었어요.'")
    expect(Object.values(OVERLAP_TEXT.into)).toEqual(['씨암에', 'SONO에', '씨암·SONO 둘 다에'])
  })
})

describe('AC-3609.4 경고 줄(design.md 5절)', () => {
  it('AC-3609.4: 해당하는 것이 없으면 경고 줄이 없다', () => {
    expect(warningLines(quietDay())).toEqual([])
  })

  it('AC-3609.4: 경고마다 design.md 5절 글 그대로이고, 차례도 5절 차례다', () => {
    const day = quietDay()
    day.warnings = { moneyUnconfirmed: true, splitUnconfirmed: true, unpaidVisits: 2, unknownAge: 1, noHistory: true }
    day.money.refund = 33_000
    day.inpatientVisits = 3
    expect(warningLines(day)).toEqual([
      W.moneyUnconfirmed,
      W.splitUnconfirmed,
      W.unpaidVisits(2),
      W.refund('33,000'),
      W.unknownAge(1),
      W.noHistory,
      W.inpatient,
    ])
  })

  it.each([
    ['moneyUnconfirmed', (d: ClosingDay) => (d.warnings.moneyUnconfirmed = true), W.moneyUnconfirmed],
    ['splitUnconfirmed', (d: ClosingDay) => (d.warnings.splitUnconfirmed = true), W.splitUnconfirmed],
    ['unpaidVisits 5', (d: ClosingDay) => (d.warnings.unpaidVisits = 5), W.unpaidVisits(5)],
    ['refund 1,234,000', (d: ClosingDay) => (d.money.refund = 1_234_000), W.refund('1,234,000')],
    ['unknownAge 4', (d: ClosingDay) => (d.warnings.unknownAge = 4), W.unknownAge(4)],
    ['noHistory', (d: ClosingDay) => (d.warnings.noHistory = true), W.noHistory],
    ['inpatientVisits 1', (d: ClosingDay) => (d.inpatientVisits = 1), W.inpatient],
  ])('AC-3609.4: %s 하나만 있으면 그 줄 하나다', (_name, set, line) => {
    const day = quietDay()
    set(day)
    expect(warningLines(day)).toEqual([line])
  })

  it('AC-3609.4: 환불이 0·null이면 환불 줄이 없다', () => {
    const day = quietDay()
    day.money.refund = null
    expect(warningLines(day)).toEqual([])
    day.money.refund = 0
    expect(warningLines(day)).toEqual([])
  })

  it('AC-3609.4: 경고는 건너뛴 칸 뒤, 끝 줄 앞에 줄마다 하나씩 그린다', () => {
    const p = open()
    const day = quietDay()
    day.warnings.moneyUnconfirmed = true
    day.warnings.unpaidVisits = 2
    day.money.refund = 33_000
    p.dock.show(done({ day }))
    expect(p.$$('.warns li').map(text)).toEqual([W.moneyUnconfirmed, W.unpaidVisits(2), W.refund('33,000')])
    expect([...p.body().children].map((c) => c.className)).toEqual(['check', 'lead', 'blk', 'warns', 'end', 'acts'])
  })
})

describe('AC-3609.2·3609.3·3609.5 안내 글', () => {
  it("AC-3609.2: 설정 저장 전이면 처음 안내와 '설정 화면을 새 탭으로 열었어요…' · [설정 열기]", () => {
    const p = open()
    p.dock.show({ kind: 'first' })
    expect(text(p.$('.lead'))).toBe('처음 한 번 설정 화면에서 코드를 확인하고 [저장]을 눌러 주세요.')
    expect(text(p.$('.small'))).toBe('설정 화면을 새 탭으로 열었어요. 아무 칸도 바꾸지 않았어요.')
    expect(p.$$('.acts button').map(text)).toEqual(['설정 열기'])
    p.$<HTMLButtonElement>('.acts button')?.click()
    expect(p.onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it("AC-3609.2: 날짜가 없으면 '마감 일자를 먼저 골라 주세요.' 하나다", () => {
    const p = open()
    p.dock.show({ kind: 'errDate' })
    expect([...p.body().children].map(text)).toEqual(['마감 일자를 먼저 골라 주세요.'])
    expect(p.$('.lead')?.classList.contains('err')).toBe(false)
  })

  it("AC-3609.3: 읽는 동안 날짜가 바뀌면 '읽는 동안 마감 일자가 바뀌어 채우지 않았어요. 다시 눌러 주세요.' 하나다", () => {
    const p = open()
    p.dock.show({ kind: 'dateChanged' })
    expect([...p.body().children].map(text)).toEqual(['읽는 동안 마감 일자가 바뀌어 채우지 않았어요. 다시 눌러 주세요.'])
  })

  it.each<[string, string, string]>([
    ['E-HELPER-MISSING', 'ERP 도우미가 이 PC에 없어요.', 'ERP 도우미를 설치해 주세요. 받은 zip을 풀고 install.cmd를 두 번 누르면 돼요.'],
    [
      'E-BIT-NOT-REGISTERED',
      '이 PC가 아직 등록되지 않았어요.',
      'ERP 도우미 설치 파일을 다시 실행해 주세요(비트 로그인 → PC 확인 창 [확인]).',
    ],
    ['E-BIT-READ-FAILED', '비트 자료를 읽지 못했어요.', '잠시 뒤 다시 해 주세요. 계속되면 이 번호를 알려 주세요.'],
    ['E-HELPER-TIMEOUT', '도우미가 답하지 않아요(120초).', '잠시 뒤 다시 해 주세요.'],
    ['E-NEW-THING', '비트에서 읽지 못했어요.', '잠시 뒤 다시 해 주세요. 계속되면 이 번호를 알려 주세요.'],
  ])("AC-3609.5 AC-3614.1: 오류 %s 이면 굵은 '무엇이' · '어떻게' · 작은 줄 '아무 칸도 바꾸지 않았어요. (번호 …)'이고 [설정 열기]는 없다", (code, what, how) => {
    const p = open()
    p.dock.show({ kind: 'err', code })
    expect(text(p.$('.lead'))).toBe(what)
    expect(p.$('.lead')?.classList.contains('err')).toBe(true)
    expect([...p.body().children].map(text)).toEqual([what, how, `아무 칸도 바꾸지 않았어요. (번호 ${code})`])
    expect([...p.body().children].map((c) => c.className)).toEqual(['lead err', '', 'small'])
    expect(p.$$('.acts')).toHaveLength(0)
  })

  it('AC-3614.1: 오류 번호 모양이 아닌 글은 보이지 않고 E-BRIDGE-BAD-REPLY다(HTML로 읽지 않는다)', () => {
    const p = open()
    p.dock.show({ kind: 'err', code: '<img src=x>' })
    expect(p.$('img')).toBeNull()
    expect(p.body().textContent).not.toContain('<img')
    expect(text(p.$('.small'))).toBe('아무 칸도 바꾸지 않았어요. (번호 E-BRIDGE-BAD-REPLY)')
    expect(text(p.$('.lead'))).toBe('도우미 답의 모양이 맞지 않아 쓰지 않았어요.')
  })

  it('AC-3609.5: 다음 안내를 보이면 앞 안내 글은 남지 않는다', () => {
    const p = open()
    p.dock.show(done())
    p.dock.show({ kind: 'err', code: 'E-HELPER-TIMEOUT' })
    expect(p.$$('.blk')).toHaveLength(0)
    expect(p.$$('.end')).toHaveLength(0)
    expect(p.$$('.check')).toHaveLength(0)
    expect(text(p.$('.lead'))).toBe('도우미가 답하지 않아요(120초).')
  })
})

describe('AC-3612.1·3612.4·3612.5 멈춤·되돌림 안내(design.md 5-1)', () => {
  it.each<[string, View, string[]]>([
    [
      '오늘보다 뒤',
      { kind: 'future', date: '2026-11-11' },
      ['마감 일자(2026-11-11)가 오늘보다 뒤예요.', '날짜를 확인해 주세요.', '아무 칸도 바꾸지 않았어요.'],
    ],
    ['읽기 전용', { kind: 'readOnly' }, ['이 화면은 읽기 전용이라 채울 수 없어요(본사 열람 등).', '아무 칸도 바꾸지 않았어요.']],
    [
      '되돌린 뒤',
      { kind: 'undone', restored: 1234, gone: 0, edited: 0 },
      ['되돌렸어요. 1,234칸을 채우기 전 값으로 돌렸어요. 저장은 하지 않았어요.'],
    ],
    [
      '되돌린 뒤(못 돌린 칸 있음)',
      { kind: 'undone', restored: 90, gone: 3, edited: 0 },
      ['되돌렸어요. 90칸을 채우기 전 값으로 돌렸어요. 저장은 하지 않았어요.', '화면이 바뀌어 3칸은 되돌리지 못했어요.'],
    ],
    [
      '되돌린 뒤(AC-3618.2 손으로 고친 칸 있음)',
      { kind: 'undone', restored: 88, gone: 0, edited: 2 },
      ['되돌렸어요. 88칸을 채우기 전 값으로 돌렸어요. 저장은 하지 않았어요.', '채운 뒤 손으로 고친 2칸은 그대로 두었어요.'],
    ],
    [
      '되돌린 뒤(AC-3618.2 손으로 고친 칸·못 돌린 칸)',
      { kind: 'undone', restored: 1000, gone: 1, edited: 1234 },
      [
        '되돌렸어요. 1,000칸을 채우기 전 값으로 돌렸어요. 저장은 하지 않았어요.',
        '채운 뒤 손으로 고친 1,234칸은 그대로 두었어요.',
        '화면이 바뀌어 1칸은 되돌리지 못했어요.',
      ],
    ],
    ['날짜가 바뀐 뒤 되돌리기', { kind: 'undoDateChanged' }, ['마감 일자가 바뀌어 되돌리지 않았어요.', '아무 칸도 바꾸지 않았어요.']],
  ])('AC-3612.1·3612.4·3612.5: %s 안내 글(굵은 줄 → 보통 줄 → 작은 줄)', (_name, view, want) => {
    const p = open()
    p.dock.show(view)
    expect([...p.body().children].map(text)).toEqual(want)
    expect(p.$('.lead')?.classList.contains('err')).toBe(false)
    expect(p.$$('.acts')).toHaveLength(0)
    const last = p.body().lastElementChild
    if (want.at(-1) === '아무 칸도 바꾸지 않았어요.') expect(last?.className).toBe('small')
  })
})

describe('AC-3612.2 진료 0건 묻기(askZero)', () => {
  const ZERO = [
    '2026-11-09에는 비트 진료가 한 건도 없어요.',
    '마감 일자가 맞는지 확인해 주세요. 맞으면 [그래도 채우기]로 채울 수 있어요(쉬는 날 예약 칸 등).',
    '아직 아무 칸도 바꾸지 않았어요.',
  ]

  it('AC-3612.2: 글 셋과 [그래도 채우기]·[안내 닫기], [안내 닫기]가 먼저 포커스를 받는다', () => {
    const p = open()
    void p.dock.askZero('2026-11-09')
    expect(p.panel().hidden).toBe(false)
    expect([...p.body().children].filter((c) => c.tagName === 'P').map(text)).toEqual(ZERO)
    expect(p.acts()).toEqual(['그래도 채우기', '안내 닫기'])
    expect(p.shadow.activeElement).toBe(p.act('안내 닫기'))
  })

  it('AC-3612.2: [그래도 채우기]는 true, [안내 닫기]·×·hide()·Esc는 false로 끝난다', async () => {
    const p = open()
    const go = p.dock.askZero('2026-11-09')
    p.act('그래도 채우기').click()
    await expect(go).resolves.toBe(true)
    const closed = p.dock.askZero('2026-11-09')
    p.act('안내 닫기').click()
    await expect(closed).resolves.toBe(false)
    expect(p.panel().hidden).toBe(true)
    const x = p.dock.askZero('2026-11-09')
    p.$<HTMLButtonElement>('.x')?.click()
    await expect(x).resolves.toBe(false)
    const hidden = p.dock.askZero('2026-11-09')
    p.dock.hide()
    await expect(hidden).resolves.toBe(false)
    const esc = p.dock.askZero('2026-11-09')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await expect(esc).resolves.toBe(false)
  })
})

describe('AC-3612.3 이미 적힌 칸 묻기(askWritten)', () => {
  const places: Where[] = [
    { j: 1, box: '환자현황', row: '신환' },
    { j: 2, card: '예약', row: '경과', col: '내원' },
    { j: 2, card: '예약', row: '경과', col: '취소' },
  ]

  it("AC-3612.3: '이미 적힌 칸 {N}개가 비트 값으로 바뀌어요.' · '바뀌는 칸: …' · 안내 · [바꾸기] [빈 칸만](먼저 포커스) [안내 닫기]", () => {
    const p = open()
    void p.dock.askWritten(places)
    expect([...p.body().children].filter((c) => c.tagName === 'P').map(text)).toEqual([
      '이미 적힌 칸 3개가 비트 값으로 바뀌어요.',
      '바뀌는 칸: 환자현황 신환 · 예약 경과',
      '[빈 칸만]을 누르면 적힌 칸은 그대로 두고 빈 칸만 채워요.',
    ])
    expect(p.acts()).toEqual(['바꾸기', '빈 칸만', '안내 닫기'])
    expect(p.shadow.activeElement).toBe(p.act('빈 칸만'))
  })

  it("AC-3612.3: [바꾸기]는 'all', [빈 칸만]은 'empty', [안내 닫기]·×·다른 안내는 null", async () => {
    const p = open()
    const all = p.dock.askWritten(places)
    p.act('바꾸기').click()
    await expect(all).resolves.toBe('all')
    const empty = p.dock.askWritten(places)
    p.act('빈 칸만').click()
    await expect(empty).resolves.toBe('empty')
    const closed = p.dock.askWritten(places)
    p.act('안내 닫기').click()
    await expect(closed).resolves.toBeNull()
    expect(p.panel().hidden).toBe(true)
    const replaced = p.dock.askWritten(places)
    const stale = p.act('바꾸기')
    p.dock.show({ kind: 'dateChanged' })
    await expect(replaced).resolves.toBeNull()
    // 떨어진 앞 단추는 다음 묻기를 끝내지 않는다
    const next = p.dock.askWritten(places)
    stale.click()
    p.act('빈 칸만').click()
    await expect(next).resolves.toBe('empty')
  })

  it('AC-3612.3: 숫자는 쉼표로 쓴다', () => {
    const p = open()
    const many: Where[] = Array.from({ length: 1234 }, () => places[0])
    void p.dock.askWritten(many)
    expect(text(p.$('.lead'))).toBe('이미 적힌 칸 1,234개가 비트 값으로 바뀌어요.')
    expect(text(p.$$('.pb > p')[1])).toBe('바뀌는 칸: 환자현황 신환')
  })
})

describe('AC-3613.3 [지난 결과]·Esc', () => {
  it('AC-3613.3: [지난 결과]는 지난 결과가 있고 안내가 닫혀 있을 때만 보이고, 누르면 그 안내를 다시 연다', () => {
    const p = open()
    expect(p.last().hidden).toBe(true)
    expect(p.last().classList.contains('btn-2')).toBe(true)
    expect(text(p.last())).toBe('지난 결과')
    const view = done({ canUndo: true })
    p.dock.setLast(view)
    expect(p.last().hidden).toBe(false)
    p.dock.show(view)
    expect(p.last().hidden).toBe(true)
    p.$<HTMLButtonElement>('.x')?.click()
    expect(p.last().hidden).toBe(false)
    p.last().click()
    expect(p.panel().hidden).toBe(false)
    expect(text(p.$('.lead'))).toBe('2026-11-09 비트 값으로 93칸을 채웠어요. 저장은 하지 않았어요.')
    expect(p.acts()).toEqual(['되돌리기', '설정 열기'])
    expect(p.last().hidden).toBe(true)
    expect(p.onFill).not.toHaveBeenCalled()
    p.dock.hide()
    p.dock.setLast(null)
    expect(p.last().hidden).toBe(true)
  })

  it('AC-3613.3: 읽는 중엔 [지난 결과]가 막힌다', () => {
    const p = open()
    p.dock.setLast(done())
    p.dock.setReading(true)
    expect(p.last().hidden).toBe(false)
    expect(p.last().disabled).toBe(true)
    p.last().click()
    expect(p.panel().hidden).toBe(true)
    p.dock.setReading(false)
    expect(p.last().disabled).toBe(false)
  })

  it('AC-3613.3: 안내가 열려 있을 때 문서의 Esc가 안내를 닫고, preventDefault·stopPropagation 하지 않는다', () => {
    const p = open()
    const seen: string[] = []
    const onWindow = (e: KeyboardEvent) => seen.push(e.key)
    window.addEventListener('keydown', onWindow)
    try {
      p.dock.show(done())
      const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      document.body.dispatchEvent(esc)
      expect(p.panel().hidden).toBe(true)
      expect(esc.defaultPrevented).toBe(false)
      expect(seen).toEqual(['Escape'])
      // 닫혀 있으면 아무 일도 없다
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      expect(p.panel().hidden).toBe(true)
      // 다른 키는 닫지 않는다
      p.dock.show(done())
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
      expect(p.panel().hidden).toBe(false)
    } finally {
      window.removeEventListener('keydown', onWindow)
    }
  })

  it('AC-3613.3: 겹친 진료 묻기도 Esc로 닫히면 null이다', async () => {
    const p = open()
    const answer = p.dock.askOverlap({ visits: 1, carm: 1, sono: 1 })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await expect(answer).resolves.toBeNull()
  })

  it('AC-3613.3: 화면에서 뗀 안내는 Esc를 받지 않는다', () => {
    const p = open()
    p.dock.show(done())
    p.dock.host.remove()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(p.panel().hidden).toBe(false)
  })
})

describe('AC-3618.4 안내 모양: 창보다 길면 안에서 스크롤·단추 줄은 늘 보임·낱말 안 끊김', () => {
  const css = (p: ReturnType<typeof open>) => (p.$('style')?.textContent ?? '').replace(/\s+/g, '')
  /** 선택자 하나의 규칙 글(첫 번째) */
  const rule = (all: string, selector: string) => {
    const at = all.indexOf(`${selector}{`)
    return at < 0 ? '' : all.slice(at + selector.length + 1, all.indexOf('}', at))
  }

  it('AC-3618.4: 안내는 창 높이에 맞춘 max-height와 overflow-y:auto로 안에서 스크롤된다', () => {
    const panel = rule(css(open()), '.panel')
    expect(panel).toMatch(/max-height:calc\(100vh-\d+px\)/)
    expect(panel).toContain('overflow-y:auto')
  })

  it('AC-3618.4: 스크롤 막대는 ::-webkit-scrollbar로 늘 보이게 그리고, 그 그림을 끄는 scrollbar-width·scrollbar-color는 쓰지 않는다', () => {
    const all = css(open())
    expect(rule(all, '.panel::-webkit-scrollbar')).toMatch(/width:\d+px/)
    expect(rule(all, '.panel::-webkit-scrollbar-thumb')).toContain('background')
    expect(all).not.toContain('scrollbar-width')
    expect(all).not.toContain('scrollbar-color')
  })

  it('AC-3618.4: 단추 줄(.acts)은 안내 아래에 붙는다(sticky·bottom 0·흰 바탕·위 줄)', () => {
    const acts = rule(css(open()), '.acts')
    expect(acts).toContain('position:sticky')
    expect(acts).toContain('bottom:0')
    expect(acts).toContain('background:var(--surface)')
    expect(acts).toMatch(/border-top:1px/)
  })

  it('AC-3618.4: 채운 뒤 안내의 단추 줄은 안내 맨 끝 자식이고 [되돌리기]·[설정 열기]가 그 안에 있다', () => {
    const p = open()
    p.dock.show(done({ canUndo: true }))
    const last = p.body().lastElementChild
    expect(last?.className).toBe('acts')
    expect([...(last?.children ?? [])].map(text)).toEqual(['되돌리기', '설정 열기'])
  })

  it('AC-3618.4: 안내 글은 한글 낱말 가운데서 줄을 바꾸지 않는다(keep-all·anywhere)', () => {
    const panel = rule(css(open()), '.panel')
    expect(panel).toContain('word-break:keep-all')
    expect(panel).toContain('overflow-wrap:anywhere')
  })
})

describe('AC-3609.4·3609.5 글은 승인된 목업·명세 그대로', () => {
  it('AC-3609.4: 목업에서 온 고정 글(TEXT)은 모두 목업 파일에 그대로 있다', () => {
    for (const [name, value] of Object.entries(TEXT)) {
      if (typeof value === 'string') expect(MOCKUP, name).toContain(value)
    }
  })

  it('AC-3609.5: 기본값 (바)의 두 줄은 오류 표의 무엇이·어떻게로 나뉘어 남고(AC-3609.5) 옛 글은 쓰지 않는다', () => {
    const defaultBa = REQUIREMENTS.split('\n').find((line) => line.startsWith('- (바)')) ?? ''
    const ac = REQUIREMENTS.split('\n').find((line) => line.startsWith('- AC-3609.5:')) ?? ''
    expect(ac).toContain('(바)의 두 줄과 120초 줄은 표의 무엇이·어떻게로 나뉘어 남는다')
    expect(defaultBa).toContain("'ERP 도우미를 설치해 주세요.'")
    const p = open()
    p.dock.show({ kind: 'err', code: 'E-HELPER-MISSING' })
    expect(p.body().textContent).toContain('ERP 도우미를 설치해 주세요.')
    p.dock.show({ kind: 'err', code: 'E-BIT-NOT-REGISTERED' })
    expect(p.body().textContent).toContain('이 PC가 아직 등록되지 않았어요.')
    expect(p.body().textContent).toContain('ERP 도우미 설치 파일을 다시 실행해 주세요')
    expect(JSON.stringify(TEXT)).not.toContain('도우미를 새 판으로 설치해 주세요.')
  })

  it("AC-3609.4: 보류 줄은 requirements 기본값 (아)·design.md 5절 글 그대로이고, 미수납 경고는 '치료별 매출이 적게 나왔을 수 있어요.'를 뗀 새 글이다", () => {
    const defaultAh = REQUIREMENTS.split('\n').find((line) => line.startsWith('- (아)')) ?? ''
    expect(defaultAh).toContain(`'${HELD}'`)
    expect(DESIGN).toContain(`'${HELD}'`)
    expect(TEXT.held(['씨암', 'SONO'])).toBe(HELD)
    expect(DESIGN).toContain("'수납이 끝나지 않은 진료 N건이 있어요.'(TASK-14)")
    const day = quietDay()
    day.warnings.unpaidVisits = 3
    expect(warningLines(day)).toEqual(['수납이 끝나지 않은 진료 3건이 있어요.'])
    expect(warningLines(day).join('')).not.toContain('치료별 매출이 적게 나왔을 수 있어요')
  })

  it('AC-3609.4: 경고 고정 글은 design.md 5절에, 처음 안내·날짜 글은 requirements AC-3609.2·3609.3에 그대로 있다', () => {
    for (const line of [W.moneyUnconfirmed, W.splitUnconfirmed, W.noHistory, W.inpatient, END]) expect(DESIGN).toContain(line)
    for (const value of [TEXT.first, TEXT.noDate, TEXT.dateChanged]) expect(REQUIREMENTS).toContain(value)
  })

  it('AC-3612.1~3613.2: 새 안내 글(FLOW_TEXT)은 design.md 5-1 글 그대로다({} 자리 채움)', () => {
    const section = DESIGN.slice(DESIGN.indexOf('### 5-1 '), DESIGN.indexOf('### 5-2 '))
    const quoted = (t: string) => expect(section, t).toContain(`'${t}'`)
    quoted(FLOW_TEXT.future('{날짜}'))
    quoted(FLOW_TEXT.futureHow)
    quoted(FLOW_TEXT.untouched)
    quoted(FLOW_TEXT.zero('{날짜}'))
    quoted(FLOW_TEXT.zeroHow)
    quoted(FLOW_TEXT.zeroUntouched)
    quoted(FLOW_TEXT.readOnly)
    quoted(FLOW_TEXT.ask(7).replace('7', '{N}'))
    quoted(FLOW_TEXT.askHelp)
    expect(section).toContain(`'${FLOW_TEXT.askRows('')}{`)
    quoted(FLOW_TEXT.checkTitle)
    quoted(FLOW_TEXT.checkTotal(7).replace('7', '{money.total}'))
    quoted(FLOW_TEXT.checkReceived(7).replace('7', '{money.received}'))
    quoted(FLOW_TEXT.checkPatients(7).replace('7', '{patients.total}'))
    quoted(FLOW_TEXT.checkHelp)
    quoted(FLOW_TEXT.kept(7).replace('7', '{K}'))
    quoted(FLOW_TEXT.undone(7).replace('7', '{N}'))
    quoted(FLOW_TEXT.undoneGone(7).replace('7', '{K}'))
    quoted(FLOW_TEXT.undoneEdited(7).replace('7', '{K}'))
    quoted(FLOW_TEXT.undoDateChanged)
    expect(section).toContain(`' 외 {K}줄'`)
    expect(FLOW_TEXT.more(7)).toBe(' 외 7줄')
    for (const label of [FLOW_TEXT.goAnyway, FLOW_TEXT.replace, FLOW_TEXT.emptyOnly, FLOW_TEXT.undo, FLOW_TEXT.last, TEXT.close]) {
      expect(section, label).toContain(`[${label}]`)
    }
    for (const [kind, { title, help }] of Object.entries(SKIP_TEXT)) {
      quoted(title)
      expect(section, kind).toContain(`'${title}' · '${help}'`)
    }
    expect(Object.keys(SKIP_TEXT)).toEqual(['notFound', 'therapist', 'locked', 'noName', 'unpicked'])
    // 오류 안내 작은 줄(5-2 머리)
    expect(DESIGN).toContain(`'${FLOW_TEXT.errUntouched('{번호}')}'`)
  })
})
