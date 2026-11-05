// 의원 PC 확인 명령의 확인 문장·찍기 틀(TASK-2, REQ-1401)의 C# 시험(helper/tests/Precheck.Core.Tests/Reception/Check/CheckSql.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// CheckSqlTests·CheckSqlProbeTests 두 묶음만(같은 폴더의 다른 TASK 시험은 돌리지 않는다)
const FILTER = 'Precheck.Core.Tests.Reception.Check.CheckSql'
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

describe('REQ-1401 확인 문장·찍기 틀 (C# Precheck.Core.Tests.Reception.Check.CheckSql*)', () => {
  it('AC-1401.2 상태 짝 문장: 오늘 외래 접수를 (OcmComStt, OcmRsuYon)·시:분마다 세는 SELECT 하나, 상태·접수 취소로 거르지 않음, 병원 범위, 차트번호·이름·메모 칸 없음', () => {
    expectAc('AC-1401.2')
  })

  it('AC-1401.3 칸 문장: INFORMATION_SCHEMA에서 네 표의 칸 이름·형식·길이, 이름이 OcmNum으로 끝나는 칸을 가진 dbo 표의 칸, 자료 값 없음', () => {
    expectAc('AC-1401.3')
  })

  it('AC-1401.8 처방 수 문장: 오늘 상태 짝마다 처방 줄이 있는 접수 수, 옛 자료 따로 있음은 StatsSql.HistoryGuardSql', () => {
    expectAc('AC-1401.8')
  })

  it('AC-1401.9 찍기 틀 세 가지: 이 실행의 INFORMATION_SCHEMA에 있고 모양이 맞는 이름만 [ ]로 감싸 넣음, IsProbe는 만든 글만, Sql.IsAllowed는 틀을 받지 않음', () => {
    expectAc('AC-1401.9')
  })
})
