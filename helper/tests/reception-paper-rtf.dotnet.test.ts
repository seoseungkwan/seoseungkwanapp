// 특이사항 RTF → 보통 글(RtfText, reception-paper TASK-1, REQ-1501)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/RtfText.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// 이 TASK의 시험은 PaperRtf 이름 공간에만 있다(같은 폴더의 다른 TASK 시험은 돌리지 않는다)
const FILTER = 'Precheck.Core.Tests.Reception.PaperRtf.'
let run: { code: number; output: string } = { code: -1, output: '' }

beforeAll(() => {
  run = runDotnet(FILTER, { timeoutMs: 280_000 })
}, 300_000)

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

describe('REQ-1501 특이사항 RTF → 보통 글 (C# Precheck.Core.Tests.Reception.PaperRtf)', () => {
  it('AC-1501.3 RTF를 보통 글로: \\par·\\line 줄 바꿈, \\tab 공백, \\\'hh는 \\ansicpg(없으면 949) 글자, \\uN 글자(\\ucN 대체 글자 버림), 글꼴표·색표·스타일표·info·{\\*…}·그림 버림, 그다음 줄 정리. RTF 아닌 글은 정리만, 없거나 비면 ""', () => {
    expectAc('AC-1501.3')
  })

  it('AC-1501.5 줄 정리(Tidy): CRLF·CR → LF, 줄 끝 공백 빼기, 빈 줄 여럿은 하나로, 앞뒤 빈 줄 빼기, null은 ""', () => {
    expectAc('AC-1501.5')
  })
})
