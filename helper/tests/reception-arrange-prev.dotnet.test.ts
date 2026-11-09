// 직전 기록부(PrevPaperReader·GET /api/visit/{k}/prev, reception-arrange TASK-8, REQ-3307)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/PrevPaperReader.test.cs, Http/PrevRoute.test.cs)을 감싼다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.Reception.PrevPaper.'
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

describe('REQ-3307 직전 진료기록부 (C# Precheck.Core.Tests.Reception.PrevPaper)', () => {
  it('AC-3307.1 가장 최근 지난 완료 내원 하나의 종이 자료 { prev } 또는 { prev: null }', () => {
    expectAc('AC-3307.1')
  })

  it('AC-3307.3 틀린 열쇠·질의 글은 비트를 읽지 않고 404, 실패는 503, GET만', () => {
    expectAc('AC-3307.3')
  })

  it('AC-3307.4 증상·처방 글은 reception-paper와 같은 규칙', () => {
    expectAc('AC-3307.4')
  })
})
