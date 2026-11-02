// 측정 순서·시간 한도·제품 읽기 감싸개(specs/diag-read-speed TASK-3)의 C# 시험을 감싼다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

let run: { code: number; output: string } = { code: -1, output: '' }

beforeAll(() => {
  run = runDotnet('Precheck.Core.Tests.Diag.DiagRunner', { timeoutMs: 280_000 })
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

describe('측정 순서와 한도 (C# Precheck.Core.Tests.Diag.DiagRunner)', () => {
  it('AC-801.1 센티널이 보고서·콘솔에 닿지 않는다(모든 칸, 형식 맞는 줄)', () => expectAc('AC-801.1'))
  it('AC-801.2 예외 글·매개변수 값·SQL 글자를 싣지 않는다', () => expectAc('AC-801.2'))
  it('AC-802.3 목록 밖 문장은 세션에 닿지 않는다', () => expectAc('AC-802.3'))
  it('AC-806.1 자료 문장 10분, 환경 문장 30초', () => expectAc('AC-806.1'))
  it('AC-806.2 전체 40분이 지나면 skip과 end, 돌던 읽기는 stopped', () => expectAc('AC-806.2'))
  it('AC-806.3 단계 끝 시각에 끊겨 뒤 단계가 재인다', () => expectAc('AC-806.3'))
  it('AC-806.4 문장이 끝날 때마다 합계까지 디스크에 있다', () => expectAc('AC-806.4'))
  it('AC-806.5 실패·시간 초과·세션 열기 실패를 적고 넘어간다', () => expectAc('AC-806.5'))
  it('AC-806.6 80줄 이하, 줄마다 1500자 이하', () => expectAc('AC-806.6'))
  it('AC-807.1 값싼 것부터 정해 둔 차례로 돈다', () => expectAc('AC-807.1'))
  it('AC-807.2 환경 값이 적히고 권한 오류는 권한 없음이다', () => expectAc('AC-807.2'))
  it('AC-807.3 막힘 확인은 권한이 있을 때만', () => expectAc('AC-807.3'))
  it('AC-807.4 조각은 새 세션에서 건수로, 두 FirstVisits는 건수로만 비교', () => expectAc('AC-807.4'))
  it('AC-807.5 제품 읽기는 그대로 돌고 상수 이름으로 합계를 적는다', () => expectAc('AC-807.5'))
  it('AC-807.6 멈춘 뒤 남은 문장만 CodeNames 먼저 따로 돌린다', () => expectAc('AC-807.6'))
  it('AC-807.8 같은 세션의 비용·대기를 붙이고 끊긴 뒤에도 읽는다', () => expectAc('AC-807.8'))
})
