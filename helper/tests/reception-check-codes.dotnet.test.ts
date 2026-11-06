// 의원 PC 확인 명령의 확인 고침 3(TASK-34, REQ-1401)의 C# 시험을 감싼다: 증상 기록지 코드(symptomCode·sheetCode, AC-1401.18),
// 지난 30일 상태 내력(statusHistory)·첫 줄 build=판+check4·단계 1/10~10/10(AC-1401.19), 틀 받기(AC-1401.9), 센티널 없음(AC-1401.10).
// 가짜 DB·단계 차례를 바꿨으므로 확인 폴더(Precheck.Core.Tests.Reception.Check)의 시험을 모두 돌린다.
// 윈도우 세션(CheckBitDb)은 글자로 보고, 여기서 buildDotnet으로 도우미가 net48로 컴파일되는지 본다. 실제 값은 의원 PC(AC-1401.13).
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildDotnet, runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.Reception.Check'
const HELPER_CSPROJ = path.join('helper', 'src', 'Precheck.Helper', 'Precheck.Helper.csproj')
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

describe('REQ-1401 확인 고침 3: 증상 기록지 코드·상태 내력 (C# Precheck.Core.Tests.Reception.Check.*)', () => {
  it('AC-1401.18 친 증상 글이 든 EmrShtVal 줄을 기록지 코드마다 세고(symptomCode), 14일 기록지 코드 짝 15개(sheetCode)를 코드·건수·길이만 적는다', () => {
    expectAc('AC-1401.18')
  })

  it('AC-1401.19 지난 30일 상태마다 접수·수납 줄 있음·처방 있음(statusHistory), 첫 줄 build=판+check4, 단계 1/10~10/10', () => {
    expectAc('AC-1401.19')
  })

  it('AC-1401.9 기록지 코드 틀은 이름표의 이름만 [ ]로 넣고 IsSheetHits·IsSheetCodes로 확인 모드 세션만 받는다', () => {
    expectAc('AC-1401.9')
  })

  it('AC-1401.10 기록지 코드·상태 내력 답이 센티널이어도 보고서·콘솔 기록에 센티널이 없다', () => {
    expectAc('AC-1401.10')
  })

  it('AC-1401.19 [의원 PC] 확인 고침 3을 넣은 도우미가 x86 net48로 컴파일된다(실행은 의원 PC)', () => {
    const built = buildDotnet(HELPER_CSPROJ, { timeoutMs: 560_000 })
    expect(built.code, tail(built.output)).toBe(0)
  }, 580_000)
})
