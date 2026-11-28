// 매출·통계 읽기에서 찾는 칸을 RTRIM으로 감싸지 않기(precheck TASK-47, REQ-039)의 C# 시험을 감싼다.
// 거르기 이름 SqlTests 하나로 RevenueSqlTests·StatsSqlTests(와 다른 *SqlTests)를 한 번에 돌리고,
// AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

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

describe('REQ-039 매출·통계 읽기에서 찾는 칸을 감싸지 않기 (C# *SqlTests)', () => {
  it('AC-039.1 CodeAmounts 이름 하위 질의는 s.SeeOdrCod = c.Code이고 나머지 글·매개변수·관문은 그대로다', () => {
    expectAc('AC-039.1')
  })

  it('AC-039.2 사람 줄 SQL은 b.PbsChtNum=p.PatientId이고 Visits 글이 빈 차트번호·NULL을 그대로 뺀다', () => {
    expectAc('AC-039.2')
  })

  it('AC-039.3 매출·통계·수납 읽기 문장에 표 칸을 감싸서 다른 표 칸과 잇는 같음 조건이 없다', () => {
    expectAc('AC-039.3')
  })

  it('AC-039.1 AC-039.2 통계·매출 SQL 시험 전체가 실패 없이 끝난다(옛 기대 글 AC-003.5·AC-2701.3도 새 글로)', () => {
    expect(run.code, tail(run.output)).toBe(0)
  })
})
