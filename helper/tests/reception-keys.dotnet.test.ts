// 화면용 열쇠(VisitKeys, TASK-8, REQ-1402·REQ-1403)의 C# 시험(helper/tests/Precheck.Core.Tests/Reception/VisitKeys.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// 이 TASK의 시험은 Keys 이름 공간에만 있다(같은 폴더의 다른 TASK 시험은 돌리지 않는다)
const FILTER = 'Precheck.Core.Tests.Reception.Keys.'
let run: { code: number; output: string } = { code: -1, output: '' }

beforeAll(() => {
  run = runDotnet(FILTER, { timeoutMs: 280_000 })
}, 300_000)

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

describe('REQ-1402·REQ-1403 화면용 열쇠 VisitKeys (C# Precheck.Core.Tests.Reception.Keys)', () => {
  it('AC-1402.9 줄마다 그날 무작위 16자리 소문자 16진수 열쇠: 내원번호를 드러내지 않고, 같은 내원은 그날 같은 열쇠, 날이 바뀌면 새 열쇠', () => {
    expectAc('AC-1402.9')
  })

  it('AC-1403.6 날이 바뀌면 열쇠·내원 연결표를 새로 만들어 앞 날 열쇠로는 아무 내원도 찾지 못한다', () => {
    expectAc('AC-1403.6')
  })
})
