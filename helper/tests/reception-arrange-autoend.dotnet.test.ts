// 수납완료 줄 저절로 빼기(reception-arrange TASK-14, AC-3304.5·AC-3305.10·AC-3306.7)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/ArrangeAutoEnd.test.cs)을 감싼다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.Reception.ArrangeAutoEnd.'
let run: { code: number; output: string } = { code: -1, output: '' }

// 잠금 폴더는 이 서버의 모든 작업 폴더가 같이 쓴다. 다른 쪽 dotnet을 기다리는 시간까지 넉넉히 준다
beforeAll(() => {
  run = runDotnet(FILTER, { timeoutMs: 560_000 })
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

describe('REQ-3304·REQ-3305·REQ-3306 수납완료 줄 저절로 빼기 (C# Precheck.Core.Tests.Reception.ArrangeAutoEnd)', () => {
  it('AC-3304.5 다시 넣은 수납완료 줄의 kept 저장(참일 때만, 없으면 거짓, true 아닌 값은 틀린 파일)', () => {
    expectAc('AC-3304.5')
  })

  it('AC-3305.10 수납완료 줄은 ended { 수납 시각, paid: true }, kept면 rows, 순서 없음', () => {
    expectAc('AC-3305.10')
  })

  it('AC-3306.7 end off는 수납완료 줄이면 kept, 빠진 줄에도 쓰기가 같게 돈다', () => {
    expectAc('AC-3306.7')
  })
})
