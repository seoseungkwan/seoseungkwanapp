// 확인 결과로 채운 지도(ArrangeMap, reception-arrange TASK-12, REQ-3311)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/ArrangeFill.test.cs)을 감싼다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.Reception.ArrangeFill.'
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

describe('REQ-3311 확인 결과로 채운 지도 (C# Precheck.Core.Tests.Reception.ArrangeFill)', () => {
  it('AC-3311.1 X-RAY 규칙은 보고서 근거로 채우고 부위 칸은 근거가 없어 null', () => {
    expectAc('AC-3311.1')
  })

  it('AC-3311.2 채운 지도는 Validate 문제가 없고 보고서 코드 표의 칸 나누기를 시험 표로 고정', () => {
    expectAc('AC-3311.2')
  })
})
