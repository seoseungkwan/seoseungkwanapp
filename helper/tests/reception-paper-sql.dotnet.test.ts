// 종이 기록부 자료 문장(spec reception-paper TASK-2, REQ-1501)의 C# 시험(helper/tests/Precheck.Core.Tests/Reception/PaperSql.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// 이 TASK의 시험은 PaperSql 이름 공간에만 있다(같은 폴더의 다른 TASK 시험은 돌리지 않는다)
const FILTER = 'Precheck.Core.Tests.Reception.PaperSql.'
let run: { code: number; output: string } = { code: -1, output: '' }

beforeAll(() => {
  run = runDotnet(FILTER, { timeoutMs: 280_000 })
}, 300_000)

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

describe('REQ-1501 종이 기록부 자료 문장 (C# Precheck.Core.Tests.Reception.PaperSql)', () => {
  it('AC-1501.8 종이 자료 문장 다섯(PaperPerson·PaperVisit·PaperSymptoms·PaperDx·PaperOrders)은 매개변수를 받는 SELECT 상수이고 Sql.IsAllowed가 받으며 정해 둔 매개변수 표와 함께만 ReadOnlyGuard를 지난다. 내원 문장은 병원 범위 안, 차트번호는 함수 없이 =@chart, SQL Server 2008 R2 글(OFFSET·FETCH·STRING_AGG 없음), 주민번호는 앞 6자리만', () => {
    expectAc('AC-1501.8')
  })
})
