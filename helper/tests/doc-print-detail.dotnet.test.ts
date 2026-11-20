// 서류 한 번에 인쇄(spec doc-print TASK-5) 진료비 세부내역서 C# 시험(helper/tests/Precheck.Core.Tests/DocPrint/Detail/*.test.cs,
// namespace Precheck.Core.Tests.DocPrint.Detail)을 감싼다. dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고
// 하나도 실패하지 않았는지 본다. 비트 DB는 가짜(FakeDb)이고 환자·병원 값은 모두 지어낸 것이다. 실제 글꼴 그림은 윈도우 층에서 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.DocPrint.Detail'
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

describe('REQ-7405 세부내역서 자료 읽기 (C# Precheck.Core.Tests.DocPrint.Detail)', () => {
  it('AC-7405.1 OdrInf(삭제·취소·원외약 XX 뺌)와 영수증 저장 값(OrpInf·OdlInf)을 허용 목록의 읽기 전용 매개변수 문장으로 읽고, 고른 날·수납한 내원만, 금액은 저장 값 그대로', () => {
    expectAc('AC-7405.1')
  })
})

describe('REQ-7406 세부내역서 그리기 (C# Precheck.Core.Tests.DocPrint.Detail)', () => {
  it('AC-7406.1 A4 세로에 제목·머리·표 머리·날짜순 항목 묶음 줄·【계】【끝자리 조정금액】【합계】·발급 문장·직인·안내, 길면 여러 쪽(쪽마다 머리 다시·쪽 번호), 글은 칸 안에', () => {
    expectAc('AC-7406.1')
  })
})
