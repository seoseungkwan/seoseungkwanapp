// 상세의 종이 진료기록부 자료(PaperReader·HistoryReader·HistoryBuilder, reception-paper TASK-4, REQ-1501)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/PaperReader.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// 이 TASK의 시험은 Paper 이름 공간에만 있다. 끝 점까지 넣어 PaperSql·PaperRtf 이름 공간은 돌리지 않는다
const FILTER = 'Precheck.Core.Tests.Reception.Paper.'
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

describe('REQ-1501 상세 답의 종이 기록부 자료 (C# Precheck.Core.Tests.Reception.Paper)', () => {
  it('AC-1501.1 from=0 상세 답에만 paper 칸(todaySym 뒤, design.md 2절 모양), from>0에는 없고 나머지 칸(visits·next·more·first·total·todaySym)은 그대로', () => {
    expectAc('AC-1501.1')
  })

  it('AC-1501.2 res는 앞 6자리가 숫자 6자리일 때만 "NNNNNN-*******", addr는 PbsDtlAdr + 공백 + PbsAdrSta(비지 않았으면), tel·cel, special은 RTF → 보통 글, 모두 앞뒤 공백 빼고 없으면 ""', () => {
    expectAc('AC-1501.2')
  })

  it('AC-1501.4 room은 그 접수의 진료실(DepKorNam)·ins는 보험 이름(InsCodNam), 줄이 여럿이면 첫 줄, 없으면 ""', () => {
    expectAc('AC-1501.4')
  })

  it('AC-1501.5 sym은 증상 줄을 EmrShtSeq 순으로 "\\n"으로 잇고 빈 줄은 지키되 여럿은 하나로, 줄 끝 공백·앞뒤 빈 줄은 빼며, 줄이 없으면 ""', () => {
    expectAc('AC-1501.5')
  })

  it('AC-1501.6 dx는 OicSeq 순 {code, name, main}(앞뒤 공백 뺌), main은 OicIcdPri가 \'1\'일 때만', () => {
    expectAc('AC-1501.6')
  })

  it('AC-1501.7 처방 줄은 OdrSeq 순, OdrOutCod \'XX\'면 out·아니면 rx에 {code(대소문자 그대로), name(비면 그날 이름표), qty("0.####"), tms, day}', () => {
    expectAc('AC-1501.7')
  })

  it('AC-1501.9 종이 문장 하나라도 실패하거나 8초가 다 가면 일부만 주지 않고 상세 전체가 볼 수 없음(503), from>0 읽기는 종이 문장을 돌리지 않는다', () => {
    expectAc('AC-1501.9')
  })
})
