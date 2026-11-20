// 서류 한 번에 인쇄(spec doc-print TASK-6) 처방전 사본의 C# 시험(helper/tests/Precheck.Core.Tests/DocPrint/RxCopy/*.test.cs,
// namespace Precheck.Core.Tests.DocPrint.RxCopy)을 감싼다. dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
// 비트 DB는 가짜(FakeDb), 값은 모두 지어낸 것이다. 실제 비트 견본과의 대조는 TASK-8.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.DocPrint.RxCopy'
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

describe('REQ-7405 처방전 사본 자료 (C# Precheck.Core.Tests.DocPrint.RxCopy)', () => {
  it('AC-7405.1 허용 목록의 읽기 전용 문장 하나로 처방전 머리·원외약 줄·주상병 하나·의사를 읽고(주민번호 앞 7자리만), 고른 날 중 처방 있는 날만 처방전마다 한 쪽, 날짜순', () => {
    expectAc('AC-7405.1')
  })
})

describe('REQ-7406 처방전 사본 그리기 (C# Precheck.Core.Tests.DocPrint.RxCopy)', () => {
  it('AC-7406.1 A4 세로 처방전 서식 칸 차례, [환자보관용]·<사본이므로 조제불가>, 질병분류기호는 주상병만, 글은 칸에 맞고 약이 많으면 다음 쪽', () => {
    expectAc('AC-7406.1')
  })
})
