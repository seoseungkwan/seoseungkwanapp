// 주사 차수 → 접수메모(당일)(spec injection-memo TASK-1)의 Core C# 시험(helper/tests/Precheck.Core.Tests/InjectionMemo/*.test.cs,
// namespace Precheck.Core.Tests.InjectionMemo)을 감싼다. dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고
// 하나도 실패하지 않았는지 본다. 비트 DB는 가짜(FakeDb), 증상 글·메모·차트번호는 지어낸 것이다. 접수 화면 칸·단추(윈도우 층)는 의원 PC에서 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.InjectionMemo'
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

describe('REQ-7501 차수 규칙 (C# Precheck.Core.Tests.InjectionMemo)', () => {
  it("AC-7501.1 '<좌우>)<부위·약> N차': '주사'·덧붙이·신경차단 이름 빼고, 오)·왼)·양), 목·허리는 좌우 없음, 영어 부위는 우리말, 약 이름만이면 약 이름만", () => {
    expectAc('AC-7501.1')
  })

  it("AC-7501.2 그날 한 것 +1, 다음 계획('합니다'·요일·간격·'다음') 그대로, 번호 둘이면 앞 번호, 'N차까지'만이면 지난 메모 +1(넘으면 끝남, 없으면 기록 없음)", () => {
    expectAc('AC-7501.2')
  })

  it('AC-7501.3 오늘 앞 30일에서 주사 차수(ESWT·도수·충격파 빼고)가 적힌 마지막 내원, 없으면 기록 없음, 부위는 앞말 → 주사 말 줄 → 다른 줄(쉼표)', () => {
    expectAc('AC-7501.3')
  })

  it('AC-7501.4 간격(숫자 + 주·주일·일·개월·달·wk·week + 뒤·후·간격·마다)이 있고 (그날 + 간격) − 3일보다 일찍이면 일찍 옴(계획 날짜), 간격 없으면 넣음', () => {
    expectAc('AC-7501.4')
  })

  it('AC-7501.5 시안 4줄과 30일 대조 모양별 지어낸 예마다 정한 글·결과', () => {
    expectAc('AC-7501.5')
  })
})

describe('REQ-7502 비트 읽기 (C# Precheck.Core.Tests.InjectionMemo)', () => {
  it('AC-7502.1 허용 목록의 읽기 전용 SELECT 둘(외래 내원·OcmRefCmt, EmrInf S 줄)을 @cht·@from·@to로 5초 안에, 잇기는 메모리, 실패·시간 지남은 읽기 실패', () => {
    expectAc('AC-7502.1')
  })
})

describe('REQ-7503 메모 넣기 (C# Precheck.Core.Tests.InjectionMemo)', () => {
  it("AC-7503.1 비었으면 새 글, 있으면 '있던 글/새 글', 이미 주사 'N차'가 있으면 이미 있음", () => {
    expectAc('AC-7503.1')
  })

  it('AC-7503.3 알림 글은 시안 그대로, 환자 값·메모 글은 결과 글자에 남지 않음', () => {
    expectAc('AC-7503.3')
  })
})

describe('REQ-7505 엑스레이 경과 (C# Precheck.Core.Tests.InjectionMemo)', () => {
  it("AC-7505.1 30일 안 모든 내원(없으면 그 전 마지막 내원) 증상 줄의 표 부위를 메모 부위로 나온 차례·중복 없이, 좌우 안 가림, 한 글자 부위는 조사일 때만", () => {
    expectAc('AC-7505.1')
  })

  it('AC-7505.2 무릎 1년·그 밖 2년 안에 인정 코드가 없으면(기록 없어도) 경과', () => {
    expectAc('AC-7505.2')
  })

  it("AC-7505.4 경과만 넣고 주사는 끝남·일찍 옴이면 초록 '넣었어요' 아래 이유 노랑, 기록 없음·이미 있음은 초록 하나만", () => {
    expectAc('AC-7505.4')
  })

  it("AC-7505.3 주사 부위 하나가 경과면 'xrN년경과'를 뒤에, 다른 부위는 '<부위> xrN년경과', 주사 없어도 경과만, 칸에 xr 있으면 안 붙임, 50자 넘으면 뒤 조각부터 뺌", () => {
    expectAc('AC-7505.3')
  })
})

describe('REQ-7506 영상 처방 읽기 (C# Precheck.Core.Tests.InjectionMemo)', () => {
  it('AC-7506.1 허용 목록 SELECT로 코드 앞 3글자별 마지막 날짜(2년), 30일 안 증상 없을 때만 그 전 마지막 내원 증상 줄, 실패는 읽기 실패', () => {
    expectAc('AC-7506.1')
  })
})

describe('REQ-7504 설정 (C# Precheck.Core.Tests.InjectionMemo)', () => {
  it('AC-7504.1 기본 F8·0, 단축키 F4·F8·F10·F11만, 단추 자리 -400~400px, memo-settings.json, 깨진 파일은 기본값', () => {
    expectAc('AC-7504.1')
  })
})
