import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 재고 탭 문서 시험 (specs/inventory REQ-7513 AC-7513.1, tasks.md TASK-16, design.md 1·5·7절).
// 문서를 글자로 읽는다. ADR-028·029 줄 시험(src/lib/forms/rules.test.ts·guideDocs.test.ts·backgroundDocs.test.ts)은
// 그대로 두고, 이 파일은 ADR-034와 재고 줄만 본다
const ROOT = process.cwd()
// 줄바꿈이 CRLF로 받아져도 같은 글로 본다
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const ADR_TITLE = /^### ADR-(\d{3}): (.+)$/gm
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
// '### 제목' 절의 본문(다음 '### '·'## ' 앞까지). 없으면 ''
function subsection(doc: string, title: string): string {
  const head = doc.indexOf(`\n### ${title}\n`)
  if (head === -1) return ''
  const body = doc.slice(head + `\n### ${title}\n`.length)
  const next = body.search(/^##+ /m)
  return next === -1 ? body : body.slice(0, next)
}
// 표 줄('| '로 시작) 가운데 첫 칸에 `이름`이 든 줄
const rowsNaming = (body: string, name: string) =>
  body.split('\n').filter((line) => line.startsWith('| ') && (line.split('|')[1] ?? '').includes(`\`${name}\``))
const lineWith = (body: string, word: string) => body.split('\n').find((line) => line.includes(word)) ?? ''

const INVENTORY_TABLES = [
  'inventory_categories',
  'inventory_items',
  'inventory_counts',
  'inventory_count_lines',
  'inventory_receipts',
  'inventory_receipt_lines',
  'inventory_aliases',
] as const
const MIGRATION = '20261121100000_inventory.sql'
const DOCS = ['docs/ADR.md', 'docs/ARCHITECTURE.md', 'plan.md', 'CLAUDE.md'] as const

describe('AC-7513.1: docs/ADR.md ADR-034 — 재고 탭은 거래명세서 사진과 엑셀 머리 줄을 Claude로 보낸다', () => {
  const adr034 = () => adrSection(read('docs/ADR.md'), '034')

  it("AC-7513.1: '재고'·'거래명세서 사진'·'엑셀 머리 줄'이 든 제목의 ADR-034가 한 번 있다", () => {
    const titles = [...read('docs/ADR.md').matchAll(ADR_TITLE)].filter((m) => m[1] === '034')
    expect(titles).toHaveLength(1)
    for (const word of ['재고', '거래명세서 사진', '엑셀 머리 줄', 'Claude', '환자 정보 없음']) expect(titles[0]![2], word).toContain(word)
  })

  it('AC-7513.1: 2026-11-21 사용자 결정·두 경로·보내는 것(줄인 JPEG·물품 이름·단위, 머리 줄 30칸·앞 줄 5개·40자)을 적는다', () => {
    const body = adr034()
    for (const word of [
      '2026-11-21',
      '사용자',
      'specs/inventory',
      'app/api/ai/inventory/invoice',
      'app/api/ai/inventory/columns',
      '1,600px',
      '4,000,000자',
      '물품 이름·단위',
      '30칸',
      '앞 줄 5개',
      '40자',
    ]) {
      expect(body, word).toContain(word)
    }
  })

  it('AC-7513.1: 개인정보 모양 거부·원장만(데스크 아님)·로그는 오류 번호·경로만·ai_usage·사진은 비공개 Storage inventory-photos', () => {
    const body = adr034()
    for (const word of ['전화', '주민번호', '메일', '데스크 아님', '오류 번호·경로만', 'ai_usage', '`inventory-photos`', '3,000,000바이트']) {
      expect(body, word).toContain(word)
    }
    expect(body).toContain('앱 양식 그대로인 엑셀은 AI를 부르지 않는다')
    expect(body).toContain('서버는 사진을 저장하지 않는다')
  })

  it('AC-7513.1: 덧붙임 — plan.md §10 유효기간만 다시 꺼내고 단위 변환은 그대로 미룬다', () => {
    const line = lineWith(adr034(), '덧붙임')
    for (const word of ['§10', '유효기간', '다시 꺼낸다', '단위 변환', '미룬다']) expect(line, word).toContain(word)
  })

  it('AC-7513.1: ADR-034 찾기 자체가 맞다(다른 ADR 글을 잡지 않는다)', () => {
    const body = adr034()
    expect(body.startsWith('### ADR-034: ')).toBe(true)
    expect(body.slice(1)).not.toMatch(/^### ADR-/m)
  })
})

describe("AC-7513.1: docs/ARCHITECTURE.md 'Claude API로 가는 것' 줄", () => {
  const claudeLines = () =>
    read('docs/ARCHITECTURE.md')
      .split('\n')
      .filter((line) => line.startsWith('- Claude API로 가는 것'))

  it('AC-7513.1: 줄은 하나이고 ADR-028 예외는 그대로, ADR-034 예외(명세서 사진·엑셀 머리 줄)가 더해졌다', () => {
    const lines = claudeLines()
    expect(lines).toHaveLength(1)
    const line = lines[0]!
    for (const word of ['ADR-028', 'ADR-034', '거래명세서 사진', '물품 이름·단위', '엑셀 머리 줄', '앞 줄 5개', '환자 정보는 보내지 않는다']) {
      expect(line, word).toContain(word)
    }
  })

  it("AC-7513.1: '예외는 서식 AI 정리 하나다'처럼 예외가 하나라고 적지 않는다", () => {
    expect(claudeLines()[0]).not.toContain('하나다')
  })
})

describe('AC-7513.1: docs/ARCHITECTURE.md DB 표 — 재고 표 일곱과 Storage inventory-photos', () => {
  const table = () => section(read('docs/ARCHITECTURE.md'), 'DB 표 (§5)')

  it.each(INVENTORY_TABLES)('AC-7513.1: DB 표에 %s 줄이 하나 있다', (name) => {
    expect(table()).not.toBe('')
    expect(rowsNaming(table(), name)).toHaveLength(1)
  })

  it('AC-7513.1: 재고 줄은 원장만 쓰고 데스크 정책이 없다고 적고, 지금 수량은 DB 함수만 고친다고 적는다', () => {
    const rows = INVENTORY_TABLES.flatMap((name) => rowsNaming(table(), name)).join('\n')
    for (const word of ['원장만', '데스크 정책 없음', 'DB 함수', 'save_inventory_count', 'save_inventory_receipt', 'specs/inventory']) {
      expect(rows, word).toContain(word)
    }
  })

  it('AC-7513.1: Storage inventory-photos 줄이 있다(공개 아님·3,000,000바이트·image/jpeg·내 병원 폴더·고치기 없음·migration·ADR-034)', () => {
    const line = table()
      .split('\n')
      .filter((l) => l.includes('Storage') && l.includes('`inventory-photos`'))
    expect(line).toHaveLength(1)
    for (const word of ['공개 아님', '3,000,000바이트', '`image/jpeg`', '첫 폴더가 내 병원 id', '고치기 없음', MIGRATION, 'ADR-034']) {
      expect(line[0], word).toContain(word)
    }
  })
})

describe('AC-7513.1: docs/ARCHITECTURE.md 디렉토리 구조 — 재고 폴더와 배포 전 SQL', () => {
  const tree = () => section(read('docs/ARCHITECTURE.md'), '디렉토리 구조')

  it('AC-7513.1: lib/inventory·components/inventory·app/api/ai/inventory 자리가 적혀 있다', () => {
    expect(tree()).not.toBe('')
    for (const place of ['lib/inventory', 'components/inventory', 'app/api/ai/inventory']) expect(tree(), place).toContain(place)
  })

  it('AC-7513.1: 그림(코드 상자)에 두 경로·순수 함수·저장·화면·대시보드 재고 칸 자리가 있다', () => {
    const block = tree().split('```')[1] ?? ''
    for (const place of [
      'inventory/invoice/route.ts',
      'inventory/columns/route.ts',
      '(app)/inventory/page.tsx',
      'inventory.ts = ',
      'dashboard/inventory/',
    ]) {
      expect(block, place).toContain(place)
    }
    expect(block.split('\n').some((l) => /^│ {3}├── inventory\/ +# /.test(l)), 'lib/inventory 줄').toBe(true)
  })

  it("AC-7513.1: '- 재고 탭' 줄 하나가 폴더·저장·경로·migration과 '사이트 올리기 전 SQL Editor' 안내를 적는다", () => {
    const lines = tree()
      .split('\n')
      .filter((l) => l.startsWith('- 재고 탭'))
    expect(lines).toHaveLength(1)
    for (const word of [
      '`components/inventory/`',
      '`components/dashboard/inventory/`',
      '`lib/inventory/`',
      '`lib/storage/inventory.ts`',
      '`app/api/ai/inventory/`',
      `\`supabase/migrations/${MIGRATION}\``,
      '사이트 올리기 전',
      'SQL Editor',
      'Private',
      '데스크',
      'ADR-034',
      'specs/inventory/design.md',
    ]) {
      expect(lines[0], word).toContain(word)
    }
  })
})

describe('AC-7513.1: docs/ARCHITECTURE.md 데이터 흐름 [재고]', () => {
  const flow = () => section(read('docs/ARCHITECTURE.md'), '데이터 흐름').split('```')[1] ?? ''
  // [재고] 줄부터 다음 '[' 줄 앞까지
  const inventoryFlow = () => {
    const lines = flow().split('\n')
    const start = lines.findIndex((l) => l.startsWith('[재고]'))
    if (start === -1) return ''
    const end = lines.findIndex((l, i) => i > start && l.startsWith('['))
    return lines.slice(start, end === -1 ? undefined : end).join('\n')
  }

  it('AC-7513.1: [재고] 흐름은 저장·두 AI 경로·사진 Storage·비트 코드(stats_months에서 읽음)를 적는다', () => {
    const body = inventoryFlow()
    expect(body).not.toBe('')
    for (const word of [
      'lib/storage/inventory.ts',
      'app/api/ai/inventory/invoice',
      'app/api/ai/inventory/columns',
      'inventory-photos',
      'save_inventory_receipt',
      'stats_months',
      'payload->rx',
      'ADR-034',
    ]) {
      expect(body, word).toContain(word)
    }
  })

  it('AC-7513.1: [재고] 흐름은 양식 엑셀은 AI 없이, 보내기 전 개인정보 모양 검사, 비트 코드는 서버 경로·Claude로 가지 않는다고 적는다', () => {
    const body = inventoryFlow()
    for (const word of ['AI 없이', '개인정보 모양 검사', 'Claude로 가지 않음']) expect(body, word).toContain(word)
  })

  it('AC-7513.1: [입력] 줄에서 재고는 빠졌다(제 줄 [재고]로 옮김)', () => {
    const input = flow()
      .split('\n')
      .find((l) => l.startsWith('[입력]'))
    expect(input).toBeDefined()
    expect(input).not.toContain('재고')
  })
})

// CLAUDE.md 아키텍처 규칙의 ADR-034 예외 줄(ADR-030 줄 바로 밑)
describe('AC-7513.1: CLAUDE.md 아키텍처 규칙의 ADR-034 예외 줄', () => {
  it('AC-7513.1: ADR-034를 가리키는 줄이 하나이고 경로·명세서 사진·엑셀 머리 줄·Storage·원장만을 적는다', () => {
    const rules = section(read('CLAUDE.md'), '아키텍처 규칙')
    expect(rules).not.toBe('')
    const lines = rules.split('\n').filter((line) => line.includes('ADR-034'))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^- 예외 \(ADR-034\): /)
    for (const word of [
      '`app/api/ai/inventory/invoice`',
      '`columns`',
      '거래명세서 사진',
      '엑셀 머리 줄',
      '앞 줄 5개',
      '개인정보 모양',
      '환자 정보',
      '`inventory-photos`',
      '원장만',
    ]) {
      expect(lines[0], word).toContain(word)
    }
  })

  it('AC-7513.1: ADR-034 줄은 ADR-030 줄 바로 밑이고, CLAUDE.md 전체에서 하나다', () => {
    const lines = read('CLAUDE.md').split('\n')
    const at030 = lines.findIndex((line) => line.startsWith('- 예외 (ADR-030): '))
    expect(at030).toBeGreaterThan(-1)
    expect(lines[at030 + 1]).toMatch(/^- 예외 \(ADR-034\): /)
    expect(lines.filter((line) => line.includes('ADR-034'))).toHaveLength(1)
  })
})

describe('AC-7513.1: plan.md §2-5·§4·§5 DB 표·§10이 새 결정과 같다', () => {
  const plan = () => read('plan.md')

  it('AC-7513.1: §2-5 재고는 2026-11-21 결정(세기·명세서 사진·엑셀·알림 둘·쓴 양·원장만·ADR-034)이다', () => {
    const body = subsection(plan(), '2-5. 재고')
    expect(body).not.toBe('')
    for (const word of [
      '2026-11-21',
      'specs/inventory',
      '쓴 것은 적지 않는다',
      '매주 한 번',
      '세기',
      '거래명세서 사진',
      '엑셀',
      '비트 처방 코드',
      "'주문하세요'",
      "'기한 가까움'",
      '대시보드',
      '저장 순서',
      '원장만',
      'ADR-034',
    ]) {
      expect(body, word).toContain(word)
    }
    // 옛 결정(사용도 적는다)은 남지 않는다
    expect(body).not.toContain('입고·사용·실사를 직접 입력한다')
  })

  it("AC-7513.1: §4 'Claude API로 가는 것' 줄에 ADR-034 예외(명세서 사진·엑셀 머리 줄)가 있다", () => {
    const lines = section(plan(), '4. 개인정보·데이터 규칙')
      .split('\n')
      .filter((l) => l.startsWith('- Claude API로 가는 것'))
    expect(lines).toHaveLength(1)
    for (const word of ['집계', 'ADR-028', 'ADR-034', '거래명세서 사진', '엑셀 머리 줄', '환자 정보 없음']) expect(lines[0], word).toContain(word)
  })

  it.each(INVENTORY_TABLES)('AC-7513.1: §5 DB 표 첫 칸에 %s가 있다', (name) => {
    const table = subsection(plan(), 'DB 표 (Claude 판단)')
    expect(table).not.toBe('')
    expect(rowsNaming(table, name)).toHaveLength(1)
  })

  it('AC-7513.1: §5 DB 표 재고 줄은 Storage inventory-photos·원장만·ADR-034를 적는다', () => {
    const table = subsection(plan(), 'DB 표 (Claude 판단)')
    const rows = [...new Set(INVENTORY_TABLES.flatMap((name) => rowsNaming(table, name)))].join('\n')
    for (const word of ['`inventory-photos`', '원장만', 'ADR-034', 'specs/inventory']) expect(rows, word).toContain(word)
  })

  it("AC-7513.1: §10 '재고 단위 변환·유효기간' 밑에 유효기간만 다시 꺼냈다는 줄이 있다", () => {
    const lines = section(plan(), '10. 2차로 미룬 것').split('\n')
    const at = lines.findIndex((l) => l.includes('재고 단위 변환·유효기간'))
    expect(at).toBeGreaterThan(-1)
    const next = lines[at + 1] ?? ''
    expect(next).toMatch(/^ {4}- → 2026-11-21 /)
    for (const word of ['유효기간', '다시 꺼냄', '가장 빠른 것 하나', 'ADR-034', 'specs/inventory', '단위 변환', '미룸']) {
      expect(next, word).toContain(word)
    }
  })
})

describe('AC-7513.1: 옛 표 이름 inventory_moves는 어디에도 없다', () => {
  it.each(DOCS)('AC-7513.1: %s에 inventory_moves가 없다', (rel) => {
    expect(read(rel)).not.toContain('inventory_moves')
  })
})
