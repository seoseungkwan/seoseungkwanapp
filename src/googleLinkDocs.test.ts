import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 구글 시트·캘린더 잇기 문서 시험 (specs/google-link REQ-8501 AC-8501.1~3, tasks.md TASK-1, design.md 1·16~18절).
// 문서를 글자로 읽는다(src/lib/notices/ruleAutoDocs.test.ts와 같은 틀). ADR 글·CLAUDE.md 두 줄은 design.md 16·17절에서
// 그대로 읽어 견주고(옮겨 적기 실수를 잡으려고), 짧은 줄과 지금 CRITICAL 줄은 이 파일에 적어 둔다.
// 뒤에 ADR-056 같은 새 글이 붙어도 깨지지 않게 'ADR-055가 맨 끝'은 보지 않는다
const ROOT = process.cwd()
// 줄바꿈이 CRLF로 받아져도 같은 글로 본다
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')
const DESIGN = 'specs/google-link/design.md'

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
// 제목 줄이 `## 앞글자`로 시작하는 절의 본문(다음 '## ' 앞까지). 없으면 ''
function sectionStarting(doc: string, start: string): string {
  const head = doc.indexOf(`\n## ${start}`)
  if (head === -1) return ''
  const body = doc.slice(doc.indexOf('\n', head + 1) + 1)
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
// 절 안 첫 번째 ``` 묶음의 글. 없으면 ''
const codeBlock = (body: string) => body.split('```')[1] ?? ''

const NEW_NUMBERS = ['052', '053', '054', '055'] as const
// design.md 16절 제목 그대로
const NEW_TITLES: Record<(typeof NEW_NUMBERS)[number], string> = {
  '052': '수납일지 구글 시트 — 도우미가 비트 수납 줄을 그 병원 구글 시트로 바로 보낸다 (환자 개인정보 예외 · ADR-016·020을 넓힘)',
  '053': "예약 탭 ↔ 병원 구글 캘린더 양쪽 맞춤 (ADR-030 '구글 캘린더 대신'을 '구글 캘린더와 함께'로 넓힘)",
  '054': '구글 코드 두 벌 · 비밀 글자 자리 · 캘린더 고급 서비스 · CSP',
  '055': '예약 색 = 구글 일정 11색 + 캘린더 기본 색 · 칸 꽉 채움 · 시작 5분 · 시행자 없는 지난 예약 (calendar-colors 20색을 대체)',
}
// design.md 16절의 그 ADR 글(제목 줄부터 다음 ADR 제목·17절 앞까지, 끝 빈 줄 뺌)
const designAdr = (no: string) => adrSection(sectionStarting(read(DESIGN), '16. ADR 글'), no).trimEnd()

// 이 TASK 전 docs/ADR.md 제목 번호(023·027·050은 원래 없다)
const ADR_NUMBERS_BEFORE = [
  '001', '002', '003', '004', '005', '006', '007', '008', '009', '010',
  '011', '012', '013', '014', '015', '016', '017', '018', '019', '020',
  '021', '022', '024', '025', '026', '028', '029', '030', '031', '032',
  '033', '034', '035', '036', '037', '038', '039', '040', '041', '042',
  '043', '044', '045', '046', '047', '048', '049', '051',
]
const ADR030_TITLE_BEFORE = '예약 탭은 환자 이름·차트번호를 서버에 저장한다 (구글 캘린더 대신)'
const WIDENED_BY_053 = ' (ADR-053이 넓힘)'

// design.md 17절의 CLAUDE.md 두 줄('- 예외 ('로 시작하는 줄)
const designClaudeLines = () =>
  sectionStarting(read(DESIGN), '17. CLAUDE.md 두 줄')
    .split('\n')
    .filter((line) => line.startsWith('- 예외 ('))
const CLAUDE_052_START = '- 예외 (ADR-052): 수납일지 구글 시트(`specs/google-link`)만 — '
const CLAUDE_053_START = '- 예외 (ADR-053): 예약 구글 캘린더(`specs/google-link`)만 — '
// 이 TASK 전 CLAUDE.md 예외 줄(':' 앞까지, 차례 그대로)
const EXCEPTIONS_BEFORE = [
  '- 예외 (ADR-028)',
  '- 예외 (ADR-029)',
  '- 예외 (ADR-030)',
  '- 예외 (ADR-034)',
  '- 예외 (ADR-036~038)',
  '- 예외 (ADR-040)',
  '- 예외 (ADR-043~045)',
  '- 예외 (ADR-046·047)',
]
// 이 TASK 전 CLAUDE.md의 CRITICAL 줄 열하나(글자 그대로, 차례 그대로)
const CRITICAL_LINES = [
  "- CRITICAL: 환자 개인정보는 의원 PC 밖으로 나가지 않는다. 환자 파일은 브라우저 Web Worker 안에서만 읽고 계산한다. 비트 자료는 도우미 → 확장 → `lib/bridge` → Worker로만 오고, 고치던 메모·완료 표시·정기 주사 기록은 도우미가 그 PC에 암호화해 둔다. 서버·Claude API에는 집계 숫자만 간다(청구는 건수 표의 숫자와 설정만, ADR-021). 읽는 칸·차트번호·파일 이름 규칙은 `plan.md §4`",
  "- CRITICAL: `lib/parsers`·`lib/analytics`·`lib/payload`·`lib/precheck`·`lib/sunap`·`lib/calendar`·`lib/bridge`·`workers`는 환자 자료 구역이다. 네트워크·console·브라우저 저장소·React/Next/supabase/auth import를 쓰지 않는다. `lib/bridge`(비트 자료 통로)는 정해 둔 확장 ID 상수로만 확장과 말하고, 받은 조각을 바로 Worker로 넘긴다. 환자 줄을 그리는 `components/claim/rows`·`components/patients/rows`·`components/calendar/rows`도 네트워크·저장소·console·supabase를 못 쓴다. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 규칙을 풀지 않는다 (ADR-020)",
  "- CRITICAL: 서버 코드는 `app/api/ai/` 하나뿐이다. 나머지는 브라우저 + Supabase RLS. 예외는 인증뿐이다: 로그인 콜백·middleware·페이지 guard(`*.server.ts`)는 세션과 내 병원·관리자·데스크 줄, 병원 정보 이름, 관리자만 보는 탭 목록(공용 표 `tab_access`), 관리자가 이 브라우저에서 보는 의원(보기 쿠키가 있을 때 `my_admin_view()` 한 줄)만 읽고 쓰지 않는다 (ADR-004·ADR-031·ADR-033·ADR-042·ADR-046)",
  "- CRITICAL: AI 경로는 브라우저가 보낸 숫자를 쓰지 않는다. 서버가 DB에서 읽어 `validate.ts`로 검사한 집계만 보낸다. 답은 글자로만 그린다(HTML 금지) (`plan.md §6-2`)",
  "- CRITICAL: 비밀값(Supabase 키·`ANTHROPIC_API_KEY`·토큰)은 `.env.local`과 서버 환경 변수에만 둔다. 커밋·로그·출력·채팅 붙여넣기를 하지 않는다. `NEXT_PUBLIC_*`에 비밀값을 넣지 않는다. service role 키는 두지 않는다 (`plan.md §5`)",
  "- CRITICAL: DB 표는 모두 RLS를 켠다. 기본 권한을 먼저 모두 회수(revoke)한 뒤 필요한 것만 준다(Supabase는 새 표에 `anon`·`authenticated` 권한을 기본으로 준다). 사용자는 자기 권한·승인 상태·소유자를 바꿀 수 없다. 이 규칙은 시험으로 증명한다",
  "- CRITICAL: 앱 코드에 시험용 로그인·인증 우회 길을 만들지 않는다. E2E 로그인은 시험 코드가 세션 쿠키를 넣는다. 시험 계정은 `.env.local`에만",
  "- CRITICAL: 실제 환자 파일(비트 내보내기)은 커밋하지 않는다. 시험은 `fixtures/`의 가짜 파일만 쓴다",
  "- CRITICAL: 새 기능은 `/sdd`로 명세(`specs/<기능ID>/`)를 쓰고 승인된 뒤에만 구현한다 (SDD). 승인은 사용자가 `/sdd approve <기능ID>`를 입력하거나, 사용자가 `SDD-AUTO-ON`으로 켠 저장소에서 `harness-reviewer` 명세 검토 PASS 뒤 `sdd approve <기능ID>`로 자동 기록한다 (2026-10-30 사용자 결정)",
  "- CRITICAL: 테스트를 먼저 쓰고 실패(RED)를 확인한 뒤 구현한다 (TDD, `/tdd`). 테스트 이름에 AC ID(AC-001.1 등)를 넣는다",
  "- CRITICAL: 화면은 클릭 목업을 사용자가 승인한 뒤에만 구현한다. 승인 전에는 화면 코드를 만들지 않는다 (`plan.md §3·§9`)",
]

// design.md 18절 글 그대로(백틱 안 글)
const PLAN_SEC4_LINE =
  '- 병원 구글 계정으로 가는 것(ADR-052·053, specs/google-link): 수납일지 시트(도우미가 이름·차트번호·기호·금액을 바로 넣음, 서버에는 숫자·설정만) · 예약 캘린더(예약 줄 이름·차트번호·종류·시행자·메모, 브라우저가 맞춤, 비밀 글자는 gcal_links)'
const DB_ROW =
  '| gcal_links · gcal_state · gcal_fixes · gcal_deletes · gcal_off_days · gsheet_settings · gsheet_months · gsheet_runs | 구글 캘린더·시트 잇기(ADR-052~054) |'
// design.md 1절 그림의 두 줄(수납일지·예약 길)
const SHEET_FLOW = "비트 DB ──읽기만──> 도우미 0.14.0 ──HTTPS(주소 HMAC 확인)──> 수납 구글 코드 ──> 그 달 '일일 수납일지' 파일"
const CAL_FLOW = '웹앱 브라우저 (lib/gcal) <──fetch(text/plain, 비밀 글자)──> 예약 구글 코드 ──> 고른 캘린더 하나'

describe('AC-8501.1: docs/ADR.md 끝 ADR-052~055 · ADR-030 제목 꼬리', () => {
  const doc = () => read('docs/ADR.md')

  it('AC-8501.1: design 16절 찾기 자체가 맞다 — 넷 모두 제목이 시험 글과 같고, 결정·트레이드오프가 있고, 다른 ADR 제목을 잡지 않는다', () => {
    for (const no of NEW_NUMBERS) {
      const body = designAdr(no)
      expect(body, no).not.toBe('')
      expect(body.split('\n')[0], no).toBe(`### ADR-${no}: ${NEW_TITLES[no]}`)
      expect(body.slice(body.indexOf('\n') + 1), no).not.toMatch(/^##+ /m)
      for (const label of ['**결정**', '**트레이드오프**: ']) expect(body, `${no} ${label}`).toContain(label)
    }
  })

  it.each(NEW_NUMBERS)('AC-8501.1: ADR-%s 제목이 한 번 있고 design 16절 제목 그대로다', (no) => {
    const found = titles(doc()).filter(([n]) => n === no)
    expect(found).toHaveLength(1)
    expect(found[0]![1]).toBe(NEW_TITLES[no])
  })

  it.each(NEW_NUMBERS)('AC-8501.1: ADR-%s 절은 design 16절 글 그대로다', (no) => {
    const body = adrSection(doc(), no)
    expect(body).not.toBe('')
    expect(body.trimEnd()).toBe(designAdr(no))
  })

  it('AC-8501.1: 넷은 지금 끝(ADR-051) 바로 뒤에 052·053·054·055 차례로 붙고, 앞 ADR 번호는 그대로다', () => {
    const numbers = titles(doc()).map(([no]) => no)
    expect(numbers.filter((no) => Number(no) < 52)).toEqual(ADR_NUMBERS_BEFORE)
    expect(numbers.slice(ADR_NUMBERS_BEFORE.length, ADR_NUMBERS_BEFORE.length + 4)).toEqual([...NEW_NUMBERS])
    const at051 = adrSection(doc(), '051')
    expect(at051).not.toBe('')
    const after051 = doc().slice(doc().indexOf(at051) + at051.length)
    expect(after051.startsWith('### ADR-052: ')).toBe(true)
    // 넷 사이에는 다른 글이 끼지 않는다(앞 ADR 끝 빈 줄 하나 뒤 바로 다음 제목)
    for (const [prev, next] of [['052', '053'], ['053', '054'], ['054', '055']] as const) {
      const body = adrSection(doc(), prev)
      expect(doc().slice(doc().indexOf(body) + body.length).startsWith(`### ADR-${next}: `), `${prev}→${next}`).toBe(true)
      expect(body.endsWith('\n\n'), prev).toBe(true)
    }
  })

  it('AC-8501.1: ADR-030 제목 줄 끝에 (ADR-053이 넓힘)이 붙고, 그 꼬리는 문서 전체에서 그 줄 하나다', () => {
    const found = titles(doc()).filter(([no]) => no === '030')
    expect(found).toHaveLength(1)
    expect(found[0]![1]).toBe(ADR030_TITLE_BEFORE + WIDENED_BY_053)
    expect(doc().split('\n').filter((line) => line.includes('(ADR-053이 넓힘)'))).toEqual([
      `### ADR-030: ${ADR030_TITLE_BEFORE}${WIDENED_BY_053}`,
    ])
  })

  it('AC-8501.1: ADR-030 본문(제목 아래)은 ADR-052~055를 가리키지 않는다 — 제목 꼬리만 바뀐다', () => {
    const body = adrSection(doc(), '030')
    expect(body).not.toBe('')
    const rest = body.slice(body.indexOf('\n') + 1)
    for (const no of NEW_NUMBERS) expect(rest, no).not.toContain(`ADR-${no}`)
    expect(rest.startsWith('**맥락**: 의원은 공용 구글 캘린더에 예약')).toBe(true)
  })
})

describe('AC-8501.2: CLAUDE.md 아키텍처 규칙의 예외 (ADR-052)·(ADR-053) 두 줄', () => {
  const lines = () => read('CLAUDE.md').split('\n')

  it('AC-8501.2: design 17절 찾기 자체가 맞다 — 예외 줄이 둘이고 052·053 차례다', () => {
    const design = designClaudeLines()
    expect(design).toHaveLength(2)
    expect(design[0]!.startsWith(CLAUDE_052_START)).toBe(true)
    expect(design[1]!.startsWith(CLAUDE_053_START)).toBe(true)
  })

  it("AC-8501.2: '예외 (ADR-046·047)' 줄 바로 아래에 design 17절 두 줄이 글자 그대로 차례대로 있다", () => {
    const at046 = lines().findIndex((line) => line.startsWith('- 예외 (ADR-046·047): '))
    expect(at046).toBeGreaterThan(-1)
    expect(lines().slice(at046 + 1, at046 + 3)).toEqual(designClaudeLines())
  })

  it('AC-8501.2: 두 줄은 아키텍처 규칙 절 안에 있고, ADR-052·053을 적은 줄은 CLAUDE.md 전체에서 그 둘뿐이다', () => {
    const [line052, line053] = designClaudeLines()
    const rules = sectionStarting(read('CLAUDE.md'), '아키텍처 규칙')
    expect(rules).not.toBe('')
    expect(rules.split('\n')).toContain(line052)
    expect(rules.split('\n')).toContain(line053)
    expect(lines().filter((line) => line.includes('ADR-052'))).toEqual([line052])
    expect(lines().filter((line) => line.includes('ADR-053'))).toEqual([line053])
  })

  it('AC-8501.2: 예외 줄은 지금 여덟 줄 그대로에 새 두 줄만 더해진다(차례 그대로)', () => {
    const heads = lines()
      .filter((line) => line.startsWith('- 예외 ('))
      .map((line) => line.slice(0, line.indexOf(':')))
    expect(heads).toEqual([...EXCEPTIONS_BEFORE, '- 예외 (ADR-052)', '- 예외 (ADR-053)'])
  })

  it('AC-8501.2: CRITICAL 줄 열하나는 지금 글과 한 글자도 다르지 않다(차례도 그대로)', () => {
    expect(CRITICAL_LINES).toHaveLength(11)
    expect(lines().filter((line) => line.includes('CRITICAL'))).toEqual(CRITICAL_LINES)
  })
})

describe('AC-8501.3: plan.md §4·§5와 docs/ARCHITECTURE.md의 design 18절 줄', () => {
  const plan = () => read('plan.md')
  const arch = () => read('docs/ARCHITECTURE.md')

  it('AC-8501.3: 시험 안 글이 design 18절·1절 글 그대로다(옮겨 적기 실수 잡기)', () => {
    const sec18 = sectionStarting(read(DESIGN), '18. 문서 줄')
    expect(sec18).not.toBe('')
    expect(sec18).toContain(`\`${PLAN_SEC4_LINE}\``)
    expect(sec18).toContain(`\`${DB_ROW}\``)
    const picture = codeBlock(sectionStarting(read(DESIGN), '1. 개요'))
      .split('\n')
      .map((line) => line.trim())
    expect(picture).toContain(SHEET_FLOW)
    expect(picture).toContain(CAL_FLOW)
  })

  it("AC-8501.3: plan.md §4 '서버로 가는 것' 바로 다음 줄이 '병원 구글 계정으로 가는 것'(수납일지 시트·예약 캘린더) 줄이다", () => {
    const body = sectionStarting(plan(), '4. 개인정보·데이터 규칙').split('\n')
    const atServer = body.findIndex((line) => line.startsWith('- 서버(Supabase, 서울)로 가는 것: '))
    expect(atServer).toBeGreaterThan(-1)
    expect(body[atServer + 1]).toBe(PLAN_SEC4_LINE)
    expect(plan().split('\n').filter((line) => line.includes('병원 구글 계정으로 가는 것'))).toEqual([PLAN_SEC4_LINE])
    for (const word of ['수납일지 시트', '예약 캘린더']) expect(PLAN_SEC4_LINE, word).toContain(word)
  })

  it('AC-8501.3: plan.md §5 DB 표에 새 표 여덟 줄이 표 안에 한 번 있다', () => {
    const table = subsectionStarting(plan(), 'DB 표 (Claude 판단)').split('\n')
    const at = table.indexOf(DB_ROW)
    expect(at).toBeGreaterThan(-1)
    expect(table.filter((line) => line === DB_ROW)).toHaveLength(1)
    expect(table[at - 1]!.startsWith('| ')).toBe(true)
  })

  it('AC-8501.3: ARCHITECTURE 디렉토리 구조에 lib/gcal·lib/gsheet(lib 아래)와 google-code/(저장소 바로 아래)가 design 18절 설명으로 있다', () => {
    const tree = codeBlock(sectionStarting(arch(), '디렉토리 구조')).split('\n')
    expect(tree.length).toBeGreaterThan(1)
    const atLib = tree.findIndex((line) => line.startsWith('├── lib/'))
    const atComponents = tree.findIndex((line) => line.startsWith('├── components/'))
    expect(atLib).toBeGreaterThan(-1)
    expect(atComponents).toBeGreaterThan(atLib)
    const libLines = tree.slice(atLib + 1, atComponents)
    const gcal = libLines.filter((line) => /^│ {3}├── gcal\/ +# /.test(line))
    expect(gcal).toHaveLength(1)
    expect(gcal[0]).toContain('# 예약 맞춤, fetch는 client.ts만')
    const gsheet = libLines.filter((line) => /^│ {3}├── gsheet\/ +# /.test(line))
    expect(gsheet).toHaveLength(1)
    expect(gsheet[0]).toContain('# 수납 넣기 계획·돌리기, 환자 자료 없음')
    const code = tree.filter((line) => /^google-code\/ +# /.test(line))
    expect(code).toHaveLength(1)
    expect(code[0]).toContain('# 구글 코드 두 벌·시험')
  })

  it('AC-8501.3: ARCHITECTURE 데이터 흐름에 1절 그림의 두 줄(수납일지 시트·예약 캘린더)이 [ ] 흐름 줄로 한 번씩 있다', () => {
    const flow = codeBlock(sectionStarting(arch(), '데이터 흐름')).split('\n')
    expect(flow.length).toBeGreaterThan(1)
    const sheet = flow.filter((line) => line.includes(SHEET_FLOW))
    expect(sheet).toHaveLength(1)
    expect(sheet[0]!.startsWith('[수납일지 시트] ')).toBe(true)
    expect(sheet[0]).toContain('ADR-052')
    const cal = flow.filter((line) => line.includes(CAL_FLOW))
    expect(cal).toHaveLength(1)
    expect(cal[0]!.startsWith('[예약 캘린더] ')).toBe(true)
    expect(cal[0]).toContain('ADR-053')
  })

  it('AC-8501.3: ARCHITECTURE DB 표에 새 표 여덟 줄(plan §5와 같은 글)이 표 안에 한 번 있다', () => {
    const table = sectionStarting(arch(), 'DB 표 (§5)').split('\n')
    const at = table.indexOf(DB_ROW)
    expect(at).toBeGreaterThan(-1)
    expect(table.filter((line) => line === DB_ROW)).toHaveLength(1)
    expect(table[at - 1]!.startsWith('| ')).toBe(true)
  })
})
