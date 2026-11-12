// SONO·C-ARM 고르기 목록(PickLists·ReceptionLists, reception-pick-lists TASK-1, REQ-3501)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/PickLists.test.cs)을 감싼다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.Reception.PickChoices.'
let run: { code: number; output: string } = { code: -1, output: '' }

// 잠금 폴더는 이 PC의 모든 작업 폴더가 같이 쓴다. 다른 쪽 dotnet을 기다리는 시간까지 넉넉히 준다
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

describe('REQ-3501 고르기 목록 저장·나눠 주기 (C# Precheck.Core.Tests.Reception.PickChoices)', () => {
  it('AC-3501.1 목록 파일이 없으면 기본값(시안 목록), 깨졌으면 기본값 + 기록 E-STORE-BROKEN 한 번', () => {
    expectAc('AC-3501.1')
  })

  it('AC-3501.2 이름 1~10글자·"|"·제어 글자 없음·무리 안 겹침 없음, 부위·부위 없이 안 겹침, 개수 한도, 약재 없음은 시술에만', () => {
    expectAc('AC-3501.2')
  })
})
