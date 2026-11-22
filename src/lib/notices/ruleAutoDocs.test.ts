import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 점검 규칙 저절로 바꾸기 문서 시험 (specs/rule-auto REQ-7818 AC-7818.1~3, tasks.md TASK-15, design.md 12절).
// 문서를 글자로 읽는다(src/lib/inventory/inventoryDocs.test.ts와 같은 틀). ADR-040 글과 CLAUDE.md 예외 줄은 design 12절 글 그대로다.
// 뒤에 ADR-041 같은 새 글이 붙어도 깨지지 않게 'ADR-040이 맨 끝'은 보지 않는다
const ROOT = process.cwd()
// 줄바꿈이 CRLF로 받아져도 같은 글로 본다
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const ADR_TITLE = /^### ADR-(\d{3}): (.+)$/gm
const titles = (doc: string) => [...doc.matchAll(ADR_TITLE)].map((m) => [m[1]!, m[2]!] as const)
// 그 번호 ADR 절(제목 줄부터 다음 ADR 제목 앞까지). 없으면 ''
function adrSection(doc: string, no: string): string {
  const head = new RegExp(`^### ADR-${no}: `, 'm').exec(doc)
  if (head === null) return ''
  const rest = doc.slice(head.index + 1)
  const next = rest.search(/^### ADR-/m)
  return next === -1 ? doc.slice(head.index) : doc.slice(head.index, head.index + 1 + next)
}
// '## 제목' 절의 본문(다음 '## ' 앞까지). 없으면 ''
function section(doc: string, title: string): string {
  const head = doc.indexOf(`\n## ${title}\n`)
  if (head === -1) return ''
  const body = doc.slice(head + `\n## ${title}\n`.length)
  const next = body.search(/^## /m)
  return next === -1 ? body : body.slice(0, next)
}
// 제목 줄이 `### 앞글자`로 시작하는 절의 본문(다음 '### '·'## ' 앞까지). 없으면 ''
function subsectionStarting(doc: string, start: string): string {
  const head = doc.indexOf(`\n### ${start}`)
  if (head === -1) return ''
  const body = doc.slice(doc.indexOf('\n', head + 1) + 1)
  const next = body.search(/^##+ /m)
  return next === -1 ? body : body.slice(0, next)
}
// 표 줄('| '로 시작) 가운데 첫 칸에 `이름`이 든 줄
const rowsNaming = (body: string, name: string) =>
  body.split('\n').filter((line) => line.startsWith('| ') && (line.split('|')[1] ?? '').includes(`\`${name}\``))

// design.md 12절 ADR-040 글 그대로
const ADR040 = [
  "### ADR-040: 새 고시가 근거를 바꾼 점검 규칙을 AI가 고쳐 바로 적용한다 (ADR-038 '규칙 자동 수정 없음'을 바꿈)",
  "**맥락**: 고시·공지(ADR-036~038)는 새 고시와 점검 규칙(`rules.json`)을 고시 번호로만 이었다. 그래서 규칙표가 이미 담은 지난 고시까지 '확인 필요'가 떴고(지난 글 채우기 뒤 '새 고시 11개가 점검 규칙 107개'), 한 고시가 규칙 20~27개를 근거로 두어 번호 맞춤은 너무 넓었다. 규칙을 고치려면 사람이 `rules.json`을 고쳐 배포해야 했다.",
  '**결정** (2026-11-22 사용자: "점검규칙 저절로 바뀌게해" — \'완전히 저절로\'를 고름. 설계는 Claude 판단):',
  '- 규칙표 판 날짜(`rules.json` `version`, 지금 2026-10-19)까지 올라온 글은 규칙과 잇지 않고, 모으기가 남은 연결을 지운다.',
  "- 이어진 규칙마다 모으기 경로가 새 고시 글과 그 규칙 JSON을 `claude-opus-5-5`(effort high)로 보내 '상관없음 · 바뀔 것 없음 · 바꿈 · 사람이 봐야 함'을 받는다. 바꿈은 `title`·`message`·`params`만 고칠 수 있고, 앱이 검사(바꾸지 못하는 칸·규칙표 모양·아는 이름·코드만·뺀 것 없음·등급과 자동 점검 상태 그대로·크기·시행일)를 지난 것만 공용 표 `rule_changes`에 판으로 쓴다. 못 지나면 '사람이 봐야 함'. 코드 안 계산에 묶인 규칙은 늘 사람이 본다.",
  '- 청구 화면이 RLS로 살아 있는 판을 읽어 Worker 설정 묶음(`CheckSettings.ruleUpdates`)에 실어 보내고, Worker가 판을 다시 검사해 같은 규칙 번호의 판들이 날짜 창을 나눠 갖게 합친다 → 엔진이 진료일에 맞는 판으로 점검한다. Worker는 네트워크를 쓰지 않는다(울타리 그대로).',
  "- 되돌리기는 병원마다(`rule_change_marks`): 그 병원만 그 판을 빼고 점검한다. 대시보드는 '바뀌었어요'(안 본 바뀜)와 '확인 필요'(사람이 봐야 함) 띠 둘.",
  '**대안**: (1) AI 안 → 원장이 [적용] 한 번 — 더 안전하지만 사용자가 고르지 않음. (2) 사람이 `rules.json`을 고쳐 배포 — 지금 방식, 느림. (3) 일괄 처리(반값) — 답이 하루 늦고 판 사슬(지금 판 기준)이 꼬인다. (4) 판을 `rules.json`에 저절로 써 넣기 — 서버가 저장소를 고칠 수 없다.',
  '**트레이드오프**: AI가 잘못 고치면 경고가 틀릴 수 있다 → 경고를 줄이는 쪽(코드·묶음 빼기·등급·상태 바꾸기)은 막고, 알림·전후 글·병원마다 되돌리기를 둔다. 고시 글 속 지시(프롬프트 주입)로 규칙을 바꾸려 해도 같은 검사를 지나야 한다. 공용 표라 한 판이 모든 병원에 바로 쓰인다. `rules.json` 판을 올릴 때 살아 있는 판을 먼저 규칙표에 옮겨야 한다(새 판이 배포되면 옛 판 줄은 `old`가 되어 안 쓰임). 비용은 한 달 약 0.5만~2만 원 어림.',
].join('\n')

// ADR-038의 '점검 규칙 연결' 줄(이 TASK 전 글)과 끝에 붙는 글
const ADR038_RULE_LINE =
  '- **점검 규칙 연결**: 서버가 `lib/precheck/data/rules.json`을 읽기만 해 근거 고시 번호와 맞춘다(규칙 자동 수정 없음). 환자 자료 구역 울타리는 그대로다.'
const CHANGED_BY_040 = ' (ADR-040이 바꿈)'
const ADR038_TITLE = "바깥 공개 글을 Claude로 보내고, 묻기는 사용자가 적은 질문을 보낸다 (ADR-007 '서버가 DB에서 읽은 집계만' 예외)"
const ADR039_TITLE = '직원 자료(연락처·주소·생일·계좌·근무·휴가·급여·서류 파일)를 Supabase에 원장만 보게 둔다. 주민번호는 두지 않는다'
// 이 TASK 전 docs/ADR.md 제목 번호(023·027은 원래 없다)
const ADR_NUMBERS_BEFORE = [
  '001', '002', '003', '004', '005', '006', '007', '008', '009', '010',
  '011', '012', '013', '014', '015', '016', '017', '018', '019', '020',
  '021', '022', '024', '025', '026', '028', '029', '030', '031', '032',
  '033', '034', '035', '036', '037', '038', '039',
]

// design.md 12절 'CLAUDE.md 예외 줄' 그대로
const CLAUDE_LINE =
  '- 예외 (ADR-040): 점검 규칙 저절로 바꾸기(`specs/rule-auto`)만 — 모으기 경로가 새 고시 글과 그 고시를 근거로 둔 점검 규칙 JSON을 Claude로 보내고, 검사를 지난 새 규칙 판을 공용 표 `rule_changes`(병원 칸 없음, 모으기 계정만 씀)에 쓴다. 청구 화면이 RLS로 읽어 Worker 설정 묶음에 실어 보내고 Worker가 진료일에 맞는 판으로 점검한다. 병원마다 되돌림은 `rule_change_marks`. 환자 자료 구역 울타리는 그대로다'

const RULE_TABLES = ['rule_changes', 'rule_change_marks', 'rule_review_tries'] as const

describe('AC-7818.1: docs/ADR.md ADR-040 — 새 고시가 근거를 바꾼 점검 규칙을 AI가 고쳐 바로 적용한다', () => {
  const doc = () => read('docs/ADR.md')

  it('AC-7818.1: `### ADR-040:` 제목이 한 번 있고 design 12절 제목 그대로다', () => {
    const found = titles(doc()).filter(([no]) => no === '040')
    expect(found).toHaveLength(1)
    expect(`### ADR-040: ${found[0]![1]}`).toBe(ADR040.split('\n')[0])
  })

  it('AC-7818.1: ADR-040 절은 design 12절 글(맥락·결정·대안·트레이드오프) 그대로다', () => {
    const body = adrSection(doc(), '040')
    expect(body).not.toBe('')
    expect(body.trimEnd()).toBe(ADR040)
    for (const label of ['**맥락**: ', '**결정** (2026-11-22 ', '**대안**: ', '**트레이드오프**: ']) {
      expect(body.split('\n').filter((line) => line.startsWith(label)), label).toHaveLength(1)
    }
  })

  it('AC-7818.1: ADR-040은 ADR-039 바로 뒤에 있다(제목 번호 차례·ADR-039 절 다음 제목)', () => {
    const numbers = titles(doc()).map(([no]) => no)
    const at039 = numbers.indexOf('039')
    expect(at039).toBeGreaterThan(-1)
    expect(numbers[at039 + 1]).toBe('040')
    const after039 = doc().slice(doc().indexOf(adrSection(doc(), '039')) + adrSection(doc(), '039').length)
    expect(after039.startsWith('### ADR-040: ')).toBe(true)
  })

  it("AC-7818.1: ADR-038의 '점검 규칙 연결' 줄 끝에 (ADR-040이 바꿈)이 있고, 줄의 앞 글은 그대로다", () => {
    const lines = adrSection(doc(), '038')
      .split('\n')
      .filter((line) => line.startsWith('- **점검 규칙 연결**: '))
    expect(lines).toEqual([ADR038_RULE_LINE + CHANGED_BY_040])
    expect(lines[0]!.endsWith('(ADR-040이 바꿈)')).toBe(true)
  })

  it('AC-7818.1: 다른 ADR 글은 그대로다 — 제목 번호·ADR-038·039 제목이 같고, ADR-040을 가리키는 곳은 ADR-040 절과 ADR-038 그 줄뿐이다', () => {
    const all = titles(doc())
    expect(all.map(([no]) => no).filter((no) => Number(no) <= 40)).toEqual([...ADR_NUMBERS_BEFORE, '040'])
    expect(Object.fromEntries(all)['038']).toBe(ADR038_TITLE)
    expect(Object.fromEntries(all)['039']).toBe(ADR039_TITLE)
    const outside040 = doc().replace(adrSection(doc(), '040'), '')
    expect(outside040.split('\n').filter((line) => line.includes('ADR-040'))).toEqual([ADR038_RULE_LINE + CHANGED_BY_040])
    expect(doc().split('\n').filter((line) => line.includes('(ADR-040이 바꿈)'))).toHaveLength(1)
  })

  it('AC-7818.1: ADR-040 찾기 자체가 맞다(다른 ADR 글을 잡지 않는다)', () => {
    const body = adrSection(doc(), '040')
    expect(body.startsWith('### ADR-040: ')).toBe(true)
    expect(body.slice(1)).not.toMatch(/^### ADR-/m)
  })
})

describe('AC-7818.2: CLAUDE.md 아키텍처 규칙의 예외 (ADR-040) 줄', () => {
  const lines = () => read('CLAUDE.md').split('\n')

  it("AC-7818.2: '예외 (ADR-036~038)' 줄 바로 아래에 design 12절의 '예외 (ADR-040)' 줄이 글자 그대로 있다", () => {
    const at036 = lines().findIndex((line) => line.startsWith('- 예외 (ADR-036~038): '))
    expect(at036).toBeGreaterThan(-1)
    expect(lines()[at036 + 1]).toBe(CLAUDE_LINE)
  })

  it('AC-7818.2: ADR-040 줄은 CLAUDE.md 전체에서 하나이고 아키텍처 규칙 절 안에 있다', () => {
    expect(lines().filter((line) => line.includes('ADR-040'))).toEqual([CLAUDE_LINE])
    const rules = section(read('CLAUDE.md'), '아키텍처 규칙')
    expect(rules).not.toBe('')
    expect(rules.split('\n')).toContain(CLAUDE_LINE)
  })

  it("AC-7818.2: '예외 (ADR-036~038)' 줄은 하나 그대로 남는다", () => {
    expect(lines().filter((line) => line.startsWith('- 예외 (ADR-036~038): '))).toHaveLength(1)
  })
})

describe('AC-7818.3: plan.md §0·§2-11·§5 — rule_changes와 ADR-040', () => {
  const plan = () => read('plan.md')

  it('AC-7818.3: §0 고시·공지 공용 표 줄에 `rule_changes`가 있다(ADR-040, specs/rule-auto)', () => {
    const body = section(plan(), '0. 단순하게 만드는 원칙')
    expect(body).not.toBe('')
    const lines = body.split('\n').filter((line) => line.includes('공용 표'))
    expect(lines).toHaveLength(1)
    for (const word of ['`notices`', '`rule_changes`', '`hospital_id` 없이', 'ADR-037', 'ADR-040', 'specs/rule-auto']) {
      expect(lines[0], word).toContain(word)
    }
  })

  it("AC-7818.3: §2-11 고시·공지에 '점검 규칙 저절로 바꾸기(ADR-040)' 한 줄이 있다", () => {
    const body = subsectionStarting(plan(), '2-11. 고시·공지')
    expect(body).not.toBe('')
    const lines = body.split('\n').filter((line) => line.includes('ADR-040'))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^- 점검 규칙 저절로 바꾸기\(ADR-040\): /)
    for (const word of ['`rule_changes`', '되돌리기', '병원마다', '2026-11-22', 'specs/rule-auto']) expect(lines[0], word).toContain(word)
  })

  it.each(RULE_TABLES)('AC-7818.3: §5 DB 표 첫 칸에 %s가 한 번 있다', (name) => {
    const table = subsectionStarting(plan(), 'DB 표 (Claude 판단)')
    expect(table).not.toBe('')
    expect(rowsNaming(table, name)).toHaveLength(1)
  })

  it('AC-7818.3: §5 DB 표의 규칙 판 줄은 공용 표·모으기 계정·병원마다 되돌림·ADR-040을 적는다', () => {
    const table = subsectionStarting(plan(), 'DB 표 (Claude 판단)')
    const rows = [...new Set(RULE_TABLES.flatMap((name) => rowsNaming(table, name)))].join('\n')
    for (const word of ['공용 표', '`hospital_id` 없음', '모으기 계정', '되돌림', 'DB 함수', 'ADR-040', 'specs/rule-auto']) {
      expect(rows, word).toContain(word)
    }
  })
})

describe("AC-7818.3: docs/ARCHITECTURE.md 데이터 흐름 [고시·공지]에 '규칙 살피기'와 ruleUpdates", () => {
  const flow = () => section(read('docs/ARCHITECTURE.md'), '데이터 흐름').split('```')[1] ?? ''
  // [고시·공지] 줄부터 다음 '[' 줄 앞까지
  const noticesFlow = () => {
    const lines = flow().split('\n')
    const start = lines.findIndex((l) => l.startsWith('[고시·공지]'))
    if (start === -1) return ''
    const end = lines.findIndex((l, i) => i > start && l.startsWith('['))
    return lines.slice(start, end === -1 ? undefined : end).join('\n')
  }

  it("AC-7818.3: [고시·공지] 흐름에 ② 규칙 살피기 줄이 있고 Claude·rule_changes·ADR-040을 적는다", () => {
    const body = noticesFlow()
    expect(body).not.toBe('')
    const lines = body.split('\n').filter((l) => l.includes('규칙 살피기'))
    expect(lines).toHaveLength(1)
    for (const word of ['② 규칙 살피기', 'Claude', 'effort high', 'rule_changes', 'ADR-040']) expect(lines[0], word).toContain(word)
  })

  it('AC-7818.3: [고시·공지] 흐름에 청구 설정 묶음의 ruleUpdates 줄이 있고 되돌림 rule_change_marks·Worker·진료일을 적는다', () => {
    const lines = noticesFlow()
      .split('\n')
      .filter((l) => l.includes('ruleUpdates'))
    expect(lines).toHaveLength(1)
    for (const word of ['청구 화면', 'RLS', 'rule_change_marks', 'Worker 설정 묶음 ruleUpdates', '진료일']) expect(lines[0], word).toContain(word)
  })

  it('AC-7818.3: [고시·공지] 첫 줄과 [묻기] 줄은 그대로 흐름 안에 있다', () => {
    const body = noticesFlow()
    expect(body.split('\n')[0]).toMatch(/^\[고시·공지\] Vercel Cron/)
    expect(body.split('\n').filter((l) => l.trimStart().startsWith('[묻기]'))).toHaveLength(1)
  })
})
