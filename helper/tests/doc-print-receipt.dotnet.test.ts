// 서류 한 번에 인쇄(spec doc-print TASK-4) 진료비 영수증의 C# 시험(helper/tests/Precheck.Core.Tests/DocPrint/Receipt/*.test.cs,
// namespace Precheck.Core.Tests.DocPrint.Receipt)을 감싼다. dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고
// 하나도 실패하지 않았는지 본다. 비트 DB는 가짜(FakeDb)이고 병원·환자·금액은 지어낸 값이다. 견본 PDF와 맞추기는 의원 PC에서 한다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.DocPrint.Receipt'
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

describe('REQ-7405 진료비 영수증 자료 읽기 (C# Precheck.Core.Tests.DocPrint.Receipt)', () => {
  it('AC-7405.1 허용 목록의 읽기 전용 문장 둘을 @cht·@from·@to로 한 번씩만 읽고, 고른 날의 내원만 거르며, OrpInf·OdlInf·OrcInf·CashInf 금액을 저장 값 그대로 쓴다', () => {
    expectAc('AC-7405.1')
  })
})

describe('REQ-7406 진료비 영수증 그리기 (C# Precheck.Core.Tests.DocPrint.Receipt)', () => {
  it('AC-7406.1 2012년 신 서식 칸·글자 자리, 영수증마다 한 장(날짜순), 수납 전 건너뜀, 직인 자리, 긴 글 줄이기, A4 안', () => {
    expectAc('AC-7406.1')
  })
})
