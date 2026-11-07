// 도우미 contact.targets(TASK-9, REQ-605)의 C# 시험(helper/tests/Precheck.Core.Tests/Contact/Read/*.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
// 비트 통계 화면은 가짜다. 실제 VendorGridExport로 비트 83·47 화면을 읽는 일은 Actions 윈도우가 아니라 의원 PC에서만 본다.
// 도우미 입구(Program.cs)에 contact.targets 처리기를 붙인 한 줄은 글자로 본다(C# 시험은 RegisterTargets를 바로 불러 그 줄이 빠져도 통과한다).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const PROGRAM = path.join(ROOT, 'helper', 'src', 'Precheck.Helper', 'Program.cs')
const FILTER = 'Precheck.Core.Tests.Contact.Read'
let run: { code: number; output: string } = { code: -1, output: '' }

// 시간에는 다른 작업 사본과 함께 쓰는 잠금을 기다리는 시간도 든다(contact-store 감싸개와 같은 까닭)
beforeAll(() => {
  run = runDotnet(FILTER, { timeoutMs: 300_000 })
}, 310_000)

function lines(prefix: 'Passed' | 'Failed', ac: string): number {
  const escaped = ac.replace(/\./g, '\\.')
  return (run.output.match(new RegExp(`^\\s*${prefix} ${escaped}\\b`, 'gm')) ?? []).length
}

function tail(text: string): string {
  return text.split('\n').slice(-40).join('\n')
}

function expectAc(ac: string) {
  expect(run.code, tail(run.output)).toBe(0)
  expect(lines('Failed', ac), tail(run.output)).toBe(0)
  expect(lines('Passed', ac), `${ac} 시험이 돌지 않았다\n${tail(run.output)}`).toBeGreaterThan(0)
}

describe('REQ-605 도우미 F/U·정기 주사 대상 읽기 (C# Precheck.Core.Tests.Contact.Read)', () => {
  it('AC-605.1 {kind, from, to} → 등록 확인 → 83 다섯 칸 + 47(F/U 차트번호·전화 / 정기 주사 처방코드·차트번호·처방일자·전화, 같은 줄 한 번)만 {v:1, kind, from, to, chart, rx}로 chunk … end, 전화 칸은 원본 phoneColumn, 웹 가짜 답과 같은 모양', () => {
    expectAc('AC-605.1')
  })

  // 합치다 등록 줄이 빠지면 C# 시험은 모두 통과하는데 진짜 도우미는 E-HELPER-UNKNOWN-COMMAND로 답한다. 그래서 줄을 글자로 묶는다.
  // 컴파일되는지는 input-wiring.dotnet.test.ts(AC-035.7)의 Precheck.Helper x86 net48 빌드가 본다
  it('AC-605.1 Program.cs는 메시지 고리 전에 contact.targets 처리기를 한 번 붙이고 store.*는 HelperStore가 맡는다', () => {
    const program = readFileSync(PROGRAM, 'utf8')
    // 주석으로 막은 줄은 붙인 것이 아니다: 앞뒤 공백만 지운 줄 전체가 같아야 센다
    const lines = program.split(/\r?\n/).map((text) => text.trim())
    const line = 'ContactCommands.RegisterTargets(dispatcher, HelperServices.Create());'
    expect(program.match(/ContactCommands\.RegisterTargets\(dispatcher, HelperServices\.Create\(\)\);/g)).toHaveLength(1)
    expect(lines.filter((text) => text === line)).toHaveLength(1)
    const targets = lines.indexOf(line)
    const store = lines.indexOf('HelperStore.Register(dispatcher);')
    const loop = lines.findIndex((text) => !text.startsWith('//') && text.includes('MessageLoop.Run('))
    expect(targets).toBeGreaterThan(-1)
    expect(targets).toBeLessThan(store)
    expect(store).toBeLessThan(loop)
    expect(program).not.toMatch(/RegisterStore\(/)
  })

  it('AC-605.2 31일 넘음·from > to·오늘 뒤 → 명령 표 1,100일 안이어도 E-HELPER-BAD-MESSAGE', () => {
    expectAc('AC-605.2')
  })

  it('AC-605.3 한 표 300,000줄 넘음 → E-BIT-READ-FAILED(자르지 않음), 꼭 있는 칸 없음·둘 → E-BIT-EXPORT-FAILED, 읽기 실패·시간 초과 → E-BIT-READ-FAILED, end 없이 error만', () => {
    expectAc('AC-605.3')
  })

  it('AC-605.4 실패해도 기록·예외 글에는 명령 이름·오류 번호만(이름·전화·차트번호·증상 없음)', () => {
    expectAc('AC-605.4')
  })
})

// spec patients-bit-lists: 같은 contact.targets의 새 종류 둘(예약 · 장기 미방문). 비트 SQL은 가짜 DB 답이라 문장의 뜻은 글자로 못 박는다.
// 실제 비트에서 숫자가 맞는지(내일 예약 수·지난 주 예약 수)는 새 도우미를 깐 뒤 의원 PC에서 본다(design.md '위험')
describe('REQ-2801 도우미 예약·장기 미방문 읽기 (C# Precheck.Core.Tests.Contact.Read)', () => {
  it('AC-2801.1 예약 {from, to}: from ≤ to·46일 이하·오늘−31일 ~ 오늘+14일이 아니면 비트를 건드리지 않고 E-HELPER-BAD-MESSAGE, 맞으면 등록 확인 뒤 SQL 하나로 {v:1, kind, from, to, today, rows}', () => {
    expectAc('AC-2801.1')
  })

  it('AC-2801.2 예약 줄 [차트번호|null, 이름|null, 전화, 예약 시각, 상태, 예약 표시|null, 그날 옴 0|1, 그 뒤 처음 온 날|null], RsvInf 예약 줄 또는 WR·NR·CR', () => {
    expectAc('AC-2801.2')
  })

  it('AC-2801.3 장기 미방문 {from, to}: to < 오늘·1,100일 이하, 2일 이상·마지막 내원 from~to 환자 줄 [차트번호, 이름, 전화, 마지막 내원일, 날 수, 예약 있음, 마지막 진료 처방 20개까지]', () => {
    expectAc('AC-2801.3')
  })

  it('AC-2801.4 전화는 휴대전화 → 집 전화 → 빈 글(앞뒤 빈칸 뺌), 주민번호·주소·메모는 읽지 않는다', () => {
    expectAc('AC-2801.4')
  })

  it('AC-2801.6 새 SQL은 매개변수를 받는 SELECT 하나이고 Sql.IsAllowed·ReadOnlyGuard를 지난다', () => {
    expectAc('AC-2801.6')
  })
})
