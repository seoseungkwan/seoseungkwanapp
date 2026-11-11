// 충격파 타수·부위 수 고르기 목록(ArrangeChoices·ArrangeWrite·ArrangeMarks, reception-memo-papers TASK-1, REQ-3402)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/EswtChoices.test.cs)을 감싼다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.Reception.EswtHits.'
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

describe('REQ-3402 충격파 타수·부위 수 (C# Precheck.Core.Tests.Reception.EswtHits)', () => {
  it('AC-3402.1 충격파 목록은 1~4부위 넷과 "{타수} {N부위}" 열여섯이고, 다른 글은 쓰기에서 400이다', () => {
    expect(run.code, tail(run.output)).toBe(0)
    expect(lines('Failed', 'AC-3402.1'), tail(run.output)).toBe(0)
    expect(lines('Passed', 'AC-3402.1'), `AC-3402.1 시험이 돌지 않았다\n${tail(run.output)}`).toBeGreaterThanOrEqual(5)
  })
})
