// 접수 현황 증상 칸 읽기(TASK-30, REQ-1410·REQ-1404)의 C# 시험을 감싼다: 증상 문장(ReceptionSql.test.cs의 VisitSymptoms, AC-1410.4)과
// 상세 읽기(HistoryReader.test.cs, 지난 내원 sym·오늘 todaySym·잇기 AC-1404.2·AC-1404.4·AC-1410.4)를 돌린다. 실제 줄 차례 대조는 의원 PC.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// ReceptionSqlTests(Precheck.Core.Tests.Reception)와 HistoryReaderTests(Precheck.Core.Tests.Reception.Detail)만 돌린다(거르기 하나에 하나씩)
const FILTERS = ['Precheck.Core.Tests.Reception.ReceptionSqlTests', 'Precheck.Core.Tests.Reception.Detail.HistoryReaderTests']
let run: { code: number; output: string } = { code: -1, output: '' }

beforeAll(() => {
  const runs = FILTERS.map((filter) => runDotnet(filter, { timeoutMs: 280_000 }))
  run = { code: runs.every((one) => one.code === 0) ? 0 : 1, output: runs.map((one) => one.output).join('\n') }
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

describe('REQ-1410·REQ-1404 증상 칸 읽기: EmrInf S 줄을 내원마다 공백 하나로 잇기 (C# ReceptionSqlTests·HistoryReaderTests)', () => {
  it('AC-1410.4 VisitSymptoms는 허용 목록의 상수이고 그 쪽 지난 내원·그 접수의 EmrInf(EmrOcmNum) 중 EmrShtTyp=S·빈 글 아닌 EmrShtVal 줄을 EmrUpdDtm 순으로 주며, 도우미가 공백 하나로 잇는다', () => {
    expectAc('AC-1410.4')
  })

  it('AC-1404.2 지난 내원마다 증상 글(없으면 칸 없음)', () => {
    expectAc('AC-1404.2')
  })

  it('AC-1404.4 오늘 카드의 오늘 증상(todaySym)은 오늘 접수 내원의 증상 글', () => {
    expectAc('AC-1404.4')
  })
})
