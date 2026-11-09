// 오늘 처방 시각 읽기(BoardReader·VisitRow.Orders, reception-arrange TASK-5, REQ-3303)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/BoardOrders.test.cs)을 감싼다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.Reception.ArrangeOrders.'
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

describe('REQ-3303 오늘 처방 시각 읽기 (C# Precheck.Core.Tests.Reception.ArrangeOrders)', () => {
  it('AC-3303.2 지도의 PartColumn이 null이면 부위 문장은 돌지 않고 모든 부위는 null이다', () => {
    expectAc('AC-3303.2')
  })

  it('AC-3303.3 읽은 처방 시각은 VisitRow.Orders(코드·HH:MM·부위)로 실리고, 8초 예산을 같이 쓰며, 실패하면 판 읽기 전체가 실패한다', () => {
    expectAc('AC-3303.3')
  })
})
