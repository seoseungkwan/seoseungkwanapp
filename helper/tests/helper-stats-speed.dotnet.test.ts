// 도우미 통계 읽기 속도(TASK-1, REQ-3401)의 C# 시험을 감싼다.
// 거르기 이름 SqlTests 하나로 StatsSqlTests·RevenueSqlTests·BitReadSpeedSqlTests·HelperStatsSpeedSqlTests를 한 번에 돌린다.
// AC-3401.3은 기존 사본 대조 시험 이름의 셋째 ID라서 줄 머리에 묶지 않고 찾는다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// 기간 합계·날짜별 사본 대조 하나와 접수 줄 사본 대조 하나
const COPY_CHECKS = 2

let run: { code: number; output: string } = { code: -1, output: '' }

beforeAll(() => {
  run = runDotnet('SqlTests', { timeoutMs: 280_000 })
}, 300_000)

function count(prefix: 'Passed' | 'Failed', ac: string): number {
  const escaped = ac.replace(/\./g, '\\.')
  return (run.output.match(new RegExp(`^\\s*${prefix} .*\\b${escaped}\\b`, 'gm')) ?? []).length
}

function tail(text: string): string {
  return text.split('\n').slice(-40).join('\n')
}

function expectAc(ac: string) {
  expect(count('Failed', ac), tail(run.output)).toBe(0)
  expect(count('Passed', ac), `${ac} 시험이 돌지 않았다\n${tail(run.output)}`).toBeGreaterThan(0)
}

describe('REQ-3401 세 문장은 첫 내원 표를 해시 잇기로 한 번만 만든다 (C# *SqlTests)', () => {
  it('AC-3401.1 세 문장에 해시 잇기 글이 한 번씩 있고 힌트 없는 잇기·OPTION·;·주석은 없다', () => {
    expectAc('AC-3401.1')
  })

  it('AC-3401.2 그 밖의 비트 문장에는 HASH 낱말이 없다', () => {
    expectAc('AC-3401.2')
  })

  it('AC-3401.3 사본 대조 두 시험이 모두 돌아, 상수는 사본에 두 바꿈만 더한 글과 맞는다', () => {
    expectAc('AC-3401.3')
    expect(count('Passed', 'AC-3401.3'), tail(run.output)).toBe(COPY_CHECKS)
  })

  it('AC-3401.4 세 문장의 매개변수 표가 그대로이고 허용 목록·관문을 지난다', () => {
    expectAc('AC-3401.4')
  })

  it('AC-3401.3 통계·매출 SQL 시험 전체가 실패 없이 끝난다', () => {
    expect(run.code, tail(run.output)).toBe(0)
  })
})
