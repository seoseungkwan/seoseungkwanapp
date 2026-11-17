// PT 후 진료 종이(spec pt-slip TASK-1)의 Core 규칙 C# 시험(helper/tests/Precheck.Core.Tests/PtSlip/*.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
// 비트 DB는 가짜(FakeDb)다. 버튼·창·인쇄(윈도우 층)는 의원 PC·Microsoft Print to PDF에서 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.PtSlip'
let run: { code: number; output: string } = { code: -1, output: '' }

// 시간에는 다른 작업 사본과 함께 쓰는 잠금을 기다리는 시간도 든다. tdd-run 한도(600초) 안에서 넉넉히 둔다
beforeAll(() => {
  run = runDotnet(FILTER, { timeoutMs: 580_000 })
}, 600_000)

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

describe('REQ-6401 설정·목록 (C# Precheck.Core.Tests.PtSlip)', () => {
  it('AC-6401.1 설정 파일이 없으면 항목 8개·부위 8개 기본 목록, 프린터 빈칸, 종이 60mm, 버튼 자리 0', () => {
    expectAc('AC-6401.1')
  })

  it('AC-6401.2 목록 글은 빈칸·빈 줄·겹침을 빼고, 1~10글자 아님·쉼표·부위의 오른/왼/양은 줄 번호와 함께 거절, 1~16개만, 종이 40~150mm, 버튼 자리 -400~400px', () => {
    expectAc('AC-6401.2')
  })

  it('AC-6401.3 설정을 JSON으로 쓰고 읽으면 같은 값, 깨진 파일은 기본값', () => {
    expectAc('AC-6401.3')
  })
})

describe('REQ-6402 고르기·이름 찾기 (C# Precheck.Core.Tests.PtSlip)', () => {
  it('AC-6402.1 차트번호 글은 숫자만·앞의 0 빼고 1~14자리만 찾는다', () => {
    expectAc('AC-6402.1')
  })

  it('AC-6402.2 항목은 켜고 끄고, 쪽 → 부위는 "오른 어깨"로 들어가고 쪽은 풀린다, 겹치면 안 들어가고 ✕로 뺀다, 누른 차례로 ", "', () => {
    expectAc('AC-6402.2')
  })

  it('AC-6402.3 dbo.PbsInf의 LTRIM(RTRIM(PbsChtNum))=@cht 이름을 매개변수로 5초 안에 읽기만 하고, 빈칸·찾음·없음·오류 글', () => {
    expectAc('AC-6402.3')
  })

  it('AC-6402.4 [뽑기]는 이름을 찾았을 때만 눌린다(항목·부위는 비어도 됨)', () => {
    expectAc('AC-6402.4')
  })
})

describe('REQ-6403 종이·버튼 (C# Precheck.Core.Tests.PtSlip)', () => {
  it('AC-6403.1 여백 4mm, 머리 26%·부위 20%·항목 20%·특이사항 나머지, 이름표 칸 30%, 머리 글, 특이사항 빈칸, 시험 1장은 빈 양식', () => {
    expectAc('AC-6403.1')
  })

  it('AC-6403.2 긴 글은 큰 글씨부터 줄여 한 줄, 안 되면 두 줄, 그래도 넘치면 최소 크기에서 "…"', () => {
    expectAc('AC-6403.2')
  })

  it('AC-6403.3 비트 프로그램 이름 판단과 버튼 자리(오른쪽 끝에서 150px + 버튼 폭 + 버튼 자리, 위 4px)', () => {
    expectAc('AC-6403.3')
  })
})
