// 상세(HistoryReader·HistoryBuilder, TASK-13, REQ-1404)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/HistoryReader.test.cs·HistoryBuilder.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// 이 TASK의 시험은 Detail 이름 공간에만 있다(같은 폴더의 다른 TASK 시험은 돌리지 않는다)
const FILTER = 'Precheck.Core.Tests.Reception.Detail.'
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

describe('REQ-1404 지난 진료 전부 (C# Precheck.Core.Tests.Reception.Detail)', () => {
  it('AC-1404.1 그 접수보다 앞선 완료 내원을 최근 순으로 처음 5번, 그 뒤는 20번씩(next·more), 그 환자 한 명만 그때 읽는다(서버에 쌓지 않음)', () => {
    expectAc('AC-1404.1')
  })

  it('AC-1404.2 내원마다 날짜 글(올해 "10월 29일"·다른 해 "2024년 3월 12일"), "N일 전"(같은 날 "오늘"), 증상 글(없으면 ""), 처방 목록(이름·코드, 코드 순)', () => {
    expectAc('AC-1404.2')
  })

  it('AC-1404.3 모두 n+1번(오늘 포함), 처음 온 날(없으면 오늘), 안 보인 내원 수 more(0이면 next 없음), 첫 방문은 지난 진료가 없음', () => {
    expectAc('AC-1404.3')
  })

  it('AC-1404.4 오늘 카드: 제목 "M월 D일 · 오늘", 이름표 넷(진료 전·진료보류·수납대기·수납완료), 처방 없을 때 글, 오늘 증상(todaySym)', () => {
    expectAc('AC-1404.4')
  })

  it('AC-1404.5 그날 열쇠표에 없는 열쇠·모양이 틀린 열쇠·음수나 숫자 아닌 시작 위치는 비트를 읽지 않고 환자 자료 없음(404)', () => {
    expectAc('AC-1404.5')
  })
})
