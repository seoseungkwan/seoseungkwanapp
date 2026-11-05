// 비트 읽기 속도(TASK-1, REQ-1001)의 C# 시험을 감싼다.
// 거르기 이름 SqlTests 하나로 StatsSqlTests·RevenueSqlTests·BitReadSpeedSqlTests를 한 번에 돌린다.
// AC-1001.3은 기존 사본 대조 시험 이름의 둘째 ID라서 줄 머리에 묶지 않고 찾는다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// 통계 넷(AC-503.2 둘, AC-503.5, AC-504.4)과 매출 하나(AC-003.1)
const COPY_CHECKS = 5

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

describe('REQ-1001 첫 내원 연결 조건 글 바꾸기 (C# *SqlTests)', () => {
  it('AC-1001.1 허용된 모든 문장에 옛 연결 조건이 없고, 옛 글은 허용 목록이 거절한다', () => {
    expectAc('AC-1001.1')
    expect(count('Passed', 'AC-1001.1'), tail(run.output)).toBe(2)
  })

  it('AC-1001.2 여섯 문장에 새 연결 조건이 한 번씩 있고 PatientId 계산과 NULL 거르기는 그대로다', () => {
    expectAc('AC-1001.2')
  })

  it('AC-1001.3 사본 대조 다섯 시험이 모두 돌아, 상수는 사본에 이 바꿈 한 가지만 더한 글과 맞는다', () => {
    expectAc('AC-1001.3')
    expect(count('Passed', 'AC-1001.3'), tail(run.output)).toBe(COPY_CHECKS)
  })

  it('AC-1001.3 통계·매출 SQL 시험 전체가 실패 없이 끝난다', () => {
    expect(run.code, tail(run.output)).toBe(0)
  })

  it('AC-1001.4 세 매개변수 표가 그대로이고 관문을 지나며 두 Patients 문장은 글자까지 같다', () => {
    expectAc('AC-1001.4')
  })
})
