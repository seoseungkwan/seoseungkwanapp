// 켜는 길(specs/diag-read-speed TASK-4)의 C# 시험과 윈도우 부분 컴파일을 감싼다. 실행은 Actions와 의원 PC에서만 증명된다.
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildDotnet, runDotnet } from './runDotnet'

const HELPER_CSPROJ = path.join('helper', 'src', 'Precheck.Helper', 'Precheck.Helper.csproj')
let run: { code: number; output: string } = { code: -1, output: '' }

beforeAll(() => {
  run = runDotnet('Precheck.Core.Tests.Diag.DiagStart', { timeoutMs: 280_000 })
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

describe('켜는 길 (C# Precheck.Core.Tests.Diag.DiagStart)', () => {
  it('AC-801.4 측정 코드는 예외 글·이름을 쓰지 않는다', () => expectAc('AC-801.4'))
  it('AC-802.5 DiagBitDb는 Commit 없이 관문·트랜잭션·Rollback으로 간다', () => expectAc('AC-802.5'))
  it('AC-803.1 정확한 인자 하나와 콘솔 입력일 때만 측정 모드다', () => expectAc('AC-803.1'))
  it('AC-803.2 분기는 Console.SetOut 앞 한 곳이다', () => expectAc('AC-803.2'))
  it('AC-803.3 측정 인자는 메시지 고리에서 거절되고 등록 틀·판은 그대로다', () => expectAc('AC-803.3'))
  it('AC-804.1 시작 파일은 실패 길마다 멈추고 설치를 건드리지 않는다', () => expectAc('AC-804.1'))
  it('AC-804.2 zip 단계가 시작 파일을 묶고 workflow는 그대로다', () => expectAc('AC-804.2'))
  it('AC-805.3 경로를 쓰고 메모장으로 열고 엔터를 기다린다', () => expectAc('AC-805.3'))
  it('AC-805.4 안내 뒤 엔터를 눌러야 시계가 시작된다', () => expectAc('AC-805.4'))
  it('AC-806.1 줄을 받는 동안에도 시계를 보고 Cancel한다', () => expectAc('AC-806.1'))
  it('AC-806.7 45분 감시가 있다', () => expectAc('AC-806.7'))

  it('AC-804.5 측정 코드까지 Precheck.Helper가 net48로 컴파일된다', () => {
    const built = buildDotnet(HELPER_CSPROJ, { timeoutMs: 280_000 })
    expect(built.code, built.output.split('\n').slice(-40).join('\n')).toBe(0)
  }, 300_000)
})
