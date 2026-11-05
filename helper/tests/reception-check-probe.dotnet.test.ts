// 의원 PC 확인 명령의 견주기·모양(TASK-3, REQ-1401)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/Check/ProbeMatch.test.cs·ColumnShape.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// 두 시험 묶음은 Probe 이름 공간에만 있다(같은 폴더의 다른 TASK 시험은 돌리지 않는다)
const FILTER = 'Precheck.Core.Tests.Reception.Check.Probe.'
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

describe('REQ-1401 견주기·모양 (C# Precheck.Core.Tests.Reception.Check.Probe)', () => {
  it('AC-1401.4 증상 찾기: 공백·줄바꿈 맞춘 뒤 내원마다 똑같음·이어 똑같음(붙임·띄움, 줄 순서대로)·품음(네 글자 이상), 견준 내원 수·최대 줄 수, 결과는 숫자만', () => {
    expectAc('AC-1401.4')
  })

  it('AC-1401.5 이름 찾기: 같은 차트번호의 화면 환자명과 칸 값이 똑같은 수', () => {
    expectAc('AC-1401.5')
  })

  it('AC-1401.6 접수 메모: 맞춘 뒤 두 글자 이상인 친 글을 품은 줄 수만, 짧으면 null, 친 글을 들고 있지 않음', () => {
    expectAc('AC-1401.6')
  })

  it('AC-1401.7 모양: 빈 값 아님 %·길이 범위·8자리/6자리 날짜 모양 %·13자리 숫자 모양 %, 값이 4가지 이하이고 모두 두 글자 이하일 때만 값 목록', () => {
    expectAc('AC-1401.7')
  })
})
