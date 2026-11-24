// TASK-2 (spec erp-uisarang) design.md 8-2·7-1·10절: 의사랑 화면 글 한 곳(uisText.ts).
// 글은 design.md 10절(★ 바뀐 글)·7-1 까닭 글, 시안 notes.md '화면 글', 시안 index.html(설정 화면 줄 글·저장법) 그대로다.
// - 고정 글은 모두 그 문서들에 글자 그대로 있어야 한다
// - 함수 글은 design.md(또는 notes.md)의 '{…}' 틀에 시안 예시 숫자(47칸 · 6개 · 2026-11-23 …)를 넣은 것과 같아야 한다
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { GROUP_NAMES } from './types'

const SRC = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(SRC, '..', '..')
const DESIGN = readFileSync(path.join(ROOT, 'specs', 'erp-uisarang', 'design.md'), 'utf8')
const NOTES = readFileSync(path.join(ROOT, 'docs', 'mockups', 'erp-uisarang', 'notes.md'), 'utf8')
const MOCKUP = readFileSync(path.join(ROOT, 'docs', 'mockups', 'erp-uisarang', 'index.html'), 'utf8')
const DOCS = [DESIGN, NOTES, MOCKUP].join('\n')

// uisText.ts가 없을 때 파일 전체가 아니라 그 시험만 실패하게 시험 안에서 불러온다
const loadText = () => import('./uisText')
const loadTypes = () => import('./uisTypes')

const DAY = '2026-11-23'
const DESKTOP = '바탕화면 › ERP마감 폴더'
const PROFILE = '사용자 폴더 › ERP마감 폴더'

/** 틀의 '{…}'를 차례대로 values로 바꾼다(틀의 자리 수와 values 수가 같아야 한다) */
function fill(template: string, ...values: (string | number)[]): string {
  let i = 0
  const out = template.replace(/\{[^{}]+\}/g, () => String(values[i++]))
  expect(i, `틀 '${template}'의 자리 수`).toBe(values.length)
  return out
}

/** 틀이 문서에 글자 그대로 있고, 받은 글이 그 틀에 값을 넣은 것과 같다 */
function expectText(actual: string, template: string, ...values: (string | number)[]) {
  expect(DOCS, `문서에 이 틀이 없다: ${template}`).toContain(template)
  expect(actual).toBe(fill(template, ...values))
}

/** 객체 안 글자 칸을 모두(함수 글 빼고) [자리, 글]로 */
function leaves(value: unknown, at = ''): [string, string][] {
  if (typeof value === 'string') return [[at, value]]
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${at}[${i}]`))
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => leaves(v, at ? `${at}.${k}` : k))
  }
  return []
}

describe('AC-4212.6 uisText.ts 이름 글(design.md 8-2)', () => {
  it('AC-4212.6: UIS_REPORT_NAMES는 UIS_KINDS 차례로 보고서 이름 6개(design.md 8-2 그대로)', async () => {
    const { UIS_REPORT_NAMES } = await loadText()
    const { UIS_KINDS } = await loadTypes()
    expect(Object.keys(UIS_REPORT_NAMES)).toEqual([...UIS_KINDS])
    const names = UIS_KINDS.map((kind) => UIS_REPORT_NAMES[kind])
    expect(names).toEqual([
      '일일수입통계',
      '기간별처방통계',
      '내원일별환자현황 위쪽 표',
      '내원일별환자현황 아래쪽 표',
      '예약환자통계 위쪽 표',
      '예약환자통계 아래쪽 표',
    ])
    expect(DESIGN).toContain(`\`UIS_REPORT_NAMES: Record<UisKind, string>\` = ${names.join(' · ')}.`)
  })

  it("AC-4212.6: UIS_FOLDER_TEXT는 '바탕화면 › ERP마감 폴더' · '사용자 폴더 › ERP마감 폴더'(design.md 8-2)", async () => {
    const { UIS_FOLDER_TEXT } = await loadText()
    expect(UIS_FOLDER_TEXT).toEqual({ desktop: DESKTOP, profile: PROFILE })
    expect(DESIGN).toContain(`UIS_FOLDER_TEXT = { desktop: '${DESKTOP}', profile: '${PROFILE}' }`)
  })
})

describe('AC-4212.6 uisJosa: 조사는 이름 끝 글자 받침으로(design.md 8-2)', () => {
  it.each<[string, '을/를' | '이/가' | '으로/로' | '와/과' | '은/는', string]>([
    ['일일수입통계', '이/가', '가'],
    ['가짜 목록', '이/가', '이'],
    ['진료과', '이/가', '가'],
    ['진료구분', '이/가', '이'],
    ['예약환자통계 아래쪽 표', '을/를', '를'],
    ['씨암', '을/를', '을'],
    ['재진', '와/과', '과'],
    ['카드', '와/과', '와'],
    ['표', '은/는', '는'],
    ['목록', '은/는', '은'],
    ['손', '으로/로', '으로'],
    ['발', '으로/로', '로'],
    ['코', '으로/로', '로'],
    // 날짜·숫자는 끝 숫자를 읽은 소리로: 3 삼 · 6 육 · 0 십(영) → 받침, 1 일 · 7 칠 · 8 팔 → ㄹ, 2 · 4 · 5 · 9 → 받침 없음
    ['2026-11-23', '으로/로', '으로'],
    ['2026-11-22', '으로/로', '로'],
    ['2026-11-21', '으로/로', '로'],
    ['2026-11-20', '으로/로', '으로'],
    ['2026-11-26', '으로/로', '으로'],
    ['2026-11-27', '으로/로', '로'],
    ['2026-11-23', '을/를', '을'],
    ['2026-11-25', '을/를', '를'],
    // 영문은 끝 글자 읽는 소리로(SONO 소노 · CT 티 → 없음, Radial 얼 → ㄹ, M 엠 · N 엔 → 받침)
    ['SONO', '을/를', '를'],
    ['CT', '이/가', '가'],
    ['ESWT Radial', '이/가', '이'],
    ['ESWT Radial', '으로/로', '로'],
    ['PROLO M', '으로/로', '으로'],
  ])('AC-4212.6: %s + %s → %s', async (word, pair, expected) => {
    const { uisJosa } = await loadText()
    expect(uisJosa(word, pair)).toBe(expected)
  })

  it.each<['을/를' | '이/가' | '으로/로' | '와/과' | '은/는', string]>([
    ['을/를', '을(를)'],
    ['이/가', '이(가)'],
    ['으로/로', '(으)로'],
    ['와/과', '과(와)'],
    ['은/는', '은(는)'],
  ])('AC-4212.6: 끝 글자가 한글·숫자·영문이 아니면(괄호·빈 이름) %s → %s(josa.ts와 같은 꼴)', async (pair, expected) => {
    const { uisJosa } = await loadText()
    expect(uisJosa('보고서(예)', pair)).toBe(expected)
    expect(uisJosa('', pair)).toBe(expected)
  })
})

describe('AC-4212.6 UIS_TEXT 고정 글은 문서 글자 그대로', () => {
  it('AC-4212.6: UIS_TEXT·UIS_OPTIONS_TEXT의 고정 글은 모두 design.md·notes.md·시안에 글자 그대로 있다', async () => {
    const { UIS_TEXT, UIS_OPTIONS_TEXT } = await loadText()
    // ⑫ 보고서를 모를 때 줄은 design.md가 'ERP마감 폴더의 엑셀이 한셀에 열려 있어요. …'(뒤는 같은 글)로 적어 따로 본다
    const apart = new Set(['open.howUnknown'])
    const all = [...leaves(UIS_TEXT), ...leaves(UIS_OPTIONS_TEXT).map(([at, t]): [string, string] => [`options.${at}`, t])]
    expect(all.length).toBeGreaterThan(80)
    for (const [at, text] of all) {
      if (apart.has(at)) continue
      expect(DOCS, `${at}: ${text}`).toContain(text)
    }
  })

  it("AC-4212.6: 모든 글은 글자만이다 — '{…}' 자리·HTML 꺾쇠·undefined가 없다(textContent로 넣는 글)", async () => {
    const { UIS_TEXT, UIS_OPTIONS_TEXT } = await loadText()
    for (const [at, text] of [...leaves(UIS_TEXT), ...leaves(UIS_OPTIONS_TEXT)]) {
      expect(text, at).not.toMatch(/[{}<>]|\$\{|undefined|NaN/)
    }
  })

  it('AC-4212.6: 단추·머리 글(design.md 9-3·10-1·10-3, 시안 ①②⑬)', async () => {
    const { UIS_TEXT } = await loadText()
    expect(UIS_TEXT.button).toBe('의사랑 값 채우기')
    expect(UIS_TEXT.exportButton).toBe('엑셀로 받기')
    expect(UIS_TEXT.reading).toBe('의사랑 엑셀 읽는 중…')
    expect(UIS_TEXT.head).toEqual({ fill: '의사랑 값 채우기', export: '엑셀로 받기', range: '기간 채우기' })
    expect(UIS_TEXT.close).toBe('안내 닫기')
    expect(UIS_TEXT.closeShort).toBe('닫기')
    expect(UIS_TEXT.openSettings).toBe('설정 열기')
    expect(UIS_TEXT.fillAnyway).toBe('있는 엑셀로 채우기')
    expect(UIS_TEXT.undo).toBe('되돌리기')
    expect(UIS_TEXT.untouched).toBe('아무 칸도 바꾸지 않았어요.')
  })

  it('AC-4212.6: ⑬ 기간 채우기 · ⑭ 설정 저장 전(시안 notes.md 그대로)', async () => {
    const { UIS_TEXT } = await loadText()
    expect(UIS_TEXT.range).toEqual({
      lead: '의사랑 자료로는 하루씩만 채울 수 있어요.',
      how: '의사랑 일일수입통계가 하루씩만 나와서예요. 날마다 그날 엑셀 6개를 저장하고 [의사랑 값 채우기]를 눌러 주세요.',
    })
    expect(UIS_TEXT.first).toBe('처음 한 번 설정 화면에서 코드를 고르고 [저장]을 눌러 주세요.')
  })
})

describe('AC-4212.6 멈춤 안내 글(design.md 10-1)', () => {
  it('AC-4212.6: ⑥ 엑셀 없음', async () => {
    const { UIS_TEXT } = await loadText()
    const t = UIS_TEXT.missing
    expect(t.lead).toBe('의사랑 통계에서 아래 보고서 6개를 엑셀로 저장해 주세요.')
    expect(t.optional).toBe('3 · 5번(위쪽 표)은 없어도 채울 수 있어요. 있으면 아래쪽 표와 숫자를 한 번 더 맞춰 봐요.')
    expectText(
      t.how(DAY),
      "조회일은 {날짜} 하루, 외/입 구분은 '전체'로 두고 [검색]한 뒤 표 오른쪽 위 초록 엑셀 단추로 저장해 주세요.",
      DAY,
    )
    expectText(t.where(DESKTOP), '저장할 곳: {폴더}', DESKTOP)
    expect(t.where(PROFILE)).toBe('저장할 곳: 사용자 폴더 › ERP마감 폴더')
    expect(t.person).toBe('4 · 6번은 환자별 표예요. ERP 도우미가 이 PC 안에서만 읽고 바로 지워요.')
  })

  it("AC-4212.6: ⑥⑦ 목록 — 머리 '저장할 엑셀' · '{번호}. {보고서}' · 있음 / 있음 (앞서 읽음) / 없음", async () => {
    const { UIS_TEXT } = await loadText()
    const t = UIS_TEXT.files
    expect(t.head).toBe('저장할 엑셀')
    expectText(t.row(1, '일일수입통계'), '{번호}. {보고서}', 1, '일일수입통계')
    expect(t.row(6, '예약환자통계 아래쪽 표')).toBe('6. 예약환자통계 아래쪽 표')
    expect([t.have, t.cached, t.none]).toEqual(['있음', '있음 (앞서 읽음)', '없음'])
  })

  it('AC-4212.6: ⑦ 일부 없음 — 하나면 보고서 이름 + 을/를(받침 두 갈래), 여럿이면 {N}개', async () => {
    const { UIS_TEXT } = await loadText()
    const t = UIS_TEXT.some
    const one = '의사랑 통계에서 {보고서}{을/를} 엑셀로 저장해 주세요.'
    expectText(t.one('예약환자통계 아래쪽 표'), one, '예약환자통계 아래쪽 표', '를')
    expectText(t.one('가짜 목록'), one, '가짜 목록', '을')
    expectText(t.many(2), '의사랑 통계에서 아래 보고서 {N}개를 엑셀로 저장해 주세요.', 2)
    expect(t.help).toBe(
      '저장한 뒤 [의사랑 값 채우기]를 다시 눌러 주세요. [있는 엑셀로 채우기]를 누르면 없는 엑셀의 칸만 비우고 채워요.',
    )
  })

  it("AC-4212.6: ⑨ 날짜 다름 — 조회일 줄 '{from}' 또는 '{from} ~ {to}', 없으면 '찾지 못함', 조회일 {날짜}{으로/로}(받침 두 갈래)", async () => {
    const { UIS_TEXT } = await loadText()
    const t = UIS_TEXT.date
    expect(t.lead).toBe('엑셀 날짜가 마감 일자와 달라요.')
    expectText(t.headDay(DAY), '마감 일자 {날짜}', DAY)
    expect(t.headExcel).toBe('엑셀 조회일')
    expect(t.range('2026-11-22', '2026-11-22')).toBe('2026-11-22')
    expect(t.range('2026-11-22', null)).toBe('2026-11-22')
    expectText(t.range('2026-11-01', DAY), '{from} ~ {to}', '2026-11-01', DAY)
    expect(t.notFound).toBe('찾지 못함')
    const how = '날짜가 다른 엑셀 {N}개를 조회일 {날짜}{으로/로} 다시 [검색]해 저장한 뒤 다시 눌러 주세요.'
    expectText(t.how(2, DAY), how, 2, DAY, '으로')
    expectText(t.how(1, '2026-11-22'), how, 1, '2026-11-22', '로')
    expect(t.kept).toBe('아무 칸도 바꾸지 않았어요. 날짜가 다른 합계 엑셀은 지우지 않고 그대로 두었어요.')
    expect(t.patientDeleted).toBe('환자별 엑셀(4 · 6번)은 날짜가 달라도 읽은 뒤 바로 지웠어요.')
  })

  it("AC-4212.6: ⑩ 조건 — 외/입 구분 글, 라벨이 다르면 {라벨}{이/가}(받침 두 갈래)", async () => {
    const { UIS_TEXT } = await loadText()
    const t = UIS_TEXT.cond
    expectText(t.lead('기간별처방통계', '외래'), "{보고서} 엑셀의 외/입 구분이 '{값}'예요.", '기간별처방통계', '외래')
    const label = "{보고서} 엑셀의 {라벨}{이/가} '{값}'예요."
    expectText(t.leadLabel('일일수입통계', '진료구분', '외래'), label, '일일수입통계', '진료구분', '이', '외래')
    expectText(t.leadLabel('일일수입통계', '진료과', '정형외과'), label, '일일수입통계', '진료과', '가', '정형외과')
    expect(t.how).toBe("의사랑 통계에서 외/입 구분을 '전체'로 바꿔 [검색]한 뒤 다시 엑셀로 저장해 주세요.")
  })

  it('AC-4212.6: ⑪ 같은 엑셀 둘 — 2개(셋 이상이면 그 수) · {폴더}에서 하나만 · 환자별이면 둘 다 지움', async () => {
    const { UIS_TEXT } = await loadText()
    const t = UIS_TEXT.dup
    expectText(t.lead('일일수입통계', 2), '{보고서} 엑셀이 2개 있어요.', '일일수입통계')
    expect(t.lead('일일수입통계', 3)).toBe('일일수입통계 엑셀이 3개 있어요.')
    expectText(t.how(DESKTOP), '{폴더}에서 하나만 남기고 지운 뒤 다시 눌러 주세요.', DESKTOP)
    expect(MOCKUP).toContain(t.how(DESKTOP))
    expect(t.why).toBe('어느 것이 맞는지 몰라 아무 칸도 바꾸지 않았어요.')
    expect(t.patient).toBe('환자별 엑셀은 둘 다 지웠어요. 하나만 다시 저장해 주세요.')
  })

  it('AC-4212.6: ⑫ 한셀에 열림 — {보고서}{이/가}(받침 두 갈래) · 모르면 ERP마감 폴더의 엑셀 · 번호 E-UIS-FILE-OPEN', async () => {
    const { UIS_TEXT } = await loadText()
    const t = UIS_TEXT.open
    expect(t.lead).toBe('한셀에 열려 있는 엑셀이 있어 읽지 못했어요.')
    const how = '{보고서}{이/가} 한셀에 열려 있어요. 한셀 창을 닫은 뒤 다시 눌러 주세요.'
    expectText(t.how('내원일별환자현황 아래쪽 표'), how, '내원일별환자현황 아래쪽 표', '가')
    expectText(t.how('가짜 목록'), how, '가짜 목록', '이')
    expect(DESIGN).toContain("'ERP마감 폴더의 엑셀이 한셀에 열려 있어요. …'")
    expect(t.howUnknown).toBe('ERP마감 폴더의 엑셀이 한셀에 열려 있어요. 한셀 창을 닫은 뒤 다시 눌러 주세요.')
    expect(t.why).toBe('환자별 엑셀은 읽은 뒤 바로 지워야 해서, 열려 있으면 읽지 않아요.')
    expect(t.code).toBe('아무 칸도 바꾸지 않았어요. (번호 E-UIS-FILE-OPEN)')
  })
})

describe('AC-4212.6 결과 안내 글(design.md 10-2, 시안 ③④⑤⑧ 예시 숫자)', () => {
  it('AC-4212.6: 1. 맞춰 볼 숫자', async () => {
    const { UIS_TEXT } = await loadText()
    const t = UIS_TEXT.check
    expect(t.title).toBe('의사랑과 맞춰 볼 숫자')
    expectText(t.total(5_182_300), '외래 총매출 {N}원', '5,182,300')
    expectText(t.received(1_741_100), '진료수납액 {N}원', '1,741,100')
    expectText(t.patients(97), '환자 합계 {N}명', 97)
    expect(t.help).toBe('의사랑 일일수입통계 화면의 같은 숫자와 먼저 견주어 보세요.')
  })

  it('AC-4212.6: 2. 채움 줄(47칸, 숫자는 쉼표)', async () => {
    const { UIS_TEXT } = await loadText()
    const filled = '{날짜} 의사랑 값으로 {N}칸을 채웠어요. 저장은 하지 않았어요.'
    expectText(UIS_TEXT.filled(DAY, 47), filled, DAY, 47)
    expect(MOCKUP).toContain('의사랑 값으로 ${n}칸을 채웠어요. 저장은 하지 않았어요.')
    expect(UIS_TEXT.filled(DAY, 1234)).toBe(fill(filled, DAY, '1,234'))
  })

  it('AC-4212.6: 3. 지움·모아 둔 값·종류 모름·남김·못 지움 줄', async () => {
    const { UIS_TEXT } = await loadText()
    const t = UIS_TEXT.cleanup
    expectText(t.deleted(6), '읽은 엑셀 {N}개는 이 PC에서 지웠어요.', 6)
    expectText(t.cached(1), '앞서 읽어 둔 엑셀 {N}개 값도 함께 썼어요.', 1)
    expectText(t.unknown(1), '의사랑 통계 엑셀이 아닌 엑셀 {N}개도 지웠어요.', 1)
    expectText(t.kept(2), '날짜가 다른 엑셀 {N}개는 지우지 않고 두었어요.', 2)
    expectText(t.failed(1, DESKTOP), '지우지 못한 엑셀이 {N}개 있어요. {폴더}에서 직접 지워 주세요.', 1, DESKTOP)
    expect(t.failed(2, PROFILE)).toBe('지우지 못한 엑셀이 2개 있어요. 사용자 폴더 › ERP마감 폴더에서 직접 지워 주세요.')
  })

  it("AC-4212.6: 4. 엑셀이 없어 비워 둔 칸 {N}칸 · '{보고서}{이/가} 없어 비워 두었어요.'(받침 두 갈래)", async () => {
    const { UIS_TEXT } = await loadText()
    const t = UIS_TEXT.absent
    expectText(`${t.title} ${UIS_TEXT.cells(1)}`, '엑셀이 없어 비워 둔 칸 {N}칸', 1)
    const why = '{보고서}{이/가} 없어 비워 두었어요. 직접 넣어 주세요.'
    expectText(t.why('예약환자통계 아래쪽 표'), why, '예약환자통계 아래쪽 표', '가')
    expectText(t.why('가짜 목록'), why, '가짜 목록', '이')
    expect(UIS_TEXT.cells(1234)).toBe('1,234칸')
  })

  it('AC-4212.6: 5. 의사랑에서 읽지 못한 칸 — 칸 없음 · 소수 · 재진 음수 · 산정안함 음수 까닭 줄과 할 일', async () => {
    const { UIS_TEXT } = await loadText()
    const t = UIS_TEXT.unread
    expectText(`${t.title} ${UIS_TEXT.cells(3)}`, '의사랑에서 읽지 못한 칸 {N}칸', 3)
    expectText(t.column('일일수입통계', ['카드수납액']), "{보고서}에 '{칸}' 칸이 없어요.", '일일수입통계', '카드수납액')
    // 칸이 여럿이면 시안 ④처럼 ' · '로 잇는다
    const two = t.column('일일수입통계', ['카드수납액', '현금수납액'])
    expect(two).toBe("일일수입통계에 '카드수납액' · '현금수납액' 칸이 없어요.")
    expect(MOCKUP).toContain(two)
    expectText(t.fractional(GROUP_NAMES.sono), '{묶음} 건수: 고른 코드의 총투여량에 소수가 있어요.', 'SONO')
    expect(t.negativeReturn).toBe('재진: 재진수에서 물리치료내원을 빼니 0보다 작아요.')
    expect(t.negativeNoExamFee).toBe('진찰료 산정안함: 환자 합계가 초진수 + 재진수보다 작아요.')
    expect(t.help).toBe(
      '의사랑 통계 표의 칸 설정이 바뀌었을 수 있어요. 비워 둔 칸은 직접 넣거나, 그 칸이 보이게 한 뒤 엑셀을 다시 저장하고 다시 눌러 주세요.',
    )
  })

  it('AC-4212.6: 7. 의사랑에 없어 비워 둔 칸 75칸 · 업무일지 1·2 줄 · 할 일', async () => {
    const { UIS_TEXT } = await loadText()
    const t = UIS_TEXT.none
    expectText(`${t.title} ${UIS_TEXT.cells(75)}`, '의사랑에 없어 비워 둔 칸 {N}칸', 75)
    expect(t.rows.map(([book]) => book)).toEqual(['업무일지 1', '업무일지 2'])
    expect(DESIGN).toContain(
      t.rows.map(([book, line]) => `'${book} ${line}'`).join(' · '),
    )
    expect(t.rows[0][1]).toBe('환자현황 90일초진 · 외래 수입 미수입금(+) · 미수발생(-) · 감액 · 장애인기금(-) · 계좌이체액(-) · 현불/환불(-) · 입원수입')
    expect(t.rows[1][1]).toBe('예약 나머지 칸 · 치료별 건수 · 연령별 90일초진 · 주사1회환자 · 신환주사환자 · 신환주사건수')
    expect(t.help).toBe(
      '의사랑 통계 합계로는 셀 수 없는 칸이라 비워 두었어요. 직접 넣어 주세요. 계좌이체는 현금수납액에 들어 있고, 내원하지 않은 환자의 미수 · 환불은 일일수입통계에 빠져요.',
    )
  })

  it('AC-4212.6: 8. 맞춰 보기 경고 아홉 + 조회일 없음 · 나이 못 셈 · 뒤 줄(design.md 6-2 차례)', async () => {
    const { UIS_TEXT } = await loadText()
    const w = UIS_TEXT.warn
    expectText(w.totalFee(5_182_300, 5_179_300), '총진료비({N}원)가 급여총액 + 비급여({N}원)와 달라요.', '5,182,300', '5,179,300')
    expect(MOCKUP).toContain(w.totalFee(5_182_300, 5_179_300))
    expectText(w.received(1_741_100, 1_729_100), '진료수납액({N}원)이 현금 + 카드({N}원)와 달라요.', '1,741,100', '1,729,100')
    expect(MOCKUP).toContain(w.received(1_741_100, 1_729_100))
    expectText(w.headcount(97, 96), '인원계({N}명)가 초진 + 재진({N}명)과 달라요.', 97, 96)
    expectText(
      w.rxTotal(12_345_600, 12_345_000),
      '기간별처방통계 코드 줄 총액 합({N}원)이 합계 줄({N}원)과 달라요.',
      '12,345,600',
      '12,345,000',
    )
    // 아래쪽 표가 적으면 '모자랄', 많으면 '많을'
    const rows = '내원일별환자현황 아래쪽 표 환자 수({N}명)가 인원수({N}명)와 달라요. 연령별 표가 {차}명 모자랄 수 있어요.'
    expectText(w.visitRows(96, 97), rows, 96, 97, 1)
    expect(MOCKUP).toContain(w.visitRows(96, 97))
    expect(DESIGN).toContain("'…{차}명 많을 수 있어요.'")
    expect(w.visitRows(99, 97)).toBe(
      '내원일별환자현황 아래쪽 표 환자 수(99명)가 인원수(97명)와 달라요. 연령별 표가 2명 많을 수 있어요.',
    )
    expect(w.visitRows(1_096, 1_000)).toContain('환자 수(1,096명)가 인원수(1,000명)와 달라요. 연령별 표가 96명 많을')
    expectText(w.visitNew(6, 7), '내원일별환자현황 아래쪽 표 신규({N}명)가 위쪽 표 신규환자({N}명)와 달라요.', 6, 7)
    expectText(w.rsvRows(34, 33), '예약환자통계 아래쪽 표 예약({N}건)이 위쪽 표 예약건수({N}건)와 달라요.', 34, 33)
    expectText(w.rsvVisited(29, 28), '예약환자통계 아래쪽 표 방문({N}건)이 위쪽 표 이행건수({N}건)와 달라요.', 29, 28)
    expect(w.noDate).toBe(
      '내원일별환자현황 아래쪽 표에서 조회일을 찾지 못했어요. 그날 줄을 누르고 저장했는지 확인해 주세요.',
    )
    expectText(w.unknownAge(2), '주민번호로 나이를 셀 수 없는 환자 {N}명은 연령별 표에 넣지 않았어요.', 2)
    expect(w.after).toBe('채우기는 했어요. 의사랑 화면과 견주어 확인해 주세요.')
  })

  it('AC-4212.6: 9. 예약 참고 줄', async () => {
    const { UIS_TEXT } = await loadText()
    expectText(
      UIS_TEXT.reservations(34, 29),
      '예약환자통계: 예약 {N}건 · 내원 {N}건. ERP 예약 줄은 종류별로 직접 넣어 주세요.',
      34,
      29,
    )
    expect(UIS_TEXT.reservations(1_200, 1_100)).toContain('예약 1,200건 · 내원 1,100건.')
  })
})

describe('AC-4212.6 받았어요 안내 · 빈 칸 까닭 글(design.md 10-3·7-1)', () => {
  it('AC-4212.6: 10-3 받았어요 안내', async () => {
    const { UIS_TEXT } = await loadText()
    const t = UIS_TEXT.exported
    expectText(t.lead(DAY), '{날짜} 의사랑 값을 엑셀 파일로 받았어요. ERP 칸은 바꾸지 않았어요.', DAY)
    expectText(t.file(`ERP마감-의사랑-${DAY}.xlsx`), '파일 이름: {파일 이름}(크롬 다운로드 폴더)', `ERP마감-의사랑-${DAY}.xlsx`)
    expect(t.blank).toBe("빈 칸은 끝 열 '빈 칸 까닭'을 보고 직접 넣어 주세요.")
  })

  it("AC-4212.6: 7-1 빈 칸 까닭 — 직접 입력 · 의사랑에 없음 · 코드 안 고름 · 못 읽음 · '못 읽음 ({보고서} 없음)'", async () => {
    const { UIS_TEXT } = await loadText()
    const t = UIS_TEXT.why
    expect([t.direct, t.none, t.unpicked, t.unknown]).toEqual(['직접 입력', '의사랑에 없음', '코드 안 고름', '못 읽음'])
    expectText(t.missing('일일수입통계'), '못 읽음 ({보고서} 없음)', '일일수입통계')
    expect(DESIGN).toContain("direct '직접 입력' · none '의사랑에 없음' · unpicked '코드 안 고름' · unknown '못 읽음'")
  })
})

describe('AC-4212.6 설정 화면 글 UIS_OPTIONS_TEXT(design.md 10-6, 시안 ⑮~⑱)', () => {
  it('AC-4212.6: 맨 위 상자 · 처음 안내 · 첫 줄(폴더는 받은 글로)', async () => {
    const { UIS_OPTIONS_TEXT: o } = await loadText()
    expect(NOTES).toContain(`'${o.source.strong} ${o.source.rest(DESKTOP)}'`)
    expect(o.source.rest(PROFILE)).toBe(
      '이 PC의 ERP 도우미는 사용자 폴더 › ERP마감 폴더에 저장한 의사랑 통계 엑셀을 읽어 ERP 칸을 채워요.',
    )
    expect(NOTES).toContain(`'${o.first.strong} ${o.first.rest}'`)
    expect(o.lead).toBe(
      'ERP 칸마다 셀 의사랑 처방 코드를 고르세요. 건수와 매출은 따로 골라요. 여러 개를 고를 수 있어요. 코드를 고르지 않은 칸은 건드리지 않아요.',
    )
  })

  it('AC-4212.6: 코드 목록 줄 · 없을 때 3단계 · 단추', async () => {
    const { UIS_OPTIONS_TEXT: o } = await loadText()
    const c = o.codes
    expectText(
      c.read('2026-08-24', DAY, 186),
      '의사랑 기간별처방통계({기간})에서 처방 코드 {N}개를 읽었어요. 목록만 기억하고 엑셀은 지웠어요.',
      `2026-08-24~${DAY}`,
      186,
    )
    // 시안은 코드 수를 ${CODE_TOTAL}(186)로 적었다
    expect(MOCKUP).toContain(c.read('2026-08-24', DAY, 186).replace('186', '${CODE_TOTAL}'))
    expect(c.read('2026-08-24', DAY, 1_234)).toContain('처방 코드 1,234개를')
    expect(c.again).toBe('새 코드가 생기면 기간별처방통계를 다시 저장하고 [코드 목록 다시 읽기]를 눌러 주세요.')
    expect(c.none).toBe('처방 코드 목록이 아직 없어요.')
    const steps = c.steps(DESKTOP)
    expect(steps).toHaveLength(3)
    for (const step of steps) expect(MOCKUP).toContain(`<li>${step}</li>`)
    expect(c.steps(PROFILE)[2]).toBe('표 오른쪽 위 초록 엑셀 단추로 사용자 폴더 › ERP마감 폴더에 저장해 주세요.')
    expect(c.then).toBe('그다음 [코드 목록 읽기]를 눌러 주세요.')
    expect([c.readButton, c.rereadButton]).toEqual(['코드 목록 읽기', '코드 목록 다시 읽기'])
  })

  it('AC-4212.6: [코드 목록 읽기] 결과 missing · notAll · twice · open(design.md 10-6 ★)', async () => {
    const { UIS_OPTIONS_TEXT: o } = await loadText()
    const c = o.codes
    expectText(c.missing(DESKTOP), '{폴더}에 기간별처방통계 엑셀이 없어요.', DESKTOP)
    expectText(c.notAll('외래'), "기간별처방통계 엑셀의 외/입 구분이 '{값}'예요. '전체'로 다시 저장해 주세요.", '외래')
    expect(c.twice).toBe('기간별처방통계 엑셀이 2개 있어요. 하나만 남겨 주세요.')
    expect(c.open).toBe('기간별처방통계 엑셀이 한셀에 열려 있어요. 한셀 창을 닫은 뒤 다시 눌러 주세요.')
  })

  it("AC-4212.6: 줄 이름표 · 찾기 꼬리 '총투여량 N' / '총액 N원' · 소수 안내 · '(처방통계에 없음)' · 막힌 찾기 칸", async () => {
    const { UIS_OPTIONS_TEXT: o } = await loadText()
    expect(o.label).toEqual({ counts: '건수로 셀 코드', sales: '매출로 셀 코드' })
    expect(o.qty(31.5)).toBe('총투여량 31.5')
    expect(o.qty(5_120)).toBe('총투여량 5,120')
    expect(o.amount(41_888_000)).toBe('총액 41,888,000원')
    expect(NOTES).toContain("'총투여량 N' / '총액 N원'")
    expect(o.fraction).toBe('주황 숫자는 총투여량에 소수가 있는 코드예요. 건수로는 맞지 않을 수 있어요.')
    expect(o.notInList).toBe('(처방통계에 없음)')
    expect(o.noList).toBe('코드 목록이 없어 찾을 수 없어요')
  })

  it('AC-4212.6: 씨암·SONO 주의 줄은 이름 받침으로 을/를(씨암을 · SONO를)', async () => {
    const { UIS_OPTIONS_TEXT: o } = await loadText()
    const caution = '시술 코드(예: la358)를 매출에 고르면 {이름}를 쓰지 않은 진료의 그 시술 금액도 그날 것이 모두 들어가요.'
    expectText(o.caution(GROUP_NAMES.sono), caution, 'SONO')
    expect(o.caution(GROUP_NAMES.carm)).toBe(
      '시술 코드(예: la358)를 매출에 고르면 씨암을 쓰지 않은 진료의 그 시술 금액도 그날 것이 모두 들어가요.',
    )
  })

  it('AC-4212.6: 묶음 차례·이름·설명·줄마다 쓰는 칸은 design.md 9-5 차례, 시안 글 그대로이고 두 키 목록을 한 번씩 덮는다', async () => {
    const { UIS_OPTIONS_TEXT: o } = await loadText()
    const { UIS_COUNT_KEYS, UIS_SALES_KEYS } = await loadTypes()
    expect(o.sections.map((s) => s.title)).toEqual(['치료별 건수 · 매출', '진료 · 치료현황만', '운영 지표', '환자현황'])
    expect(o.sections.map((s) => s.rows.map(([key]) => key))).toEqual([
      ['carm', 'sono', 'arthro', 'manual', 'eswt', 'pt', 'etc1', 'etc2', 'etc3', 'etc4'],
      ['manualConsult', 'lipus', 'nail', 'ct', 'surgery'],
      ['eswtStd', 'eswtRadial'],
      ['ptVisit'],
    ])
    const keys = o.sections.flatMap((s) => s.rows.map(([key]) => key))
    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(keys)).toEqual(new Set([...UIS_COUNT_KEYS, ...UIS_SALES_KEYS]))
    for (const s of o.sections) {
      expect(MOCKUP).toContain(`{ t: '${s.title}', p: '${s.about}', items: [`)
      for (const [key, use] of s.rows) expect(MOCKUP, key).toContain(`['${key}', '${GROUP_NAMES[key]}', '${use}'`)
    }
  })

  it("AC-4212.6: 예약 묶음은 안내 한 줄만이고 '예약 합계를 넣을 줄' 글이 없다(design.md 10-6 ★, 11절 10)", async () => {
    const { UIS_OPTIONS_TEXT: o } = await loadText()
    expect(o.rsv).toEqual({
      title: '예약',
      about:
        '의사랑 예약에는 종류가 없어 실예약환자수만 채워요. 종류별 줄과 변경 · 취소는 직접 넣어 주세요. 예약건수 · 내원 수는 채운 뒤 안내에 보여요.',
    })
    for (const [at, text] of leaves(o)) {
      expect(text, at).not.toContain('예약 합계를 넣을 줄')
      expect(text, at).not.toContain('넣지 않음')
    }
  })

  it("AC-4212.6: '매일 저장할 엑셀 6개' 표 — 줄은 UIS_KINDS 차례, '꼭' 열(1 · 2 · 4 · 6번 꼭, 3 · 5번 있으면 좋음), 저장법·환자별 안내", async () => {
    const { UIS_OPTIONS_TEXT: o, UIS_REPORT_NAMES } = await loadText()
    const { UIS_KINDS, UIS_REQUIRED, UIS_PATIENT } = await loadTypes()
    const r = o.reports
    expect(r.title).toBe('매일 저장할 엑셀 6개')
    expect(MOCKUP).toContain(r.intro(DESKTOP))
    expect(r.columns).toEqual({ menu: '의사랑 통계 메뉴', table: '표', file: '이름 예', fills: '채우는 칸', need: '꼭' })
    expect(r.need).toEqual({ required: '꼭', optional: '있으면 좋음' })
    expect(DESIGN).toContain("열 '꼭'(1 · 2 · 4 · 6번 '꼭', 3 · 5번 '있으면 좋음')")
    expect(r.oneTable).toBe('표 하나')
    expect(r.person).toBe('환자 정보 있음')
    expect(Object.keys(r.rows)).toEqual([...UIS_KINDS])
    for (const kind of UIS_KINDS) {
      const row = r.rows[kind]
      // 보고서 이름(design.md 8-2)은 표 이름 + 위·아래쪽 표. 기간별처방통계만 이름에 '위쪽 표'를 붙이지 않는다
      expect([row.name, `${row.name} ${row.table}`], kind).toContain(UIS_REPORT_NAMES[kind])
      expect(MOCKUP, kind).toContain(`{ menu: '${row.menu}', name: '${row.name}', table: '${row.table ?? ''}'`)
      if (row.how) expect(MOCKUP, kind).toContain(`tableHow: '${row.how}'`)
      expect(MOCKUP, kind).toContain(`file: '${row.file}', fills: '${row.fills}'`)
      // 환자별 표(4 · 6번)만 '그날 줄을 누른 뒤'와 '환자 정보 있음'
      expect(row.how !== null, kind).toBe(UIS_PATIENT.includes(kind))
      expect(UIS_REQUIRED.includes(kind) ? r.need.required : r.need.optional, kind).toBe(
        ['visits', 'rsv'].includes(kind) ? '있으면 좋음' : '꼭',
      )
    }
    expect(r.howTo).toHaveLength(3)
    for (const line of r.howTo) expect(MOCKUP).toContain(`<p>${line}</p>`)
    expect(r.suffix).toBe('아래쪽 표는 저장할 때 이름 끝에 -환자별을 붙여 주세요.')
    expect(NOTES).toContain(`'${r.privacy.strong} ${r.privacy.rest}'`)
    expect(o.foot).toBe(
      '환자 이름 · 차트번호 · 주민번호는 이 PC의 도우미 밖으로 나가지 않아요. ERP 화면에는 숫자만 넣고, 저장은 ERP에서 직접 눌러요.',
    )
  })
})

describe('AC-4212.6 uisText.ts 코드 모양', () => {
  it('AC-4212.6: uisText.ts는 josa.js·uisTypes.js만 부르고 DOM·저장소·도우미에 닿지 않는다(글만 둔다)', () => {
    const code = readFileSync(path.join(SRC, 'uisText.ts'), 'utf8')
    const specs = [...code.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1])
    expect(new Set(specs)).toEqual(new Set(['./josa.js', './uisTypes.js']))
    expect(code).not.toMatch(/\b(?:document|chrome|innerHTML|import\s*\()/)
  })
})
