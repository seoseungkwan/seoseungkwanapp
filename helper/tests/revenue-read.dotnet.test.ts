// 도우미 매출 읽기(TASK-3, REQ-003)의 C# 시험(helper/tests/Precheck.Core.Tests/Revenue/*.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.Revenue'
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

describe('REQ-003 도우미 매출 읽기 (C# Precheck.Core.Tests.Revenue)', () => {
  it('AC-003.1 관문 → HistoryGuard 한 번 → 날마다 세 검사를 원본 순서대로, 지난 날 문장 8개·걸린 날 2~4개, 원본 문장은 사본과 공백·끝 ;·-- 줄만 다르고 Extra 둘은 정해 둔 줄만 다르다', () => {
    expectAc('AC-003.1')
  })

  it('AC-003.2 세 검사·total·cash·card·transfer·receivableIn의 음수는 unconfirmed와 금액 아홉 칸 null, insurer + copay ≠ 요양비용총액(버리기 전 값)·나눔 네 칸의 음수는 splitUnconfirmed와 그 네 칸만 null, 아니면 맞는 칸에서 원 미만 버림, otherTotal은 나머지', () => {
    expectAc('AC-003.2')
  })

  it('AC-003.3 Patients 칸으로 visits·newPatients·returnVisits, 검사 칸이 0이 아니면 셋 다 null, HistoryGuard ≠ 0이면 신환·재진 null', () => {
    expectAc('AC-003.3')
  })

  it('AC-003.4 visits는 Patients 첫째 칸(PeriodVisits 줄 수), 문장 글자의 PeriodVisits에 세 조건이 있고 허용 목록에 VC·CN·CR이 없다(접수취소가 빠진다는 증명은 아니다)', () => {
    expectAc('AC-003.4')
  })

  it('AC-003.5 CodeAmounts로 코드별 건수·금액·이름, 값 빠짐 amount null, 같은 코드 합침, 모양 틀림·금액 순 999번째 뒤는 _REST 한 줄, 이름의 제어 문자 정리', () => {
    expectAc('AC-003.5')
  })

  it('AC-003.6 읽기 실패·시간 초과·관문 실패면 일부만 보내지 않고 오류 하나, to가 9999-12-31이면 도우미가 멈추지 않고 E-HELPER-BAD-MESSAGE', () => {
    expectAc('AC-003.6')
  })

  it('AC-003.7 답·진단 기록에 차트번호·이름이 없고, 답의 칸은 AC-002.2와 같다', () => {
    expectAc('AC-003.7')
  })

  it('AC-003.8 ReadOnlyGuard는 매출 문장 10개를 정해 둔 매개변수와 함께만 통과, 읽기 문장 하나, 기존 Sql 상수는 그대로', () => {
    expectAc('AC-003.8')
  })
})
