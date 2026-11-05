// 엑스레이 찍음 표시 저장(XrayMarks, TASK-9, REQ-1405)의 C# 시험(helper/tests/Precheck.Core.Tests/Reception/XrayMarks.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// 이 TASK의 시험은 Xray 이름 공간에만 있다(같은 폴더의 다른 TASK 시험은 돌리지 않는다)
const FILTER = 'Precheck.Core.Tests.Reception.Xray.'
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

describe('REQ-1405 엑스레이 찍음 표시 XrayMarks (C# Precheck.Core.Tests.Reception.Xray)', () => {
  it('AC-1405.1 [찍음 표시]를 누르면 그 내원과 누른 시각(시:분)이 남고, 다음 읽기(다시 연 저장소)도 같은 표시를 읽는다', () => {
    expectAc('AC-1405.1')
  })

  it('AC-1405.2 [표시 취소]를 누르면 그 내원 표시만 지워지고 다시 열어도 없다', () => {
    expectAc('AC-1405.2')
  })

  it('AC-1405.3 날이 바뀌면 지난 날 표시는 읽을 때 버리고, 새 접수(다른 내원)에는 표시가 없다', () => {
    expectAc('AC-1405.3')
  })

  it('AC-1405.4 저장 폴더의 reception-marks.dat 하나에 IProtector로 암호화해 두고, 비트·웹 서버로 가지 않는다', () => {
    expectAc('AC-1405.4')
  })

  it('AC-1405.6 한 번에 하나씩 쓰고 나중 요청이 이기며, 임시 파일 → 바꾸기라 파일이 깨지지 않고 깨진 파일은 빈 표시로 시작한다(기록에 번호만)', () => {
    expectAc('AC-1405.6')
  })
})
