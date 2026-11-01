// 도우미 통계 줄 읽기 stats.rows(TASK-3, REQ-503)의 C# 시험을 감싼다.
// - Precheck.Core.Tests.Stats(통계 SQL 사본 대조·관문, 등록 확인 → 읽기 순서·매개변수, JSON 모양·조각, 오류만 보내기, 기록)
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
// 도우미 입구(Program.cs)에 stats.rows 처리기를 붙인 한 줄은 글자로 본다(Precheck.Helper는 net48이라 여기서 돌리지 않는다).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const PROGRAM = path.join(ROOT, 'helper', 'src', 'Precheck.Helper', 'Program.cs')
let run: { code: number; output: string } = { code: -1, output: '' }

beforeAll(() => {
  run = runDotnet('Precheck.Core.Tests.Stats', { timeoutMs: 280_000 })
}, 300_000)

function count(prefix: 'Passed' | 'Failed', ac: string): number {
  const escaped = ac.replace(/\./g, '\\.')
  const pattern = new RegExp(`^\\s*${prefix} ${escaped}\\b`, 'gm')
  return (run.output.match(pattern) ?? []).length
}

function tail(text: string): string {
  return text.split('\n').slice(-40).join('\n')
}

function expectAc(ac: string) {
  expect(run.code, tail(run.output)).toBe(0)
  expect(count('Failed', ac), tail(run.output)).toBe(0)
  expect(count('Passed', ac), `${ac} 시험이 돌지 않았다\n${tail(run.output)}`).toBeGreaterThan(0)
}

describe('REQ-503 도우미 통계 줄 읽기 stats.rows (C# Precheck.Core.Tests.Stats)', () => {
  it('AC-503.1 등록 확인 뒤 진료 줄·기간 합계·날짜별·처방 이름을 JSON 하나로 chunk … end에 보낸다(이름·전화 칸 없음)', () => {
    expectAc('AC-503.1')
  })

  // 이름공간까지 적은 한 줄: using 줄을 더하지 않아 합치기 자리가 이 한 줄뿐이다(cross-branch C4).
  // 컴파일되는지는 helper-fixups.dotnet.test.ts(AC-005.8)의 Precheck.Helper Release 빌드가 본다
  it('AC-503.1 도우미 입구는 지금 bit 명령 다음 줄에 stats.rows 처리기를 붙인다(한 줄)', () => {
    const lines = readFileSync(PROGRAM, 'utf8').split(/\r?\n/).map((line) => line.trim())
    const bit = lines.indexOf('BitCommands.Register(dispatcher, HelperServices.Create());')
    expect(bit).toBeGreaterThan(-1)
    expect(lines[bit + 1]).toBe('Precheck.Core.Stats.StatsCommands.Register(dispatcher, HelperServices.Create());')
    expect(lines.filter((line) => line.includes('StatsCommands'))).toHaveLength(1)
  })

  it('AC-503.2 StatsSql 상수는 원본 사본과 공백만 다르고(진료 줄은 처방 코드 거르기 한 덩어리만 뺌) ReadOnlyGuard를 지난다, Sql.All은 그대로', () => {
    expectAc('AC-503.2')
  })

  it('AC-503.3 과거 이관 자료 E-STATS-HISTORY · 700,000줄 넘음 E-STATS-TOO-BIG · SQL 실패 E-BIT-READ-FAILED를 반쪽 자료 없이 error만', () => {
    expectAc('AC-503.3')
  })

  it('AC-503.4 진단 기록에는 시각·명령 이름·오류 번호만(차트번호·처방코드·숫자 없음)', () => {
    expectAc('AC-503.4')
  })

  it('AC-503.5 접수 줄 PatientDaysSql은 Visits 글 + 정해 둔 SELECT(OdrInf 없음)로 VisitRowsSql 바로 다음에 돌고, 700,000줄 넘으면 E-STATS-TOO-BIG, 답은 v 2에 patientDays가 days 바로 뒤', () => {
    expectAc('AC-503.5')
  })
})
