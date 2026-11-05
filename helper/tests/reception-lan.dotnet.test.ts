// 이 PC 주소(LanAddresses·LanAddressWatch, TASK-24, REQ-1411·REQ-1406)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/LanAddresses.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// 이 TASK의 시험은 Lan 이름 공간에만 있다(같은 폴더의 다른 TASK 시험은 돌리지 않는다)
const FILTER = 'Precheck.Core.Tests.Reception.Lan.'
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

describe('REQ-1411·REQ-1406 이 PC 주소 LanAddresses·LanAddressWatch (C# Precheck.Core.Tests.Reception.Lan)', () => {
  it('AC-1411.4 켜져 있고 게이트웨이가 있는 어댑터의 사설 IPv4만 주소 작은 순으로 고르고, 휴대폰 주소 글은 http://{주소}:47200', () => {
    expectAc('AC-1411.4')
  })

  it('AC-1406.2 Host 검사에 넘기는 이 PC의 지금 사설 IPv4를 요청 때만 30초마다 새로 보고, 동시에 불러도 한 번만 읽는다', () => {
    expectAc('AC-1406.2')
  })
})
