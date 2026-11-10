// ERP 도우미 마감일지 숫자 읽기(spec erp-closing-fill TASK-3, REQ-3602~3606)와 두 명령 잇기(TASK-6)의 C# 시험
// (helper-erp/tests/Erp.Core.Tests/Closing/*.test.cs, TASK-11이 기존 도우미에서 옮김)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
// ERP 도우미 입구(Erp.Helper/Program.cs)에 처리기를 붙인 줄은 TASK-12 시험이 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Erp.Core.Tests.Closing'
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

describe('REQ-3602 closing.codes (C# Erp.Core.Tests.Closing)', () => {
  it('AC-3602.1 어제까지 365일 처방 코드(앞뒤 공백 없는 대문자)·코드표 첫 줄 이름·진료 수, 진료 수 차례 2,000개, 예약 메모 목록(Memo+번호는 번호만)', () => {
    expectAc('AC-3602.1')
  })

  it('AC-3602.2 코드 이름·메모 이름의 줄바꿈·제어 문자·짝 없는 대리쌍을 지운다(revenue.days 규칙)', () => {
    expectAc('AC-3602.2')
  })
})

describe('REQ-3603 closing.day 환자 수 (C# Erp.Core.Tests.Closing)', () => {
  it('AC-3603.1 groups 검사(같은 key 두 번·모르는 key·코드 수 → E-HELPER-BAD-MESSAGE), args 차례, 코드는 앞뒤 공백 뗀 대문자로 견줌', () => {
    expectAc('AC-3603.1')
  })

  it('AC-3603.2 진찰구분 1·3·0·4, 물리치료내원 환자를 재진·산정안함에서 뺌, 두 번 온 사람은 1 → 3 → 재진 → 0, ptVisit 묶음 없으면 null', () => {
    expectAc('AC-3603.2')
  })

  it('AC-3603.3 묶음마다 서로 다른 환자 수·3분류, 같은 사람이 두 묶음, 받은 사람이 없으면 0', () => {
    expectAc('AC-3603.3')
  })

  it('AC-3603.4 연령 10줄(9·10·99·100세), 생년월일 없음은 unknownAge', () => {
    expectAc('AC-3603.4')
  })
})

describe('REQ-3604 closing.day 금액과 경고 (C# Erp.Core.Tests.Closing)', () => {
  it('AC-3604.1 금액이 revenue.days 그날 값과 같고 미수입금 나눔을 더함, unconfirmed·split은 그대로 더한 값 + 경고 표시', () => {
    expectAc('AC-3604.1')
  })

  it('AC-3604.2 미수발생·감액·장애인기금·환불(음수면 부호 뗌), 없으면 0', () => {
    expectAc('AC-3604.2')
  })

  it('AC-3604.3 치료별 매출 = 묶음 사람들의 그날 진료 총진료비 합, 수납 없는 진료는 0으로 더하고 unpaidVisits', () => {
    expectAc('AC-3604.3')
  })

  it('AC-3604.4 inpatientVisits = 외래가 아닌 접수 수', () => {
    expectAc('AC-3604.4')
  })
})

describe('REQ-3605 closing.day 예약·주사 (C# Erp.Core.Tests.Closing)', () => {
  it('AC-3605.1 예약 메모 번호마다 total·visited·changed·canceled, 예약 환자 수', () => {
    expectAc('AC-3605.1')
  })

  it('AC-3605.2 주사 셋(firstTime·newPatients·newLines), HistoryGuard ≠ 0이면 firstTime null·noHistory', () => {
    expectAc('AC-3605.2')
  })
})

describe('REQ-3606 도우미가 지키는 것 (C# Erp.Core.Tests.Closing)', () => {
  it('AC-3606.1 새 문장은 모두 SELECT 하나이고 ErpReadGuard·매개변수 표와 맞음(기존 Sql.IsAllowed는 모름), 표 밖·틀린 매개변수는 E-BIT-READ-FAILED', () => {
    expectAc('AC-3606.1')
  })

  it('AC-3606.2 이름·전화·주민·주소·메모 칸을 읽지 않고 차트번호·생년월일을 결과 칸으로 내지 않음, 답 JSON 칸이 design.md 2절과 같음', () => {
    expectAc('AC-3606.2')
  })
})

describe('TASK-6 두 명령 잇기 (C# Erp.Core.Tests.Closing.ClosingCommandsTests)', () => {
  it('AC-3601.3 ERP 명령 표로 closing.codes·closing.day는 result 하나, 기존 도우미(웹 표)는 closing.*를 모르고 ERP 도우미의 revenue.days·hello·claim.month는 E-HELPER-UNKNOWN-COMMAND', () => {
    expectAc('AC-3601.3')
  })

  it('AC-3606.3 등록 안 된 PC·다른 병원은 revenue.days와 같은 번호, 진단 기록은 시각·명령 이름·오류 번호만', () => {
    expectAc('AC-3606.3')
  })
})
