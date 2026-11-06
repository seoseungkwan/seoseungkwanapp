// 접수 현황 한 곳(ReceptionMap, TASK-7·TASK-28, REQ-1410·REQ-1402)의 C# 시험(helper/tests/Precheck.Core.Tests/Reception/ReceptionMap.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// 이 TASK의 시험은 Map 이름 공간에만 있다(같은 폴더의 다른 TASK 시험은 돌리지 않는다)
const FILTER = 'Precheck.Core.Tests.Reception.Map.'
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

describe('REQ-1410·REQ-1402 한 곳 ReceptionMap (C# Precheck.Core.Tests.Reception.Map)', () => {
  it('AC-1410.1 상태 표·숨기는 OcmRsuYon 값·읽는 칸이 ReceptionMap.cs 한 곳에만 있고, 칸이 채워지기 전에는 칸 문장이 없다', () => {
    expectAc('AC-1410.1')
  })

  it('AC-1410.2 채운 표는 확인 보고서 3회차 표(WR·CR·CN 숨김·WN 진료대기·HN 진료보류·TN 수납대기·PN 끝남, 확인 안 된 칸 없음)와 같고, Validate는 한 코드 두 칸, Unconfirmed가 아닌 빈 칸, 코드가 든 Unconfirmed 칸, 숨김이 된 아는 완료 코드를 알린다', () => {
    expectAc('AC-1410.2')
  })

  it('AC-1402.1 표에 있는 코드만 칸에 가고, 표에 없는 코드·숨김(접수 취소)·숨기는 OcmRsuYon 값의 줄은 어느 칸에도 가지 않는다', () => {
    expectAc('AC-1402.1')
  })
})
