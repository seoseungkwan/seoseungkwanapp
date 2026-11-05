// 접수 현황 화면 파일 품기(TASK-16, REQ-1407)의 C# 시험(helper/tests/Precheck.Core.Tests/Reception/StaticEmbed.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.Reception.Embed'
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

describe('REQ-1407 접수 현황 화면 파일 품기 (C# Precheck.Core.Tests.Reception.Embed)', () => {
  it('AC-1407.8 Core가 reception/www의 화면·글꼴·로고 파일을 모두 reception/… 이름으로 품고(그 밖의 것은 품지 않음), 내용이 저장소 파일과 같다', () => {
    expectAc('AC-1407.8')
  })

  it('AC-1407.9 홈 화면 추가에 쓰는 manifest.webmanifest와 아이콘(logo-mark.png)을 품는다', () => {
    expectAc('AC-1407.9')
  })
})
