// 처방 → 어레인지 칸 지도 한 곳(ArrangeMap, reception-arrange TASK-1, REQ-3301)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/ArrangeMap.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// 이 TASK의 시험은 ArrangeMapping 이름 공간에만 있다(같은 폴더의 다른 TASK 시험은 돌리지 않는다)
const FILTER = 'Precheck.Core.Tests.Reception.ArrangeMapping.'
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

describe('REQ-3301 처방 → 어레인지 칸 지도 ArrangeMap (C# Precheck.Core.Tests.Reception.ArrangeMapping)', () => {
  it('AC-3301.1 규칙·직접 칸(ManualOnly)·확인 안 된 칸(Unconfirmed)·부위 칸(PartColumn)이 ArrangeMap.cs 한 곳에만 있다', () => {
    expectAc('AC-3301.1')
  })

  it('AC-3301.2 확인 전 지도는 SONO1 → sono, CARM1 → carm뿐이고 X-RAY는 Unconfirmed, 어떤 코드도 직접 칸에 들지 않는다', () => {
    expectAc('AC-3301.2')
  })

  it('AC-3301.4 Validate는 한 규칙 두 칸, Unconfirmed 칸·직접 칸의 규칙을 알린다', () => {
    expectAc('AC-3301.4')
  })
})
