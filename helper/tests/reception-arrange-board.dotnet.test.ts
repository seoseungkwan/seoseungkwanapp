// 어레인지 자료 만들기(ArrangeBuilder·Board.ToJson(arrange), reception-arrange TASK-6, REQ-3305·AC-3301.3)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/ArrangeBuilder.test.cs)을 감싼다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.Reception.ArrangeBoard.'
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

describe('REQ-3305·REQ-3301 어레인지 자료 만들기 (C# Precheck.Core.Tests.Reception.ArrangeBoard)', () => {
  it('AC-3301.3 같은 칸에 드는 오늘 처방 여럿은 칸 하나: 가장 이른 시각, 처음 빈 글 아닌 부위', () => {
    expectAc('AC-3301.3')
  })

  for (const [ac, what] of [
    ['AC-3305.1', '/api/board 답에 arrange { rows, ended }를 더하고 지금 칸은 그대로'],
    ['AC-3305.2', '네 칸의 접수만 접수 순, endedAt이 있으면 ended(종료 늦은 순)'],
    ['AC-3305.3', '줄 = k·away·ptf·last·cells·allDone'],
    ['AC-3305.4', '칸 = st·det·part·at·ord·manual, 처방·표시·직접 넣음·gone 규칙'],
    ['AC-3305.5', 'SONO·C-ARM 끝나지 않은 칸의 순서'],
    ['AC-3305.6', 'X-RAY 칸과 X-ray 완료 표시'],
    ['AC-3305.7', 'SONO·C-ARM 부위는 표시 → 비트 → null'],
    ['AC-3305.8', 'allDone'],
    ['AC-3305.9', 'ended = { k, endedAt }'],
  ] as const) {
    it(`${ac} ${what}`, () => {
      expectAc(ac)
    })
  }
})
