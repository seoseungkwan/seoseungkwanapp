// 도우미 매출 읽기(TASK-3, REQ-003)와 날마다 처방별 금액(spec stats-revenue TASK-1, REQ-4101)·확인 필요한 날의 참고 금액(spec first90 TASK-1, REQ-4405)·
// 그런 날도 금액을 다 읽는 도우미 0.13.0(spec bit-total TASK-9, REQ-6912)의 C# 시험(helper/tests/Precheck.Core.Tests/Revenue/*.test.cs)을 감싼다.
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
  it('AC-003.1 AC-1001.3 AC-6912.1 관문 → HistoryGuard 한 번 → 날마다 문장 5개(세 검사 없이 금액 넷 → Patients), 금액이 음수인 날만 참고 금액 문장 2개를 더해 7개, 원본 문장은 연결 조건 한 가지만 바꾼 사본과 공백·끝 ;·-- 줄만 다르고 Extra 둘은 정해 둔 줄만 다르다', () => {
    expectAc('AC-003.1')
  })

  it('AC-003.2 AC-6912.1 세 검사에 걸리던 날도 보통 날처럼 금액을 읽고, total·cash·card·transfer·receivableIn의 음수는 unconfirmed와 금액 아홉 칸 null, insurer + copay ≠ 요양비용총액(버리기 전 값)·나눔 네 칸의 음수는 splitUnconfirmed와 그 네 칸만 null, 아니면 맞는 칸에서 원 미만 버림, otherTotal은 나머지', () => {
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

  it('AC-003.8 ReadOnlyGuard는 매출 문장 11개를 정해 둔 매개변수와 함께만 통과, 읽기 문장 하나, 기존 Sql 상수는 그대로', () => {
    expectAc('AC-003.8')
  })
})

describe('REQ-4101 도우미 날마다 처방별 금액 dayCodes (C# Precheck.Core.Tests.Revenue)', () => {
  it('AC-4101.1 답은 {days, codes, dayCodes}, days·codes는 지금과 같고 dayCodes는 [날짜, 코드, 건수, 금액|null] 줄의 목록, 날짜 차례·같은 날은 코드 글자 차례', () => {
    expectAc('AC-4101.1')
  })

  it('AC-4101.2 CodeAmountsByDay는 CodeAmounts와 WHERE·금액 식·MissingValues가 같고 LEFT(o.OdrDtm,8)·코드로 묶는 것만 다르며 이름·차트번호·환자 칸 없음, 기간에 한 번·@from·@to·@hospital뿐, 관문 통과, 바꾼 문장·다른 매개변수는 DB 앞에서 막힘', () => {
    expectAc('AC-4101.2')
  })

  it('AC-4101.3 날마다 공백 뺀 같은 코드 합침, 모양 틀림·_REST → 그날 _REST, 하루 300개를 넘으면 금액 큰 차례 299개 + _REST(금액 null 맨 뒤), 합친 금액에서 원 미만 버림, 빠진 값 → null, 하루 300줄·9,300줄 이하', () => {
    expectAc('AC-4101.3')
  })

  it('AC-4101.4 날 단위 문장 읽기 실패·답 모양 틀림·기간 밖 날이면 일부만 답하지 않고 E-BIT-READ-FAILED 하나', () => {
    expectAc('AC-4101.4')
  })

  it('AC-4101.5 AC-4405.3 도우미 판(0.6.0 다음 0.7.0), 명령 표 revenue.days는 그대로(새 명령·새 인자 없음)', () => {
    expectAc('AC-4101.5')
  })
})

describe('REQ-4405 도우미가 확인 필요한 날의 참고 금액을 보낸다 · 판 0.7.0 (C# Precheck.Core.Tests.Revenue)', () => {
  it('AC-4405.1 AC-6912.2 unconfirmed인 날(이제 금액이 음수인 날만)에 roughTotal = 그날 정상수납 + 미수입금 줄 총진료비 합(줄마다 원 미만 버림, 환불 음수 그대로), 원장님별 doctorDays와 같은 문장', () => {
    expectAc('AC-4405.1')
  })

  it('AC-4405.2 확인된 날(세 검사에 걸리던 날 포함)·나눔만 못 센 날은 roughTotal 열쇠가 없고 다른 칸은 그대로', () => {
    expectAc('AC-4405.2')
  })

  it('AC-4405.3 도우미 판 0.7.0, 명령 목록은 그대로', () => {
    expectAc('AC-4405.3')
  })
})

describe('REQ-6912 도우미 0.13.0 — 그런 날도 금액을 다 읽는다 (spec bit-total, C# Precheck.Core.Tests.Revenue)', () => {
  it('AC-6912.1 세 검사 문장(UnsupportedFinance·FinanceMultiplicity·ReceivableMultiplicity)을 돌리지 않고 날마다 FinanceNormal → FinanceReceivable → FinanceNormalExtra → FinanceReceivableExtra → Patients 다섯, 세 검사에 걸리던 날도 확인된 날과 같은 칸·규칙으로 금액 아홉 칸, 두 표시 거짓·roughTotal 열쇠 없음', () => {
    expectAc('AC-6912.1')
  })

  it('AC-6912.2 total·cash·card·transfer·receivableIn이 음수면 지금처럼 unconfirmed 참·금액 아홉 칸 null·roughTotal = 참고 금액(원장님별 문장 둘, Patients 앞에 한 번씩, 그날 문장 일곱)', () => {
    expectAc('AC-6912.2')
  })

  it('AC-6912.3 나눔 검사는 지금 그대로: insurer + copay ≠ 요양비용총액(버리기 전)·나눔 칸 음수면 splitUnconfirmed, 네 칸만 null·다섯 칸은 채움, 세 검사에 걸리던 날도 같다', () => {
    expectAc('AC-6912.3')
  })

  it('AC-6912.6 도우미 판 0.13.0, 명령 표(13개·protocol 1)와 revenue.days 답의 칸 이름은 그대로', () => {
    expectAc('AC-6912.6')
  })
})

describe('REQ-6203 매출 하루 숫자의 신환 수 (spec new-mark, C# Precheck.Core.Tests.Revenue)', () => {
  it('AC-6203.1 RevenueSql.Patients 신환 칸은 기간 안 신환 표시 접수가 하나라도 있는 서로 다른 환자 수, 나머지 칸은 그대로, 원본 사본과는 이 한 칸 바꿈(시험 상수 NewMarkPatients)만 다르고 보고 Patients와 글자가 같다', () => {
    expectAc('AC-6203.1')
  })
})
