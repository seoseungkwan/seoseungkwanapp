// spec erp-copy-list TASK-1 AC-3901.7: 새 화면 글은 listTypes.ts의 LIST_TEXT·WHY_TEXT 한 곳에 있고 승인 시안 index.html 글자와 같다.
// - 고정 글은 시안 index.html 원문(스크립트 포함, 글자 참조는 풀어서)에 글자 그대로 있다
// - 함수 글은 시안을 jsdom으로 그려(스크립트 실행, design.md 7절 끝 '시안 맞춤 시험' 표) 실제로 나온 글과 견준다. 빈칸은 한 칸으로 줄여 본다
// - notes.md의 {…} 꼴 글과는 견주지 않는다. 시안에 없는 꼴(warn·xlsxZero)은 값으로만 본다
// - 지금 확장 글(TEXT·FLOW_TEXT·RANGE_TEXT·SKIP_TEXT·OVERLAP_TEXT·오류 글)은 다시 적지 않는다
// 목록 모양 타입·날짜 글(shortDay·dayHead·isSunday)도 여기서 본다(design.md 4절). 자료는 시험 도우미의 가짜 숫자뿐이다
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM, VirtualConsole } from 'jsdom'
import { afterEach, describe, expect, it } from 'vitest'
import { sampleDay, settingsAll } from '../../extension-erp/src/__tests__/erpPage'
import { HELD_SALES, planCells } from '../../extension-erp/src/cells'
import { ERRORS, OTHER } from '../../extension-erp/src/errors'
import { FLOW_TEXT, OVERLAP_TEXT, SKIP_TEXT, TEXT } from '../../extension-erp/src/panel'
import { RANGE_TEXT } from '../../extension-erp/src/rangeView'
import { GROUP_NAMES } from '../../extension-erp/src/types'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const MOCK = path.join(ROOT, 'docs', 'mockups', 'erp-copy-list', 'index.html')

// listTypes.ts가 없을 때 파일 전체가 아니라 그 시험만 실패하게 시험 안에서 불러온다
const load = () => import('./listTypes')

/** 빈칸을 한 칸으로 줄이고 앞뒤를 뗀다 */
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim()

/** 시안 원문(글자 참조를 푼 것) */
function mockSource(): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return readFileSync(MOCK, 'utf8').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] === '#') return String.fromCodePoint(ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : Number(ref.slice(1)))
    return named[ref.toLowerCase()] ?? whole
  })
}

const opened: JSDOM[] = []
afterEach(() => {
  for (const dom of opened.splice(0)) dom.window.close()
})

/** 시안을 주소 끝 상태(?s=…)로 그린다. 시안 스크립트 오류가 있으면 실패 */
function renderMock(query: string): Document {
  const errors: string[] = []
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', (error: Error) => errors.push(error.message))
  const dom = new JSDOM(readFileSync(MOCK, 'utf8'), {
    runScripts: 'dangerously',
    url: `http://mock.test/index.html?${query}`,
    virtualConsole,
  })
  opened.push(dom)
  expect(errors, `시안 스크립트 오류(${query})`).toEqual([])
  return dom.window.document
}

function must<T extends Element>(doc: Document | Element, selector: string): T {
  const found = doc.querySelector<T>(selector)
  if (!found) throw new Error(`시안에서 ${selector}를 찾지 못했다`)
  return found
}

/** 값 안의 글(객체·배열 안까지, 함수는 빼고) */
function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringsOf)
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(stringsOf)
  return []
}

describe('AC-3901.7 LIST_TEXT·WHY_TEXT 고정 글은 시안 index.html 원문에 글자 그대로 있다', () => {
  it('AC-3901.7: LIST_TEXT의 고정 글(함수 빼고, 시안에 없는 꼴 xlsxZero 빼고)이 모두 시안 원문에 있다', async () => {
    const { LIST_TEXT } = await load()
    const source = mockSource()
    const { xlsxZero, ...rest } = LIST_TEXT
    void xlsxZero
    const texts = stringsOf(rest)
    expect(texts.length).toBeGreaterThan(20)
    for (const text of texts) expect(source, text).toContain(text)
  })

  it('AC-3901.7: 고정 글 값이 시안 글자 그대로다(머리·단추·안내·표·쪽지·맨 아래 줄)', async () => {
    const { LIST_TEXT } = await load()
    expect(LIST_TEXT.title).toBe('ERP 마감일지 입력 목록')
    expect(LIST_TEXT.make).toBe('목록 만들기')
    expect(LIST_TEXT.xlsx).toBe('엑셀로 받기')
    expect(LIST_TEXT.hint).toEqual({
      lead: '기간을 고르고 [목록 만들기]를 눌러 주세요.',
      body: '날마다 비트 숫자를 세어, [비트 값 채우기]가 채우는 ERP 칸 차례대로 표를 만들어요. 줄은 ERP 칸, 열은 날짜예요.',
      copy: '숫자 칸을 누르면 복사돼요. ERP 칸에 붙여 넣어 주세요.',
    })
    expect(LIST_TEXT.settingsOpened).toBe('설정 화면을 새 탭으로 열었어요.')
    expect(LIST_TEXT.sumHelp).toBe('숫자 칸을 누르면 복사돼요. ERP 칸에 붙여 넣어 주세요. 빈 칸은 아래 까닭을 보고 직접 넣어 주세요.')
    expect(LIST_TEXT.slide).toBe('표를 옆으로 밀면 다른 날짜가 보여요. 항목 칸은 왼쪽에 그대로 있어요.')
    expect(LIST_TEXT.head).toBe('항목')
    expect(LIST_TEXT.zero).toBe('진료 0건')
    expect(LIST_TEXT.copyTitle).toBe('누르면 복사돼요')
    expect([LIST_TEXT.journal1, LIST_TEXT.journal2, LIST_TEXT.ops, LIST_TEXT.salesSub]).toEqual(['업무일지 1', '업무일지 2', '운영 지표', '금액(원)'])
    expect(LIST_TEXT.legend).toBe('빈 칸 까닭')
    expect(LIST_TEXT.copied).toBe('복사했어요')
    expect(LIST_TEXT.copyFailed).toBe('복사하지 못했어요. 다시 눌러 주세요.')
    expect(LIST_TEXT.saved).toBe('엑셀 파일을 받았어요')
    expect(LIST_TEXT.foot).toBe(
      '환자 이름 · 차트번호는 이 PC의 도우미 밖으로 나가지 않아요. 이 화면은 ERP를 건드리지 않아요. 숫자는 직접 붙여 넣고, 저장은 ERP에서 직접 눌러요.',
    )
    expect([...LIST_TEXT.weekdays]).toEqual(['일', '월', '화', '수', '목', '금', '토'])
  })

  it('AC-3901.7: 시안에 없는 꼴은 값으로 본다 — warn은 {M/D}: {경고 글}, xlsxZero는 화면 진료 0건 글 앞에 한 칸', async () => {
    const { LIST_TEXT } = await load()
    expect(LIST_TEXT.warn('11/3', '환불 33,000원이 있어요. 금액을 확인해 주세요.')).toBe('11/3: 환불 33,000원이 있어요. 금액을 확인해 주세요.')
    expect(LIST_TEXT.xlsxZero).toBe(' 진료 0건')
    expect(LIST_TEXT.xlsxZero).toBe(` ${LIST_TEXT.zero}`)
  })

  it('AC-3901.7: WHY_TEXT 꼬리표·칸 작은 글·긴 글이 시안 글자 그대로이고, noName·held 긴 글은 지금 글(SKIP_TEXT·TEXT.held)을 쓴다', async () => {
    const { WHY_TEXT, WHY_ORDER } = await load()
    expect([...WHY_ORDER]).toEqual(['unpicked', 'unknown', 'held', 'noName'])
    expect(Object.keys(WHY_TEXT).sort()).toEqual([...WHY_ORDER].sort())
    expect(WHY_TEXT.unpicked).toEqual({
      tag: '코드를 고르지 않음',
      cell: '코드 안 고름',
      help: '설정에서 코드를 고르지 않은 항목이라 비워 두었어요. 직접 넣거나 [설정 열기]에서 코드를 고른 뒤 목록을 다시 만들어 주세요.',
    })
    expect(WHY_TEXT.unknown).toEqual({ tag: '비트로 셀 수 없음', cell: '셀 수 없음', help: '비트로 셀 수 없어 비워 두었어요. 직접 넣어 주세요.' })
    expect({ tag: WHY_TEXT.held.tag, cell: WHY_TEXT.held.cell }).toEqual({ tag: '보류 중', cell: '보류' })
    expect(WHY_TEXT.held.help).toBe(TEXT.held(HELD_SALES.map((key) => GROUP_NAMES[key])))
    expect({ tag: WHY_TEXT.noName.tag, cell: WHY_TEXT.noName.cell }).toEqual({ tag: 'ERP 줄 이름 없음', cell: '줄 이름 없음' })
    expect(WHY_TEXT.noName.help).toBe(SKIP_TEXT.noName.help)
    const source = mockSource()
    for (const why of WHY_ORDER) {
      expect(source, why).toContain(WHY_TEXT[why].tag)
      expect(source, why).toContain(WHY_TEXT[why].cell)
    }
    for (const why of ['unpicked', 'unknown', 'noName'] as const) expect(source, why).toContain(WHY_TEXT[why].help)
  })

  it('AC-3901.7: 시안 ③의 빈 칸 까닭 상자가 WHY_ORDER 차례로 WHY_TEXT 꼬리표·긴 글을 보인다(시안의 보류 묶음은 관절조영)', async () => {
    const { WHY_TEXT, WHY_ORDER } = await load()
    const items = [...renderMock('s=ready').querySelectorAll('.legend li')]
    expect(items.map((li) => flat(must(li, '.tag').textContent))).toEqual(WHY_ORDER.map((why) => WHY_TEXT[why].tag))
    const helps = items.map((li) => flat(must(li, 'span:not(.tag)').textContent))
    expect(helps).toEqual([WHY_TEXT.unpicked.help, WHY_TEXT.unknown.help, TEXT.held([GROUP_NAMES.arthro]), WHY_TEXT.noName.help])
  })

  it('AC-3901.7: TOAST_MS는 시안 쪽지 시간 1800ms다', async () => {
    const { TOAST_MS } = await load()
    expect(TOAST_MS).toBe(1800)
    expect(mockSource()).toContain(`toast.hidden = true }, ${TOAST_MS})`)
  })
})

describe('AC-3901.7 지금 확장 글은 다시 적지 않는다', () => {
  it('AC-3901.7: LIST_TEXT·WHY_TEXT의 글 가운데 지금 모듈 글(TEXT·FLOW_TEXT·RANGE_TEXT·SKIP_TEXT·OVERLAP_TEXT·오류 글)과 같은 글이 없다(noName·held 긴 글은 그 상수를 가리킴)', async () => {
    const { LIST_TEXT, WHY_TEXT } = await load()
    const existing = new Set([
      ...stringsOf(TEXT),
      ...stringsOf(FLOW_TEXT),
      ...stringsOf(RANGE_TEXT),
      ...stringsOf(SKIP_TEXT),
      ...stringsOf(OVERLAP_TEXT),
      ...stringsOf(ERRORS),
      ...stringsOf(OTHER),
    ])
    // 지금 글이 실제로 모였는지(빈 모음과 견주지 않게)
    for (const known of [TEXT.openSettings, TEXT.reading, TEXT.first, RANGE_TEXT.pick.from, RANGE_TEXT.pick.future, RANGE_TEXT.scanning.cancel]) {
      expect(existing.has(known), known).toBe(true)
    }
    for (const text of stringsOf(LIST_TEXT)) expect(existing.has(text), text).toBe(false)
    const { noName, held, ...fresh } = WHY_TEXT
    for (const text of [...stringsOf(fresh), noName.tag, noName.cell, held.tag, held.cell]) expect(existing.has(text), text).toBe(false)
  })
})

describe('AC-3901.7 함수 글은 시안을 그린 글과 같다(design.md 7절 시안 맞춤 표)', () => {
  it('AC-3901.7: ?s=ready 목록 위 줄 — period(굵게)와 period + size(3, 131)', async () => {
    const { LIST_TEXT } = await load()
    const doc = renderMock('s=ready')
    const line = must(doc, '.sum p')
    expect(flat(must(line, 'b').textContent)).toBe(LIST_TEXT.period('2026-11-01', '2026-11-03'))
    expect(flat(line.textContent)).toBe(LIST_TEXT.period('2026-11-01', '2026-11-03') + LIST_TEXT.size(3, 131))
    expect(LIST_TEXT.period('2026-11-01', '2026-11-03') + LIST_TEXT.size(3, 131)).toBe('2026-11-01 ~ 2026-11-03 · 3일 · 날마다 131칸')
    expect(flat(must(doc, '.sum .small').textContent)).toBe(LIST_TEXT.sumHelp)
    expect(flat(must(doc, '#slide').textContent)).toBe(LIST_TEXT.slide)
  })

  it('AC-3901.7: ?s=ready 만든 때 — madeAt(그린 시각)이 시안 글과 같고 꼴은 YYYY-MM-DD HH:MM', async () => {
    const { LIST_TEXT } = await load()
    const text = flat(must(renderMock('s=ready'), '.sum .made').textContent)
    const when = /(\d{4}-\d{2}-\d{2} \d{2}:\d{2})$/.exec(text)?.[1]
    expect(when, text).toBeDefined()
    expect(LIST_TEXT.madeAt(when as string)).toBe(text)
    expect(text).toMatch(/^목록을 만든 때 \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  it('AC-3901.7: ?s=ready 뒤 [엑셀로 받기] — 쪽지 saved + fileName(시작일, 끝일)', async () => {
    const { LIST_TEXT } = await load()
    const doc = renderMock('s=ready')
    must<HTMLButtonElement>(doc, '#xlsx').click()
    expect(flat(must(doc, '#toast b').textContent)).toBe(LIST_TEXT.saved)
    expect(flat(must(doc, '#toast span').textContent)).toBe(LIST_TEXT.fileName('2026-11-01', '2026-11-03'))
    expect(LIST_TEXT.fileName('2026-11-01', '2026-11-03')).toBe('ERP마감일지_입력목록_2026-11-01_2026-11-03.xlsx')
  })

  it('AC-3901.7: ?s=ready 뒤 [설정 열기] — 쪽지 settingsOpened(꼬리 없음)', async () => {
    const { LIST_TEXT } = await load()
    const doc = renderMock('s=ready')
    must<HTMLButtonElement>(doc, '#openSettings').click()
    expect(flat(must(doc, '#toast b').textContent)).toBe(LIST_TEXT.settingsOpened)
    expect(doc.querySelectorAll('#toast span')).toHaveLength(0)
  })

  it("AC-3901.7: ?s=copied — 쪽지 copied + copyTail('11/2', '치료현황', '도수상담', null, '4')", async () => {
    const { LIST_TEXT } = await load()
    const doc = renderMock('s=copied')
    expect(flat(must(doc, '#toast b').textContent)).toBe(LIST_TEXT.copied)
    const tail = LIST_TEXT.copyTail('11/2', '치료현황', '도수상담', null, '4')
    expect(tail).toBe('11/2 · 치료현황 도수상담 · 4')
    expect(flat(must(doc, '#toast span').textContent)).toBe(tail)
  })

  it("AC-3901.7: ?s=ready 열 있는 줄 — data-k '57|2026-11-02' 단추의 data-l · data-v가 copyTail('11/2', '치료별 건수', '씨암(주사)', '신환', '4')", async () => {
    const { LIST_TEXT } = await load()
    const button = must<HTMLButtonElement>(renderMock('s=ready'), '[data-k="57|2026-11-02"]')
    const tail = LIST_TEXT.copyTail('11/2', '치료별 건수', '씨암(주사)', '신환', '4')
    expect(tail).toBe('11/2 · 치료별 건수 씨암(주사) 신환 · 4')
    expect(`${button.dataset.l} · ${button.dataset.v}`).toBe(tail)
    expect(button.title).toBe(LIST_TEXT.copyTitle)
  })

  it.each([
    ['s=error', 'E-HELPER-MISSING'],
    ['s=error&e=unregistered', 'E-BIT-NOT-REGISTERED'],
  ])('AC-3901.7: ?%s — 오류 작은 줄이 failed(%s)', async (query, code) => {
    const { LIST_TEXT } = await load()
    expect(flat(must(renderMock(query), '#stage .small').textContent)).toBe(LIST_TEXT.failed(code))
    expect(LIST_TEXT.failed(code)).toBe(`목록을 만들지 못했어요. (번호 ${code})`)
  })

  it('AC-3901.7: ?s=ready 날짜 머리 — dayHead(+ zero), 일요일만 .sun, 진료 0건 머리 title = FLOW_TEXT.zero(날짜), 첫 칸 head', async () => {
    const { LIST_TEXT, dayHead, isSunday } = await load()
    const heads = [...renderMock('s=ready').querySelectorAll<HTMLTableCellElement>('thead th')]
    expect(flat(heads[0].textContent)).toBe(LIST_TEXT.head)
    const dates = ['2026-11-01', '2026-11-02', '2026-11-03']
    expect(heads.slice(1)).toHaveLength(dates.length)
    dates.forEach((date, i) => {
      const th = heads[i + 1]
      const zero = th.querySelector('.zt') !== null
      expect(flat(th.textContent), date).toBe(dayHead(date) + (zero ? LIST_TEXT.zero : ''))
      expect(th.classList.contains('sun'), date).toBe(isSunday(date))
      expect(th.title, date).toBe(zero ? FLOW_TEXT.zero(date) : '')
    })
    expect(flat(heads[1].textContent)).toBe('11/1 (일)진료 0건')
  })

  it('AC-3901.7: ?s=ready 머리 줄 — 업무일지 1·2(journal1·2), 업무일지 1 상자는 SCREEN_BOXES 차례, 운영 지표(ops), 치료별 매출 + salesSub', async () => {
    const { LIST_TEXT, SCREEN_BOXES } = await load()
    const doc = renderMock('s=ready')
    const rows = [...doc.querySelectorAll('tr.s1, tr.s2')].map((tr) => ({ s1: tr.classList.contains('s1'), text: flat(must(tr, 'th').textContent) }))
    const j2 = rows.findIndex((r) => r.s1 && r.text === LIST_TEXT.journal2)
    expect(rows[0]).toEqual({ s1: true, text: LIST_TEXT.journal1 })
    expect(j2).toBeGreaterThan(0)
    expect(rows.slice(1, j2).map((r) => r.text)).toEqual([...SCREEN_BOXES])
    expect(rows.map((r) => r.text)).toContain(LIST_TEXT.ops)
    expect(flat(must(doc, 'tr.s2 .sub').textContent)).toBe(LIST_TEXT.salesSub)
  })
})

describe('AC-3901.7 목록 모양 상수(design.md 4절)', () => {
  it('AC-3901.7: SCREEN_BOXES는 ERP 화면 차례이고, planCells(sampleDay(), settingsAll())의 업무일지 1 상자 이름과 빠지거나 남는 것 없이 같다', async () => {
    const { SCREEN_BOXES } = await load()
    expect([...SCREEN_BOXES]).toEqual(['진료 · 치료현황', '외래 수입', '입원수입', '환자현황'])
    const boxes = new Set(planCells(sampleDay(), settingsAll()).flatMap((p) => ('box' in p.where ? [p.where.box] : [])))
    expect([...boxes].sort()).toEqual([...SCREEN_BOXES].sort())
  })

  it('AC-3901.7: SHORT_SECTION은 상자·묶음 머리 → 쪽지 짧은 이름 셋이고, 머리 이름은 planCells 칸 자리 글자다', async () => {
    const { SHORT_SECTION } = await load()
    expect(SHORT_SECTION).toEqual({
      '진료 · 치료현황': '치료현황',
      '치료별 신환/90일초진/재진 건수': '치료별 건수',
      '연령별 신환/90일초진/재진': '연령별',
    })
    const heads = new Set(planCells(sampleDay(), settingsAll()).flatMap((p) => ('box' in p.where ? [p.where.box] : 'card' in p.where ? [p.where.card] : [])))
    for (const head of Object.keys(SHORT_SECTION)) expect(heads.has(head), head).toBe(true)
  })
})

describe('AC-3901.7 날짜 글(shortDay·dayHead·isSunday)', () => {
  it("AC-3901.7: shortDay('2026-11-02') = '11/2', 앞 0 없음", async () => {
    const { shortDay } = await load()
    expect(shortDay('2026-11-02')).toBe('11/2')
    expect(shortDay('2026-01-09')).toBe('1/9')
    expect(shortDay('2026-12-31')).toBe('12/31')
  })

  it("AC-3901.7: dayHead는 '{M/D} ({요일})'(LIST_TEXT.weekdays), 2026-11-01은 '11/1 (일)'", async () => {
    const { dayHead } = await load()
    expect(['01', '02', '03', '04', '05', '06', '07'].map((d) => dayHead(`2026-11-${d}`))).toEqual([
      '11/1 (일)',
      '11/2 (월)',
      '11/3 (화)',
      '11/4 (수)',
      '11/5 (목)',
      '11/6 (금)',
      '11/7 (토)',
    ])
    expect(dayHead('2027-01-03')).toBe('1/3 (일)')
  })

  it('AC-3901.7: isSunday는 일요일만 참이다', async () => {
    const { isSunday } = await load()
    expect(isSunday('2026-11-01')).toBe(true)
    expect(isSunday('2026-11-08')).toBe(true)
    expect(isSunday('2027-01-03')).toBe(true)
    for (const date of ['2026-11-02', '2026-11-03', '2026-11-06', '2026-11-07', '2026-12-31']) expect(isSunday(date), date).toBe(false)
  })

  it('AC-3901.7: 이 PC 시간대(TZ)를 바꿔도 같은 값이다(달력 날짜로 셈)', async () => {
    const { shortDay, dayHead, isSunday } = await load()
    const before = process.env.TZ
    try {
      for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Seoul']) {
        process.env.TZ = tz
        expect(dayHead('2026-11-01'), tz).toBe('11/1 (일)')
        expect(dayHead('2026-11-07'), tz).toBe('11/7 (토)')
        expect(isSunday('2026-11-01'), tz).toBe(true)
        expect(isSunday('2026-11-02'), tz).toBe(false)
        expect(shortDay('2026-11-02'), tz).toBe('11/2')
      }
    } finally {
      process.env.TZ = before
    }
  })
})
