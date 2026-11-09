// 어레인지 표시 저장(ArrangeMarks·ArrangeChoices, reception-arrange TASK-4, REQ-3304·AC-3312.3)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/ArrangeMarks.test.cs)을 감싼다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.Reception.ArrangeStore.'
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

describe('REQ-3304 어레인지 표시 저장 (C# Precheck.Core.Tests.Reception.ArrangeStore)', () => {
  it('AC-3304.1 data\\reception-arrange.dat(머리 + IProtector로 감싼 { day, visits })에 임시 파일 → 바꾸기로, 한 번에 하나씩 쓴다', () => {
    expectAc('AC-3304.1')
  })

  it('AC-3304.2 내원 표시는 칸마다 st·manual·det·part·readyAt·doneAt·addedAt와 away·ptf·endedAt뿐이다', () => {
    expectAc('AC-3304.2')
  })

  it('AC-3304.3 날이 오늘이 아니면 빈 표시, 1MB를 넘거나 모양이 틀리면 빈 표시 + 오류 번호만', () => {
    expectAc('AC-3304.3')
  })

  it('AC-3304.4 det·part는 칸마다 정해 둔 고르기 목록의 글만 받는다', () => {
    expectAc('AC-3304.4')
  })

  it('AC-3312.3 표시 파일과 기록에는 내원번호와 정해 둔 글만 있다', () => {
    expectAc('AC-3312.3')
  })
})
