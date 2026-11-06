// 접수 현황 확인 칸 채우기(TASK-29, REQ-1410·REQ-1402)의 C# 시험을 감싼다: 칸 문장(ReceptionSql.test.cs, AC-1410.3)과
// 비트 읽기 묶음(BoardReader.test.cs, AC-1410.3·AC-1402.5·AC-1402.7·AC-1410.5의 글자·구성)을 돌린다. 실제 값 대조는 의원 PC(AC-1410.5).
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// ReceptionSqlTests(Precheck.Core.Tests.Reception)와 BoardReaderTests(Precheck.Core.Tests.Reception.Cache)만 돌린다(거르기 하나에 하나씩)
const FILTERS = ['Precheck.Core.Tests.Reception.ReceptionSqlTests', 'Precheck.Core.Tests.Reception.Cache.BoardReaderTests']
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

describe('REQ-1410·REQ-1402 확인 칸 읽기: 이름·생년월일·성별·접수 메모·수납 시각 (C# ReceptionSqlTests·BoardReaderTests)', () => {
  it('AC-1410.3 칸 문장은 허용 목록의 상수이고 채운 칸 이름 그대로 읽으며, 주민번호 칸은 읽지 않고, 수납 시각은 내원마다 가장 늦은 OrcUpdDtm이다', () => {
    expectAc('AC-1410.3')
  })

  it('AC-1402.5 읽은 생년월일·성별·지난 완료 내원 수로 "54세 · 여 · 재진" 모양의 정보 글', () => {
    expectAc('AC-1402.5')
  })

  it('AC-1402.7 칸이 채워지기 전·찾지 못한 칸은 그 문장을 돌리지 않고 그 값만 비운다', () => {
    expectAc('AC-1402.7')
  })

  it('AC-1410.5 [의원 PC] 휴대폰 줄의 이름·메모·수납 시각 글은 읽은 값 그대로다(이 서버는 글자·구성만)', () => {
    expectAc('AC-1410.5')
  })
})
