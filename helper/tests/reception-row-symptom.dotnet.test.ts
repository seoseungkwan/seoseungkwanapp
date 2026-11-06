// 접수 현황 목록 줄의 '지난번' 증상(TASK-37, REQ-1402·REQ-1403·REQ-1410·REQ-1401)의 C# 시험을 감싼다:
// 지난 증상 문장(ReceptionSql.test.cs의 PriorSymptoms, AC-1402.6·AC-1410.4·AC-1403.1), 읽기·잇기(BoardReader.test.cs, AC-1402.6),
// 줄 글(BoardBuilder.test.cs, AC-1402.6), 확인 명령 빠르기 목록(CheckRunner.test.cs의 CheckRunnerSpeedTests, AC-1401.8)을 돌린다.
// 실제 증상 글 대조는 의원 PC.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// 거르기 하나에 시험 묶음 하나씩
const FILTERS = [
  'Precheck.Core.Tests.Reception.ReceptionSqlTests',
  'Precheck.Core.Tests.Reception.Cache.BoardReaderTests',
  'Precheck.Core.Tests.Reception.BoardRows.BoardBuilderTests',
  'Precheck.Core.Tests.Reception.Check.CheckRunnerSpeedTests',
]
let run: { code: number; output: string } = { code: -1, output: '' }

beforeAll(() => {
  const runs = FILTERS.map((filter) => runDotnet(filter, { timeoutMs: 280_000 }))
  run = { code: runs.every((one) => one.code === 0) ? 0 : 1, output: runs.map((one) => one.output).join('\n') }
}, 1_150_000)

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

describe('REQ-1402 목록 줄의 지난번은 지난 증상 (C# ReceptionSqlTests·BoardReaderTests·BoardBuilderTests·CheckRunnerSpeedTests)', () => {
  it('AC-1402.6 오늘 처방이 없고 지난 내원이 있으면 지난번 + 그 내원의 증상 글(없으면 적힌 증상이 없어요), PriorRx는 없고 PriorSymptoms가 준다', () => {
    expectAc('AC-1402.6')
  })

  it('AC-1410.4 PriorSymptoms는 가장 최근 지난 내원의 EmrInf S 줄(빈 글 아님)을 EmrUpdDtm 순으로 준다', () => {
    expectAc('AC-1410.4')
  })

  it('AC-1403.1 바뀐 문장 묶음도 모두 허용 목록의 읽기 문장 하나이고 병원 범위·이미 쓰인 칸만 읽는다', () => {
    expectAc('AC-1403.1')
  })

  it('AC-1401.8 확인 명령의 빠르기 단계는 PriorRx 대신 PriorSymptoms를 잰다', () => {
    expectAc('AC-1401.8')
  })
})
