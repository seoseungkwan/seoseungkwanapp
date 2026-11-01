// 도우미 보고 숫자 읽기(TASK-4, REQ-504)의 C# 시험을 감싼다.
// - Precheck.Core.Tests.Stats(보고 SQL 사본 대조·@daily 관문, 네 벌의 기간·순서·칸, 금액 확인 필요, 그 벌만 실패, 원 미만 버림)
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

let run: { code: number; output: string } = { code: -1, output: '' }

beforeAll(() => {
  run = runDotnet('Precheck.Core.Tests.Stats', { timeoutMs: 280_000 })
}, 300_000)

function count(prefix: 'Passed' | 'Failed', ac: string): number {
  const escaped = ac.replace(/\./g, '\\.')
  const pattern = new RegExp(`^\\s*${prefix} ${escaped}\\b`, 'gm')
  return (run.output.match(pattern) ?? []).length
}

function tail(text: string): string {
  return text.split('\n').slice(-40).join('\n')
}

function expectAc(ac: string) {
  expect(run.code, tail(run.output)).toBe(0)
  expect(count('Failed', ac), tail(run.output)).toBe(0)
  expect(count('Passed', ac), `${ac} 시험이 돌지 않았다\n${tail(run.output)}`).toBeGreaterThan(0)
}

describe('REQ-504 도우미 보고 숫자 읽기 (C# Precheck.Core.Tests.Stats)', () => {
  it('AC-504.1 같은 JSON의 report에 원본 Load 순서로 읽은 네 벌(일일 to·to−1, 월말 그 달·앞 달)이 정해 둔 칸으로 있다', () => {
    expectAc('AC-504.1')
  })

  it('AC-504.2 환불·변경수납·예치금·연결 중복이면 그 벌만 금액 확인 필요(사유 포함)이고 총환·신환·치료·LA는 그대로다', () => {
    expectAc('AC-504.2')
  })

  it('AC-504.3 원본 Fail 자리는 그 벌만 ok:false와 원본 이유 이름, 다른 벌과 진료 줄은 그대로, SQL 실패는 전체 error다', () => {
    expectAc('AC-504.3')
  })

  it('AC-504.4 보고 SQL은 원본 사본과 공백만 다르고 @daily는 Char(1)로 관문을 지나며 금액은 원 미만을 버린 정수다', () => {
    expectAc('AC-504.4')
  })
})
