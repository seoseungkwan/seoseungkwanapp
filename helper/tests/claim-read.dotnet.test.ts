// 한 달 자료·12개월 이력 읽기(TASK-8, REQ-008)의 C# 시험을 감싼다.
// - Precheck.Core.Tests.Claim(claim.month 한 JSON·조각, 실패하면 error만, 12개월 이력·상병 추세·처방 목록, claim.dates)
// - Precheck.Core.Tests.Bit(원본 SQL 사본 비교, 비트 통계 화면 표 → 줄, 화면 정의·메뉴·권한)
// dotnet test를 이름공간마다 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
// 윈도우 전용 시험(Precheck.Windows.Tests/Claim: 메뉴 파일·DLL 없음·시간 제한)은 Actions 윈도우에서, 실제 비트 통계 화면은 의원 PC에서 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTERS = ['Precheck.Core.Tests.Claim', 'Precheck.Core.Tests.Bit'] as const
let runs: { filter: string; code: number; output: string }[] = []

beforeAll(() => {
  runs = FILTERS.map((filter) => ({ filter, ...runDotnet(filter, { timeoutMs: 280_000 }) }))
}, 600_000)

function count(prefix: 'Passed' | 'Failed', ac: string): number {
  const escaped = ac.replace(/\./g, '\\.')
  const pattern = new RegExp(`^\\s*${prefix} ${escaped}\\b`, 'gm')
  return runs.reduce((sum, run) => sum + (run.output.match(pattern) ?? []).length, 0)
}

function tail(text: string): string {
  return text.split('\n').slice(-40).join('\n')
}

function expectAc(ac: string) {
  for (const run of runs) expect(run.code, `${run.filter}\n${tail(run.output)}`).toBe(0)
  const all = runs.map((run) => tail(run.output)).join('\n')
  expect(count('Failed', ac), all).toBe(0)
  expect(count('Passed', ac), `${ac} 시험이 돌지 않았다\n${all}`).toBeGreaterThan(0)
}

describe('REQ-008 한 달 자료·12개월 이력 읽기 (C# Precheck.Core.Tests.Claim · Bit)', () => {
  it('AC-008.1 claim.month: 83·83D·47 표 줄 + 12개월 이력(시작 365일 전~끝, 400일 안) + 상병 추세 + 처방 목록을 JSON 하나로 만든 뒤 조각으로, 원본이 읽는 칸만', () => {
    expectAc('AC-008.1')
  })

  it('AC-008.2 이력·이미 있는 메모·상병 추세 SQL은 Sql.cs와 원본이 공백만 다르고, 이력 줄은 {v, p, d, c[], m}', () => {
    expectAc('AC-008.2')
  })

  it('AC-008.3 비트 통계 화면 표(가짜) → GridRows: 키(83·83D·47)별 원본 칸 이름으로 줄, 필요한 칸이 없으면 E-BIT-EXPORT-FAILED', () => {
    expectAc('AC-008.3')
  })

  it('AC-008.4 표·SQL 하나라도 읽기 실패·시간 초과면 end 없이 error(E-BIT-READ-FAILED·E-BIT-EXPORT-FAILED) 하나만, 반쪽 자료 없음', () => {
    expectAc('AC-008.4')
  })

  it('AC-008.5 claim.dates → result {days: [{date, visits, memoInBit}]} 숫자만, 진료 0건인 날은 뺌, 원본 방문 조건으로 셈', () => {
    expectAc('AC-008.5')
  })
})
