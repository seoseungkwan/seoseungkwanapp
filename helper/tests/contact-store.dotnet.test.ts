// 도우미 contact.dat 저장(TASK-8, REQ-606)의 C# 시험(helper/tests/Precheck.Core.Tests/Contact/Store/*.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
// 이 서버에는 DPAPI가 없어 암호화는 가짜다. 실제 DPAPI 왕복·윈도우 File.Replace·윈도우 뮤텍스는 Actions 윈도우와 의원 PC에서 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.Contact.Store'
let run: { code: number; output: string } = { code: -1, output: '' }

// 시간에는 다른 작업 사본과 함께 쓰는 잠금을 기다리는 시간도 든다. 바쁜 서버에서 280초는 기다리다 끝나므로 tdd-run 한도(600초) 안에서 넉넉히 둔다
beforeAll(() => {
  run = runDotnet(FILTER, { timeoutMs: 580_000 })
}, 600_000)

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

describe('REQ-606 도우미 연락 표시·정기 주사 기록 저장 (C# Precheck.Core.Tests.Contact.Store)', () => {
  it('AC-606.1 store.save {payload: {contact}}: 등록 확인 → 머리 PRECHECK-STORE-1 + 암호화(임시 → 바꿔치기, .bak 하나)로 프로필 ID와 함께 contact.dat에 → {saved: true}', () => {
    expectAc('AC-606.1')
  })

  it('AC-606.2 store.load {contact: true}: contact를 chunk … end로, 파일이 없거나 다른 프로필이면 {}', () => {
    expectAc('AC-606.2')
  })

  it('AC-606.3 깨진 contact.dat: .bak이 맞으면 그것, 아니면 E-STORE-BROKEN(깨진 파일은 이름만 바꿔 남김), 쓰기 실패는 E-STORE-FAILED', () => {
    expectAc('AC-606.3')
  })

  it('AC-606.4 contact 밖의 칸은 무엇이든 E-HELPER-BAD-MESSAGE, contact 32MB 넘음도 거절', () => {
    expectAc('AC-606.4')
  })

  it('AC-606.5 작업 뮤텍스 Local\\SeoseungkwanPrecheckHelper.Work를 5초 안에 못 잡으면 store.save는 E-BRIDGE-BUSY', () => {
    expectAc('AC-606.5')
  })
})
