// 측정 문장(specs/diag-read-speed TASK-1)의 C# 시험을 감싼다. dotnet test를 한 번 돌리고 AC마다 그 AC ID 시험이 돌았고 실패가 없는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

let run: { code: number; output: string } = { code: -1, output: '' }

beforeAll(() => {
  run = runDotnet('Precheck.Core.Tests.Diag.DiagSql', { timeoutMs: 280_000 })
}, 300_000)

function count(prefix: 'Passed' | 'Failed', ac: string): number {
  const pattern = new RegExp(`^\\s*${prefix} ${ac.replace(/\./g, '\\.')}\\b`, 'gm')
  return (run.output.match(pattern) ?? []).length
}

function expectAc(ac: string) {
  const tail = run.output.split('\n').slice(-40).join('\n')
  expect(run.code, tail).toBe(0)
  expect(count('Failed', ac), tail).toBe(0)
  expect(count('Passed', ac), `${ac} 시험이 돌지 않았다\n${tail}`).toBeGreaterThan(0)
}

describe('측정 문장과 허용 목록 (C# Precheck.Core.Tests.Diag.DiagSql)', () => {
  it('AC-802.1 측정 문장은 SELECT 한 문장이고 INTO·임시 표·쓰기가 없다(T-SQL 해석기)', () => expectAc('AC-802.1'))
  it('AC-802.2 환경 문장은 sys.*만, 조각 문장은 정해 둔 dbo 표만 읽고 답은 건수뿐이다', () => expectAc('AC-802.2'))
  it('AC-802.3 정해 둔 매개변수와 함께만 ReadOnlyGuard를 지나고 제품 목록은 그대로다', () => expectAc('AC-802.3'))
  it('AC-802.4 조각은 제품 상수와 공백만 다르고 바꾼 조인은 한 곳만 다르다', () => expectAc('AC-802.4'))
  it('AC-807.2 문장에 표 여섯과 칸 여섯 이름이 있다', () => expectAc('AC-807.2'))
  it('AC-807.7 허용 목록의 모든 문장에 이름이 있고 표에 없는 문장은 ?다', () => expectAc('AC-807.7'))
  it('AC-807.8 비용·대기 문장은 자기 세션만 본다', () => expectAc('AC-807.8'))
})
