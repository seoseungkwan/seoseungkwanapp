// 어레인지 탭의 새 비트 문장(TodayOrderTimes·직전 종이 넷, reception-arrange TASK-3, REQ-3303·REQ-3307)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/ArrangeSql.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// 이 TASK의 시험은 ArrangeSql 이름 공간에만 있다(같은 폴더의 다른 TASK 시험은 돌리지 않는다)
const FILTER = 'Precheck.Core.Tests.Reception.ArrangeSql.'
let run: { code: number; output: string } = { code: -1, output: '' }

// 잠금 폴더는 이 서버의 모든 작업 폴더가 같이 쓴다. 다른 쪽 dotnet을 기다리는 시간까지 넉넉히 준다
beforeAll(() => {
  run = runDotnet(FILTER, { timeoutMs: 560_000 })
}, 580_000)

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

describe('REQ-3303·REQ-3307 어레인지 새 비트 문장 (C# Precheck.Core.Tests.Reception.ArrangeSql)', () => {
  it('AC-3303.1 TodayOrderTimes는 @from·@to·@hospital을 받는 SELECT 상수이고 Sql.IsAllowed가 받으며, 오늘 접수의 처방 줄을 내원·코드마다 MIN(o.OdrDtm) 한 줄로 준다', () => {
    expectAc('AC-3303.1')
  })

  it('AC-3307.2 직전 종이 넷은 @chart·@visit·@hospital을 받는 SELECT 상수이고, 그 내원(c.OcmNum=@visit AND c.OcmChtNum=@chart, 완료 외래, 병원 범위)만 읽으며 사람 칸은 읽지 않는다', () => {
    expectAc('AC-3307.2')
  })
})
