// 측정 보고서 쓰기·칸 거르기·진행 표시(specs/diag-read-speed TASK-2)의 C# 시험을 감싼다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

let run: { code: number; output: string } = { code: -1, output: '' }

beforeAll(() => {
  run = runDotnet('Precheck.Core.Tests.Diag.DiagReport', { timeoutMs: 280_000 })
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

describe('측정 보고서 (C# Precheck.Core.Tests.Diag.DiagReport)', () => {
  it('AC-801.3 보고서 칸은 숫자 형·식별자 모양·판·에디션 거르기를 지난 값만 싣는다', () => expectAc('AC-801.3'))
  it('AC-804.3 첫 줄에 빌드 커밋이 있고 없으면 unknown이다', () => expectAc('AC-804.3'))
  it('AC-804.4 보고서 자리는 app의 부모 다음 임시 폴더이고 파일 이름은 시각뿐이다', () => expectAc('AC-804.4'))
  it('AC-805.1 단계마다 n/N 읽는 중…이 나온다', () => expectAc('AC-805.1'))
  it('AC-805.2 오래 걸리면 아직 읽는 중이에요가 나온다', () => expectAc('AC-805.2'))
  it('AC-806.4 줄을 쓰면 닫지 않아도 디스크에 있다', () => expectAc('AC-806.4'))
  it('AC-806.6 줄은 1500자 이하다', () => expectAc('AC-806.6'))
})
