// 읽기 간격 한 곳(ReceptionTiming, TASK-31, REQ-1403)의 C# 시험(helper/tests/Precheck.Core.Tests/Reception/ReceptionTiming.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
// AC-1403.10의 실제 비트 부담(폰 두 대 이상·진료 시간 30분)은 의원 PC에서 사용자가 본다. 여기서는 가짜 비트로 읽기 횟수만 센다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// 이 TASK의 시험은 Timing 이름 공간에만 있다(같은 폴더의 다른 TASK 시험은 돌리지 않는다)
const FILTER = 'Precheck.Core.Tests.Reception.Timing.'
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

describe('REQ-1403 읽기 간격 한 곳 ReceptionTiming (C# Precheck.Core.Tests.Reception.Timing)', () => {
  it('AC-1403.2 마지막 읽기가 끝난 지 묶음 시간(CacheSeconds = 4초) 안이면 다시 읽지 않고, 4초가 되면 다시 읽는다', () => {
    expectAc('AC-1403.2')
  })

  it('AC-1403.8 fresh는 묶음(4초)만 건너뛴다: 2초 안이면 그 결과, 2초부터는 묶음 안이어도 바로 읽는다', () => {
    expectAc('AC-1403.8')
  })

  it('AC-1403.9 PollSeconds = 5·CacheSeconds = 4는 ReceptionTiming 한 곳, CacheSeconds < PollSeconds, BoardCache 묶음은 CacheSeconds(3배 쉼·실패 뒤 10초·fresh 2초 그대로), /api/board 답의 every = PollSeconds', () => {
    expectAc('AC-1403.9')
  })

  it('AC-1403.10 [의원 PC] 실제 비트 부담은 의원 PC에서 사용자가 본다. 여기서는 폰 두 대가 PollSeconds마다 30분 물어도 비트 읽기는 간격마다 한 번 이하다', () => {
    expectAc('AC-1403.10')
  })
})
