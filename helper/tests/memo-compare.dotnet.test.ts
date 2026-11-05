// 비트 메모 비교의 도우미 쪽(TASK-16, REQ-016)의 C# 시험을 감싼다.
// - Precheck.Core.Tests.Claim.MemoRowsTests: claim.memos(원본 RowsSql, {v, p, d, m} 줄, 줄 300,000·메모 4,000자 → truncated, 실패하면 error만)
// - Precheck.Core.Tests.Claim.MemoCompareTests: 원본 MemoApproval.Matches(CRLF→LF만 맞추고 글자 그대로)
// 윈도우 전용 시험은 없다. 웹 쪽(compareMemo·inputPlan·dayMemoCounts·E-CLAIM-PARTIAL)은 src/lib/precheck/memoCompare.test.ts·src/workers/precheck/jobs.test.ts가 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// 거르기는 '포함' 비교다: Claim.Memo로 시작하는 두 시험 클래스만 돈다
let run = { code: -1, output: '' }

beforeAll(() => {
  run = runDotnet('Precheck.Core.Tests.Claim.Memo', { timeoutMs: 280_000 })
}, 300_000)

function count(prefix: 'Passed' | 'Failed', ac: string): number {
  const escaped = ac.replace(/\./g, '\\.')
  return (run.output.match(new RegExp(`^\\s*${prefix} ${escaped}\\b`, 'gm')) ?? []).length
}

function tail(text: string): string {
  return text.split('\n').slice(-40).join('\n')
}

function expectAc(ac: string) {
  expect(run.code, tail(run.output)).toBe(0)
  expect(count('Failed', ac), tail(run.output)).toBe(0)
  expect(count('Passed', ac), `${ac} 시험이 돌지 않았다\n${tail(run.output)}`).toBeGreaterThan(0)
}

describe('REQ-016 비트 메모 비교, 도우미 쪽 (C# Precheck.Core.Tests.Claim)', () => {
  it('AC-016.1 claim.memos: 원본 RowsSql로 읽은 {v, p, d, m} 줄을 chunk … end로, 줄 300,000·메모 4,000자를 넘으면 truncated, 실패하면 error 하나만', () => {
    expectAc('AC-016.1')
  })

  it('AC-016.2 MemoCompare.Matches: 줄바꿈(CRLF→LF)만 맞추고 글자 그대로, 값이 없으면 같지 않다', () => {
    expectAc('AC-016.2')
  })
})
