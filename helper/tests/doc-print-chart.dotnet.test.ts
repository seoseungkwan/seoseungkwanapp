// 서류 한 번에 인쇄(spec doc-print TASK-7) 진료기록부의 C# 시험(helper/tests/Precheck.Core.Tests/DocPrint/Chart/*.test.cs,
// namespace Precheck.Core.Tests.DocPrint.Chart)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
// 비트 DB는 가짜(ChartDb), 값은 모두 지어낸 것이다. 실제 종이 모양은 견본 PDF·Microsoft Print to PDF로 본다(TASK-8).
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.DocPrint.Chart'
let run: { code: number; output: string } = { code: -1, output: '' }

// 시간에는 다른 작업 사본과 함께 쓰는 잠금을 기다리는 시간도 든다. tdd-run 한도(600초) 안에서 넉넉히 둔다
beforeAll(() => {
  run = runDotnet(FILTER, { timeoutMs: 580_000 })
}, 600_000)

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

describe('REQ-7405 진료기록부 자료 읽기 (C# Precheck.Core.Tests.DocPrint.Chart)', () => {
  it('AC-7405.1 허용 목록의 읽기 전용 매개변수 문장으로 EmrInf·OicInf·OdrInf·OrpInf(+OrcInf)를 고른 날 범위로 읽고 고른 내원만 거른다, 금액은 비트 저장 값 그대로', () => {
    expectAc('AC-7405.1')
  })
})

describe('REQ-7406 진료기록부 그리기 (C# Precheck.Core.Tests.DocPrint.Chart)', () => {
  it('AC-7406.1 외래진료기록부 ( Page - n ) 머리·환자 칸, 내원마다 내원내역·원외처방·수납내역, 긴 글 줄 나눔, 쪽 넘김, 마지막 쪽 날인 안내 글·출력담당자 자리, 도장 그림 없음', () => {
    expectAc('AC-7406.1')
  })
})
