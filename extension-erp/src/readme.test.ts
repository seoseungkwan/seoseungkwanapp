// TASK-5 REQ-3706(spec erp-closing-range): 안내서 extension-erp/README.md의 '기간 채우기' 절과 '확장이 건드리지 않는 것'·판 번호 글.
// 안내서의 화면 글은 기간 안내 글(rangeView.ts RANGE_TEXT = design.md 4절, 승인된 시안 ①~⑤) 그대로여야 한다.
// 숫자·날짜 자리는 안내서에서 {이름}으로 쓴다: 화면 글 함수에 표시 숫자(901…)를 넣어 부른 뒤 그 숫자를 {이름}으로 바꿔 견준다
// TASK-9 REQ-3707: 설정 '매출로 셀 코드' 설명은 설정 화면 글(options.ts AMOUNT) 그대로이고 '이 글자 뒤에 숫자' 설명은 없다
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AMOUNT } from './options'
import { OVERLAP_TEXT } from './panel'
import { RANGE_TEXT } from './rangeView'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const README = readFileSync(path.join(ROOT, 'extension-erp', 'README.md'), 'utf8')
const MANIFEST = JSON.parse(readFileSync(path.join(ROOT, 'extension-erp', 'manifest.json'), 'utf8')) as { version: string }
const HELPER_PROPS = readFileSync(path.join(ROOT, 'helper-erp', 'Directory.Build.props'), 'utf8')

/** 화면 글 속 표시 숫자(901 …)를 안내서의 {이름}으로 */
function slots(text: string, names: Record<number, string>): string {
  return Object.entries(names).reduce((s, [mark, name]) => s.split(mark).join(name), text)
}

/** '## …기간 채우기' 절(다음 '## ' 앞까지) */
function rangeSection(): string {
  const start = README.search(/^## (?:[\d-]+\. )?기간 채우기/m)
  expect(start, "README에 '## 기간 채우기' 절이 없다").toBeGreaterThan(-1)
  const rest = README.slice(start + 3)
  const next = rest.search(/^## /m)
  return next === -1 ? README.slice(start) : README.slice(start, start + 3 + next)
}

/** 글 안의 '### …{title}…' 소절(제목 줄 빼고, 다음 '### '·'## ' 앞까지) */
function part(text: string, title: string): string {
  const head = text.split('\n').findIndex((line) => line.startsWith('### ') && line.includes(title))
  expect(head, `'### ${title}' 소절이 없다`).toBeGreaterThan(-1)
  const lines = text.split('\n').slice(head + 1)
  const end = lines.findIndex((line) => line.startsWith('### ') || line.startsWith('## '))
  return (end === -1 ? lines : lines.slice(0, end)).join('\n')
}

/** 화면 글이 따옴표('…' 또는 글 안에 '가 있으면 "…")로 그대로 있다 */
function expectQuoted(text: string, line: string) {
  expect(text.includes(`'${line}'`) || text.includes(`"${line}"`), `'${line}'`).toBe(true)
}

/** 쓰는 법 ①~⑤(굵은 단계 이름 '**① …'): 차례대로 있고, 단계마다 그 글 조각 */
function steps(): string[] {
  const how = part(rangeSection(), '쓰는 법')
  const marks = ['**①', '**②', '**③', '**④', '**⑤']
  const at = marks.map((m) => how.indexOf(m))
  for (const [i, m] of marks.entries()) expect(at[i], `쓰는 법 ${m}`).toBeGreaterThan(-1)
  for (let i = 1; i < at.length; i++) expect(at[i], `${marks[i - 1]} 다음이 ${marks[i]}`).toBeGreaterThan(at[i - 1])
  return at.map((from, i) => how.slice(from, i + 1 < at.length ? at[i + 1] : undefined))
}

describe("AC-3706.1 안내서 '기간 채우기' 절 — 쓰는 법 ①~⑤는 화면 글(RANGE_TEXT) 그대로", () => {
  it("AC-3706.1: '기간 채우기' 절에 쓰는 법 ①~⑤가 차례대로 있다(단추 · 기간 고르기 · 승인 · 도는 중 · 끝)", () => {
    const [one, two, three, four, five] = steps()
    expect(one).toContain(`[${RANGE_TEXT.button}]`)
    expect(one).toContain('[비트 값 채우기]')
    expectQuoted(two, RANGE_TEXT.pick.lead)
    expectQuoted(three, slots(RANGE_TEXT.confirm.lead('{기간}', 901), { 901: '{S}' }))
    expectQuoted(four, slots(RANGE_TEXT.running.lead(901, 902), { 901: '{S}', 902: '{k}' }))
    expectQuoted(five, slots(RANGE_TEXT.end.lead(901), { 901: '{n}' }))
  })

  it('AC-3706.1 AC-3701.2: ② 기간 고르기 — 칸 이름·안내·막는 줄 셋·길이 제한 없음([멈추기]·[이어서 하기])·[살펴보기]와 살펴보는 중 글', () => {
    const two = steps()[1]
    for (const name of [RANGE_TEXT.pick.from, RANGE_TEXT.pick.to]) expect(two).toContain(name)
    for (const line of [RANGE_TEXT.pick.help, RANGE_TEXT.pick.empty, RANGE_TEXT.pick.reversed, RANGE_TEXT.pick.future]) {
      expectQuoted(two, line)
    }
    // TASK-13: 기간 길이는 막지 않는다 — 92일 글은 없고, 길면 [멈추기]·[이어서 하기]를 쓰라고 알린다
    expect(rangeSection()).not.toMatch(/92일/)
    expect(two).toContain('기간 길이는 제한이 없')
    expect(two).toContain(`[${RANGE_TEXT.running.stop}]`)
    expect(two).toContain(`[${RANGE_TEXT.resume}]`)
    expect(two).toContain(`[${RANGE_TEXT.pick.scan}]`)
    expect(two).toContain(`[${RANGE_TEXT.close}]`)
    expectQuoted(two, RANGE_TEXT.scanning.lead)
    expectQuoted(two, slots(RANGE_TEXT.scanning.count(901, 902), { 901: '{N}', 902: '{k}' }))
    expectQuoted(two, RANGE_TEXT.scanning.help)
    expect(two).toContain(`[${RANGE_TEXT.scanning.cancel}]`)
  })

  it('AC-3706.1: ③ 한 번 승인 — 묶음 넷·경고 줄·씨암·SONO 함께 있는 진료·창 닫지 않기·[덮어쓰고 저장 시작]·채울 날 없음', () => {
    const three = steps()[2]
    const c = RANGE_TEXT.confirm
    for (const line of [
      slots(c.fresh(901), { 901: '{n}' }),
      slots(c.written(901, 902, 903, '{날짜}'), { 901: '{m}', 902: '{a}', 903: '{b}' }),
      slots(c.unloaded(901, '{날짜}'), { 901: '{u}' }),
      slots(c.zero(901, '{날짜}'), { 901: '{z}' }),
      slots(c.overwrite(901), { 901: '{m}' }),
      c.confirmedToo.trim(),
      c.saves,
      c.overlapLast(OVERLAP_TEXT.into.carm),
      slots(c.overlapAsk(901), { 901: '{K}' }),
      c.stay,
      c.none('{기간}'),
    ]) {
      expectQuoted(three, line)
    }
    for (const into of Object.values(OVERLAP_TEXT.into)) expect(three).toContain(into)
    for (const label of [...Object.values(OVERLAP_TEXT.choice), c.start, RANGE_TEXT.close]) expect(three).toContain(`[${label}]`)
  })

  it('AC-3706.1: ④ 도는 중 — 지금 날·[멈추기]·멈춘 뒤 글·[이어서 하기]', () => {
    const four = steps()[3]
    const r = RANGE_TEXT.running
    for (const line of [
      r.now('{M월 D일}'),
      r.help,
      r.stopping,
      slots(RANGE_TEXT.stopped.lead(901), { 901: '{k}' }),
      slots(RANGE_TEXT.stopped.rest(901, '{날짜}'), { 901: '{r}' }),
    ]) {
      expectQuoted(four, line)
    }
    expect(four).toContain(`[${r.stop}]`)
    expect(four).toContain(`[${RANGE_TEXT.resume}]`)
  })

  it('AC-3706.1: ⑤ 끝 — 저장한 날 없음·결과 줄(건너뛴 날 둘·저장 못 한 날)·까닭 다섯·직접 넣는 칸 줄', () => {
    const five = steps()[4]
    const res = RANGE_TEXT.result
    for (const line of [
      RANGE_TEXT.end.none,
      RANGE_TEXT.end.untouched,
      slots(res.zero(901, '{날짜}'), { 901: '{z}' }),
      slots(res.draft(901, '{날짜}'), { 901: '{d}' }),
      slots(res.failed(901), { 901: '{f}' }),
      `{M/D}: {까닭} ${res.again}`,
      ...Object.values(res.why),
    ]) {
      expectQuoted(five, line)
    }
    expect(Object.keys(res.why)).toEqual(['load', 'w1Error', 'w1Timeout', 'w2Error', 'w2Timeout'])
    expect(five).toContain(`[${RANGE_TEXT.close}]`)
  })

  it("AC-3706.1: 날짜 목록 글('확정' 표시, 10개 넘으면 '외 {k}일')을 알려 준다", () => {
    const section = rangeSection()
    expectQuoted(section, RANGE_TEXT.confirmed.trim())
    expectQuoted(section, slots(RANGE_TEXT.more(901), { 901: '{k}' }).trim())
  })
})

describe("AC-3706.1 안내서 '기간 채우기' 절 — 누르는 단추·멈추는 경우·원무 계정·도는 동안", () => {
  it("AC-3706.1: 확장이 누르는 단추는 '전체 저장'·'일일 상세 저장' 둘뿐이고, 누르지 않는 단추·바꾸지 않는 칸이 적혀 있다", () => {
    const press = part(rangeSection(), '확장이 누르는 단추')
    expect(press).toContain("업무일지 1 **'전체 저장'**")
    expect(press).toContain("업무일지 2 **'일일 상세 저장'**")
    expect(press).toContain('두 가지뿐')
    for (const word of ['상태', '특이사항', '기본단가', '중간저장', '이 항목만 저장', '초기화', '마감일지 삭제', '월 선택', '재계산', '기본단가 저장', '이벤트 추가']) {
      expect(press, word).toContain(word)
    }
    expect(press).toContain('직접 요청을 보내지 않습니다')
  })

  it('AC-3706.1 AC-3705.2: 멈추는 경우 열 가지의 화면 글이 그대로이고, [이어서 하기]는 안내 창·저장 줄·도우미 오류·마감 일자 바뀜 넷에만 있다', () => {
    const stops = part(rangeSection(), '멈추는 경우')
    const b = RANGE_TEXT.blocked
    expectQuoted(stops, slots(b.done(901, 902), { 901: '{k}', 902: '{r}' }))
    expectQuoted(stops, b.code('{번호}').trim())
    const rows = stops.split('\n').filter((line) => line.startsWith('|'))
    /** 글 안에 '가 있으면 "…"로 쓴다 */
    const quotedIn = (line: string, t: string) => line.includes(`'${t}'`) || line.includes(`"${t}"`)
    const row = (what: string) => {
      const found = rows.filter((line) => quotedIn(line, what))
      expect(found, what).toHaveLength(1)
      return found[0]
    }
    const cases: [{ what: string; how: string }, boolean][] = [
      [b.dialog, true],
      [RANGE_TEXT.todayOnly, false],
      [b.noSaveBar, true],
      [b.readOnly, false],
      [b.dateChanged, true],
      [{ what: slots(b.cellsMissing.what(901), { 901: '{n}' }), how: b.cellsMissing.how }, false],
      [b.noSaveButton, false],
      [b.overlapUnpicked, false],
      [b.unexpected, false],
    ]
    for (const [{ what, how }, resume] of cases) {
      const line = row(what)
      expect(quotedIn(line, how), how).toBe(true)
      expect(line.includes(`[${RANGE_TEXT.resume}]`), what).toBe(resume)
    }
    // 다섯째: 도우미 오류는 오류 표의 무엇이·어떻게 글 그대로 + (번호 …), 할 일 끝에 [이어서 하기]
    const helper = rows.filter((line) => line.includes('ERP 도우미 오류'))
    expect(helper).toHaveLength(1)
    expect(helper[0]).toContain('오류 표')
    expect(helper[0]).toContain(`[${RANGE_TEXT.resume}]`)
    // 표의 까닭 줄은 열(머리·구분 줄 빼고, 2026-11-13 다섯 더함)
    expect(rows.filter((line) => !/^\|\s*(?:멈춘 까닭|-)/.test(line))).toHaveLength(10)
  })

  it('AC-3706.1: 원무(오늘만) 계정은 기간 채우기를 쓸 수 없다는 글이 화면 글 그대로 있다', () => {
    const today = part(rangeSection(), '원무')
    expectQuoted(today, RANGE_TEXT.todayOnly.what)
    expectQuoted(today, RANGE_TEXT.todayOnly.how)
    expect(today).toContain('(오늘)')
  })

  it('AC-3706.1: 도는 동안 이 크롬 창을 닫거나 다른 화면으로 옮기지 않기', () => {
    const during = part(rangeSection(), '도는 동안')
    expectQuoted(during, RANGE_TEXT.confirm.stay)
    expect(during).toContain('[기간 채우기]·[비트 값 채우기]·[지난 결과]')
  })
})

describe("AC-3706.1 안내서 '확장이 건드리지 않는 것'과 판 번호", () => {
  it("AC-3706.1: '확장이 건드리지 않는 것'은 '[비트 값 채우기]는 저장 단추를 누르지 않는다, [기간 채우기]는 전체 저장·일일 상세 저장만 누른다'이고 옛 문장은 없다", () => {
    const keep = part(README, '확장이 건드리지 않는 것')
    expect(keep).toContain('[비트 값 채우기]는 저장 단추를 누르지 않습니다.')
    expect(keep).toContain("[기간 채우기]는 '전체 저장'·'일일 상세 저장'만 누릅니다")
    for (const word of ['상태 선택', '중간저장', '초기화', '삭제 단추', '기본단가', "'직접 넣는 칸'"]) expect(keep, word).toContain(word)
    // 옛 문장: 저장 단추도 건드리지 않는다고 했던 글
    expect(README).not.toContain('저장·중간저장·초기화·삭제 단추')
    expect(README).not.toContain('확장은 저장 단추를 누르지 않습니다')
  })

  it('AC-3706.1: 판 번호 글은 확장 0.3.0 ↔ ERP 도우미 0.2.0(그대로)이고, 둘이 같은 판이라는 옛 글은 없다', () => {
    const helper = /<Version>([^<]+)<\/Version>/.exec(HELPER_PROPS)?.[1]
    expect(MANIFEST.version).toBe('0.3.0')
    expect(helper).toBe('0.2.0')
    expect(README).toContain(`확장 ${MANIFEST.version} ↔ ERP 도우미 ${helper}`)
    expect(README).toContain(`\`version\`(지금 ${MANIFEST.version})`)
    for (const old of ['지금 둘 다 0.2.0', '확장 0.2.0', '(지금 0.2.0)', '같은 판끼리', '판 번호가 같은 것끼리']) {
      expect(README, old).not.toContain(old)
    }
  })
})

/** '## {title}…' 절(제목 줄 빼고, 다음 '## ' 앞까지) */
function chapter(title: string): string {
  const lines = README.split('\n')
  const head = lines.findIndex((line) => line.startsWith(`## ${title}`))
  expect(head, `'## ${title}' 절이 없다`).toBeGreaterThan(-1)
  const rest = lines.slice(head + 1)
  const end = rest.findIndex((line) => line.startsWith('## '))
  return (end === -1 ? rest : rest.slice(0, end)).join('\n')
}

describe("AC-3707.3 안내서 '매출로 셀 코드' — 화면 글(options.ts AMOUNT) 그대로, 셀 코드만 더함", () => {
  it("AC-3707.1 AC-3707.3: 4-2 소절의 '매출로 셀 코드' 설명은 화면 글 그대로이고 '셀 코드'는 찾아 하나씩 더한다(20개까지)", () => {
    const cell = part(README, '4-2.')
    expect(cell).toContain(`**'${AMOUNT.title}'**`)
    expectQuoted(cell, AMOUNT.about('{이름}'))
    expect(cell).toContain(`**'${AMOUNT.codes}'**`)
    expect(cell).toContain('하나씩 더합니다(20개까지)')
    expect(cell).toContain('**[×]**')
    expectQuoted(cell, AMOUNT.empty)
  })

  it("AC-3707.3: '이 글자 뒤에 숫자'·앞글자 더하기 설명이 어디에도 없다", () => {
    for (const old of ['이 글자 뒤에 숫자', '앞글자는 바로 뒤가 숫자인 코드만', 'LAYLA', '더 셀 코드', '바로 뒤가 숫자인 코드', '5개까지, 대문자로']) {
      expect(README, old).not.toContain(old)
    }
  })

  it('AC-3707.2 AC-3707.3: 처음 값 표의 씨암·SONO 줄은 셀 코드 없음이고 앞글자 LA가 없다', () => {
    for (const name of ['씨암', 'SONO']) {
      const line = README.split('\n').find((l) => l.startsWith(`| ${name} |`))
      expect(line, name).toBeDefined()
      expect(line, name).toContain('셀 코드 없음')
      expect(line, name).not.toContain('LA')
      expect(line, name).not.toContain('앞글자')
    }
  })

  it("AC-3707.3: '새 판으로 바꾸기'에 새 판으로 바꾼 뒤 씨암·SONO 셀 코드를 확인하라는 문장이 있고, 확장 판 번호는 0.3.0 그대로다", () => {
    const update = chapter('7. 새 판으로 바꾸기')
    expect(update).toContain("씨암·SONO **'셀 코드'**를 꼭 확인합니다")
    expect(update).toContain('직접 더한 셀 코드만 셉니다')
    expect(update).toContain('줄어듭니다')
    expect(part(README, '4-2.')).toContain("'7. 새 판으로 바꾸기'")
    expect(MANIFEST.version).toBe('0.3.0')
  })
})
