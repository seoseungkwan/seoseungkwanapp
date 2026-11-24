// TASK-5 REQ-3706(spec erp-closing-range): 안내서 extension-erp/README.md의 '기간 채우기' 절과 '확장이 건드리지 않는 것'·판 번호 글.
// 안내서의 화면 글은 기간 안내 글(rangeView.ts RANGE_TEXT = design.md 4절, 승인된 시안 ①~⑤) 그대로여야 한다.
// 숫자·날짜 자리는 안내서에서 {이름}으로 쓴다: 화면 글 함수에 표시 숫자(901…)를 넣어 부른 뒤 그 숫자를 {이름}으로 바꿔 견준다
// TASK-9 REQ-3707: 설정 '매출로 셀 코드' 설명은 설정 화면 글(options.ts AMOUNT) 그대로이고 '이 글자 뒤에 숫자' 설명은 없다
// TASK-11 REQ-3708·REQ-3709: '셀 코드' 찾기 글(options.ts FIND)과 '읽지 않을 처방' 설명(options.ts EXCLUDE)도 화면 글 그대로다
// TASK-15 REQ-3710: 함께 있는 진료 설명은 '돈이 두 번 셀 때만 묻는다' 문장 그대로다
// TASK-17 REQ-3711: 그 문장은 '그날 함께 있는 진료에 그 코드 처방이 실제로 있을 때만 묻는다'(AC-3711.4)로 바뀌었다
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AMOUNT, EXCLUDE, FIND } from './options'
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

  // spec erp-closing-range AC-3708.4(TASK-12): ERP 도우미가 0.2.0에서 0.3.0으로 바뀌어(closing.findCodes·읽지 않을 처방 규칙) 짝 문장도 바뀐다
  // spec erp-uisarang AC-4216.1(design.md 12-4, TASK-16): 의사랑판으로 확장·ERP 도우미 둘 다 0.4.0이 되어 짝 문장도 바뀐다
  it('AC-3706.1 AC-3708.4 AC-4216.1: 판 번호 글은 확장 0.4.0 ↔ ERP 도우미 0.4.0이고, 둘이 같은 판이라는 옛 글·도우미는 0.2.0 그대로라는 옛 글·0.3.0 짝 글은 없다', () => {
    const helper = /<Version>([^<]+)<\/Version>/.exec(HELPER_PROPS)?.[1]
    expect(MANIFEST.version).toBe('0.4.0')
    expect(helper).toBe('0.4.0')
    expect(README).toContain(`확장 ${MANIFEST.version} ↔ ERP 도우미 ${helper}`)
    expect(README).toContain(`\`version\`(지금 ${MANIFEST.version})`)
    for (const old of [
      '지금 둘 다 0.2.0', '확장 0.2.0', '(지금 0.2.0)', '같은 판끼리', '판 번호가 같은 것끼리',
      '↔ ERP 도우미 0.2.0', 'ERP 도우미는 바뀌지 않았습니다', 'ERP 도우미 0.2.0은 그대로', '확장만 바뀌어', '0.2.0 그대로',
      '확장 0.3.0 ↔', '↔ ERP 도우미 0.3.0', '(지금 0.3.0)',
    ]) {
      expect(README, old).not.toContain(old)
    }
  })

  it("AC-3708.4: '7. 새 판으로 바꾸기'의 0.2.0 → 0.3.0 글은 ERP 도우미도 다시 설치해야 '등록된 코드 전부' 찾기·읽지 않을 처방 규칙이 된다고 하고, 도우미 0.2.0이어도 나머지는 그대로라고 적는다", () => {
    const update = chapter('7. 새 판으로 바꾸기')
    expect(update).toContain('**이 확장을 판 0.2.0에서 0.3.0으로 바꿀 때**')
    expect(update).toContain('ERP 도우미도 0.3.0으로 바뀌었습니다')
    expect(update).toContain('아래 1·2·3을 모두 합니다')
    expect(update).toContain("ERP 도우미를 다시 설치해야 설정 화면 '셀 코드' 찾기가 **비트에 등록된 코드 전부**에서 찾고, **'읽지 않을 처방'** 규칙이 셈에 들어갑니다")
    expect(update).toContain('ERP 도우미 0.2.0이어도 나머지는 그대로 됩니다')
    expect(update).toContain("**'ERP 도우미가 예전 판이에요.'**")
    expect(update).not.toContain('아래 2·3만 합니다')
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

  // spec erp-uisarang AC-4216.1(TASK-16): 확장 판 번호는 0.4.0으로 바뀐다(이 시험의 나머지 기대값은 그대로)
  it("AC-3707.3 AC-4216.1: '새 판으로 바꾸기'에 새 판으로 바꾼 뒤 씨암·SONO 셀 코드를 확인하라는 문장이 있고, 확장 판 번호는 0.4.0이다", () => {
    const update = chapter('7. 새 판으로 바꾸기')
    expect(update).toContain("씨암·SONO **'셀 코드'**를 꼭 확인합니다")
    expect(update).toContain('직접 더한 셀 코드만 셉니다')
    expect(update).toContain('줄어듭니다')
    expect(part(README, '4-2.')).toContain("'7. 새 판으로 바꾸기'")
    expect(MANIFEST.version).toBe('0.4.0')
  })

  it("AC-4216.1: '7. 새 판으로 바꾸기'에 0.3.0 → 0.4.0 글(의사랑 의원 판 · ERP 도우미도 0.4.0 · 1·2·3 모두 · 비트 의원은 그대로)이 0.2.0 → 0.3.0 글 앞에 있다", () => {
    const update = chapter('7. 새 판으로 바꾸기')
    const line = update.split('\n').find((l) => l.startsWith('**이 확장을 판 0.3.0에서 0.4.0으로 바꿀 때**'))
    expect(line).toBeDefined()
    expect(line).toContain("'의사랑 의원'")
    expect(line).toContain('ERP 도우미도 0.4.0으로 바뀌었습니다')
    expect(line).toContain('아래 1·2·3을 모두 합니다')
    expect(line).toContain('비트 의원은')
    expect(update.indexOf('0.3.0에서 0.4.0으로')).toBeLessThan(update.indexOf('0.2.0에서 0.3.0으로'))
  })
})

describe("AC-3709.1 안내서 '읽지 않을 처방' — 화면 글(options.ts EXCLUDE) 그대로", () => {
  it('AC-3709.1 AC-3709.4: 4-6 소절에 안내 글·칸 이름·빼는 때 둘·[규칙 더하기]·아래 글·규칙 조각 글·빈 글·까닭 넷이 화면 글 그대로 있다', () => {
    const sec = part(README, '4-6.')
    expect(sec).toContain(`**'${EXCLUDE.title}'**`)
    expectQuoted(sec, EXCLUDE.about('{이름}'))
    expectQuoted(sec, EXCLUDE.empty)
    expectQuoted(sec, EXCLUDE.hint)
    for (const label of [EXCLUDE.code, EXCLUDE.with, EXCLUDE.when, EXCLUDE.any, EXCLUDE.all]) expect(sec, label).toContain(`**'${label}'**`)
    expect(sec).toContain(`**[${EXCLUDE.add}]**`)
    expectQuoted(sec, EXCLUDE.rule('{코드}', ['{같이 있을 처방}'], false))
    for (const when of [EXCLUDE.whenOne, EXCLUDE.whenAny, EXCLUDE.whenAll]) expect(sec, when).toContain(`'${when}'`)
    for (const line of Object.values(EXCLUDE.problems)) expectQuoted(sec, line)
    expect(Object.keys(EXCLUDE.problems)).toEqual(['noCode', 'noWith', 'same', 'full'])
  })

  it('AC-3709.1 AC-3709.4: 넣는 줄(주사1회환자·물리치료내원 없음)·담는 중인 것은 저장 안 됨·코드를 빼면 규칙도 빠짐·[처음 값으로]가 적혀 있다', () => {
    const sec = part(README, '4-6.')
    for (const name of ['씨암', 'SONO', '관절조영', '도수', '충격파', '물리치료', '기타1~4', '도수상담', '리푸스', '손발톱케어', 'CT', '수술', 'ESWT Standard', 'ESWT Radial']) {
      expect(sec, name).toContain(name)
    }
    expect(sec).toContain('주사1회환자·물리치료내원 줄에는 없습니다')
    expect(sec).toContain('저장되지 않습니다')
    expect(sec).toContain("그 코드가 '이 처방'인 규칙도 빠집니다")
    expect(sec).toContain('**[처음 값으로]**는 규칙도 비웁니다')
  })

  it("AC-3708.2 AC-3708.3: 4-2 '셀 코드' 찾기 설명에 도우미 찾기 글('찾는 중…'·'등록된 코드에 없어요.'·'더함')과 옛 도우미 안내 줄이 화면 글 그대로 있다", () => {
    const cell = part(README, '4-2.')
    for (const line of [FIND.waiting, FIND.none, FIND.added, FIND.old]) expectQuoted(cell, line)
    expect(cell).toContain('두 글자 이상')
  })
})

// TASK-17 REQ-3711: AC-3710.3 문장 시험을 AC-3711.4 문장으로 바꿨다(기대값 바뀜 까닭: 그날 실제로 두 번 센 돈이 있을 때만 묻게 됨)
describe('AC-3711.4 안내서 함께 있는 진료 — 그날 실제로 두 번 센 돈이 있을 때만 묻는다', () => {
  const SENTENCE =
    '씨암·SONO 셀 코드에 같은 코드가 있고, 그날 함께 있는 진료에 그 코드 처방이 실제로 있을 때만(돈이 두 줄에 두 번 들어갈 때만) 어디에 넣을지 물어요. ' +
    '아니면 묻지 않고 각 줄에 자기 셀 코드 금액만 넣어요. ERP 도우미가 예전 것이면 같은 코드가 있을 때 늘 물으니, 이번 ERP 도우미를 다시 깔아 주세요.'
  const RANGE_SENTENCE = "그 기간에 돈이 두 번 들어갈 함께 있는 진료가 있는 날이 있으면('4-2')"

  it("AC-3711.4: 4-2 소절의 함께 있는 진료 설명이 정한 문장 그대로이고, 'AC-3710.3 문장'·'함께 있으면 늘 묻는다'는 옛 설명은 없다", () => {
    expect(part(README, '4-2.')).toContain(SENTENCE)
    expect(README).not.toContain('씨암·SONO 셀 코드가 서로 다르면 묻지 않고 각 줄에 자기 셀 코드 금액만 넣어요.')
    expect(README).not.toContain('같은 코드를 씨암·SONO 둘 다에 넣었을 때만 어디에 넣을지 물어요.')
    expect(README).not.toContain('표시 코드가 함께 있으면, 채울 때 어디에 넣을지 묻습니다')
  })

  it("AC-3711.4: 기간 승인 안내 설명은 '그 기간에 돈이 두 번 들어갈 함께 있는 진료가 있는 날이 있으면('4-2')'로 시작하고 옛 앞부분은 없다", () => {
    const three = steps()[2]
    expect(three).toContain(`${RANGE_SENTENCE}, 설정에 지난번 고른 것이 있을 때`)
    expect(README).not.toContain('씨암·SONO 코드가 함께 있는 진료가 있는 기간이고 같은 코드를 씨암·SONO 둘 다에 넣었으면')
  })

  // spec erp-uisarang AC-4216.1(TASK-16): 0.3.0에서 0.4.0으로
  it('AC-3711.4 AC-4216.1: 확장 판 번호는 0.4.0이다', () => {
    expect(MANIFEST.version).toBe('0.4.0')
  })
})
