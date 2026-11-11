// 지난 진료기록부 여러 장(spec reception-memo-papers REQ-3404, TASK-2·TASK-3)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/PastPaperSql.test.cs·PastPaperReader.test.cs, Http/PastPaperRoute.test.cs)을 감싼다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.Reception.PastPaper.'
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

describe('REQ-3404 지난 진료기록부 여러 장 (C# Precheck.Core.Tests.Reception.PastPaper)', () => {
  it('AC-3404.1 GET /api/visit/{k}/papers?from=N은 from=0이면 1~2번째, 그 뒤는 3장씩 { papers, total, next }이고, 틀린 열쇠·from·판에 없는 내원은 404, 실패·8초 넘음은 503', () => {
    expectAc('AC-3404.1')
  })

  it('AC-3404.2 지난 종이 문장 넷은 @chart·@before·@hospital·@first·@last를 받는 SELECT 상수이고, 상세와 같은 지난 내원의 Seq 범위 줄만 내원번호와 함께 준다(사람 칸 없음)', () => {
    expectAc('AC-3404.2')
  })
})
