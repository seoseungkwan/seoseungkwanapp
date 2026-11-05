// 비트 읽기 묶음·캐시(BoardReader·BoardCache, TASK-12, REQ-1403)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/BoardReader.test.cs·BoardCache.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// 이 TASK의 시험은 Cache 이름 공간에만 있다(같은 폴더의 다른 TASK 시험은 돌리지 않는다)
const FILTER = 'Precheck.Core.Tests.Reception.Cache.'
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

describe('REQ-1403 비트 읽기 묶음·캐시 (C# Precheck.Core.Tests.Reception.Cache)', () => {
  it('AC-1403.2 마지막 읽기가 끝난 지 묶음 시간(ReceptionTiming.CacheSeconds, 4초) 안이면 다시 읽지 않고 같은 날 줄, 여러 요청이 한꺼번에 와도 읽기(등록 확인·연결 포함)는 한 번', () => {
    expectAc('AC-1403.2')
  })

  it('AC-1403.3 요청이 없으면 시간이 지나도 비트를 찾거나 열거나 읽지 않는다(타이머 없음)', () => {
    expectAc('AC-1403.3')
  })

  it('AC-1403.4 3초 넘게 걸린 읽기 뒤에는 걸린 시간의 3배(60초까지) 쉼, 읽기 한 번 8초(문장마다 남은 시간, 다 쓰면 시간 지남)', () => {
    expectAc('AC-1403.4')
  })

  it('AC-1403.5 등록 없음·병원 다름·연결 실패·읽기 실패·뜻밖의 예외·시간 지남은 볼 수 없음(번호만), 앞 날 줄을 버리고 실패 뒤 10초 동안 다시 읽지 않음', () => {
    expectAc('AC-1403.5')
  })

  it('AC-1403.6 그날 @from·@to와 등록 범위로 정해 둔 차례대로 읽어 VisitRow로, 날이 바뀌면 묶음 시간 안이어도 새 날만 읽고 열쇠가 새로 된다', () => {
    expectAc('AC-1403.6')
  })

  it('AC-1403.7 처방 이름은 하루 한 번 읽은 이름표로 붙이고(코드 순, 없으면 코드만), 날이 바뀌거나 못 읽었으면 다시 읽는다', () => {
    expectAc('AC-1403.7')
  })

  it('AC-1403.8 fresh는 묶음(4초)만 건너뛴다: 읽는 중이면 함께 기다림, 2초 안이면 그 결과, 3배 쉼·실패 뒤 10초는 그대로, 한꺼번에 눌러도 읽기는 하나', () => {
    expectAc('AC-1403.8')
  })
})
