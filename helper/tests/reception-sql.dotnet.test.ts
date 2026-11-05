// 접수 현황 비트 문장(TASK-1, REQ-1403·REQ-1404)의 C# 시험(helper/tests/Precheck.Core.Tests/Reception/ReceptionSql.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.Reception.ReceptionSqlTests'
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

describe('REQ-1403·REQ-1404 접수 현황 비트 문장 (C# Precheck.Core.Tests.Reception.ReceptionSqlTests)', () => {
  it('AC-1403.1 설계 표의 문장 7개는 모두 매개변수를 받는 SELECT 하나이고 Sql.IsAllowed가 받으며, 정해 둔 매개변수 표와 함께만 ReadOnlyGuard를 지난다. 내원은 병원 범위 안에서만, 칸은 이 저장소에 이미 쓰인 것만 읽는다', () => {
    expectAc('AC-1403.1')
  })

  it('AC-1403.7 처방 이름표(RxNames)는 SeeMst에서 코드마다 적용일이 가장 늦은 이름 한 줄이다(RevenueSql과 같은 규칙)', () => {
    expectAc('AC-1403.7')
  })

  it('AC-1404.6 OFFSET·FETCH 없이 ROW_NUMBER()로 자르고(SQL Server 2008 R2), 차트번호 칸은 함수 없이 견준다', () => {
    expectAc('AC-1404.6')
  })
})
