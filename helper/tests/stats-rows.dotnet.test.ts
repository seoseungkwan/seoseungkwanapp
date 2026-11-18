// 도우미 통계 줄 읽기 stats.rows(TASK-3, REQ-503)의 C# 시험을 감싼다.
// - Precheck.Core.Tests.Stats(통계 SQL 사본 대조·관문, 등록 확인 → 읽기 순서·매개변수, JSON 모양·조각, 오류만 보내기, 기록)
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
// 도우미 입구(Program.cs)에 stats.rows 처리기를 붙인 한 줄은 글자로 본다(Precheck.Helper는 net48이라 여기서 돌리지 않는다).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const PROGRAM = path.join(ROOT, 'helper', 'src', 'Precheck.Helper', 'Program.cs')
let run: { code: number; output: string } = { code: -1, output: '' }

beforeAll(() => {
  run = runDotnet('Precheck.Core.Tests.Stats', { timeoutMs: 280_000 })
}, 300_000)

function count(prefix: 'Passed' | 'Failed', ac: string): number {
  const escaped = ac.replace(/\./g, '\\.')
  const pattern = new RegExp(`^\\s*${prefix} ${escaped}\\b`, 'gm')
  return (run.output.match(pattern) ?? []).length
}

function tail(text: string): string {
  return text.split('\n').slice(-40).join('\n')
}

function expectAc(ac: string) {
  expect(run.code, tail(run.output)).toBe(0)
  expect(count('Failed', ac), tail(run.output)).toBe(0)
  expect(count('Passed', ac), `${ac} 시험이 돌지 않았다\n${tail(run.output)}`).toBeGreaterThan(0)
}

describe('REQ-503 도우미 통계 줄 읽기 stats.rows (C# Precheck.Core.Tests.Stats)', () => {
  it('AC-503.1 등록 확인 뒤 진료 줄·기간 합계·날짜별·처방 이름을 JSON 하나로 chunk … end에 보낸다(이름·전화 칸 없음)', () => {
    expectAc('AC-503.1')
  })

  // 이름공간까지 적은 한 줄: using 줄을 더하지 않아 합치기 자리가 이 한 줄뿐이다(cross-branch C4).
  // 컴파일되는지는 helper-fixups.dotnet.test.ts(AC-005.8)의 Precheck.Helper Release 빌드가 본다
  it('AC-503.1 도우미 입구는 지금 bit 명령 다음 줄에 stats.rows 처리기를 붙인다(한 줄)', () => {
    const lines = readFileSync(PROGRAM, 'utf8').split(/\r?\n/).map((line) => line.trim())
    const bit = lines.indexOf('BitCommands.Register(dispatcher, HelperServices.Create());')
    expect(bit).toBeGreaterThan(-1)
    expect(lines[bit + 1]).toBe('Precheck.Core.Stats.StatsCommands.Register(dispatcher, HelperServices.Create());')
    expect(lines.filter((line) => line.includes('StatsCommands'))).toHaveLength(1)
  })

  it('AC-503.2 AC-1001.3 StatsSql 상수는 연결 조건 한 가지만 바꾼 원본 사본과 공백만 다르고(진료 줄은 처방 코드 거르기 한 덩어리만 뺌) ReadOnlyGuard를 지난다, Sql.All은 그대로', () => {
    expectAc('AC-503.2')
  })

  it('AC-503.3 과거 이관 자료 E-STATS-HISTORY · 700,000줄 넘음 E-STATS-TOO-BIG · SQL 실패 E-BIT-READ-FAILED를 반쪽 자료 없이 error만', () => {
    expectAc('AC-503.3')
  })

  it('AC-503.4 진단 기록에는 시각·명령 이름·오류 번호만(차트번호·처방코드·숫자 없음)', () => {
    expectAc('AC-503.4')
  })

  it('AC-503.5 접수 줄 PatientDaysSql은 Visits 글 + 정해 둔 SELECT(OdrInf 없음)로 VisitRowsSql 바로 다음에 돌고, 700,000줄 넘으면 E-STATS-TOO-BIG, 답은 v 2에 patientDays가 days 바로 뒤', () => {
    expectAc('AC-503.5')
  })
})

describe('REQ-2701 도우미가 stats.rows 답 v3에 접수 줄·사람 줄·원장님 자료를 싣는다 (C# Precheck.Core.Tests.Stats)', () => {
  it('AC-2701.1 접수 줄 visits는 접수마다 [차트번호|null, 진료일, 접수 시각 HHmm|null, 보험 이름|null, 진료의 코드|null]이고 v2 열쇠는 그대로다', () => {
    expectAc('AC-2701.1')
  })

  it('AC-2701.2 보험 이름은 InsMst에서 InsAdpDte가 접수 날 이하인 가장 늦은 줄의 InsCodNam(앞뒤 빈칸 뺌), 없으면 null', () => {
    expectAc('AC-2701.2')
  })

  it('AC-2701.3 사람 줄 people은 환자마다 [차트번호, 생년월일|null, 주소 앞부분|null]이고 이름·전화·주민번호·상세주소·성별은 읽지 않는다', () => {
    expectAc('AC-2701.3')
  })

  it('AC-2701.4 원장님 줄 doctors는 코드마다 [코드, 이름|null], 이름은 UidExpDte가 가장 늦은 줄의 UidNam(40자까지)', () => {
    expectAc('AC-2701.4')
  })

  it('AC-2701.5 날·원장님 금액 doctorDays는 달마다 정상수납 + 미수입금을 수납일·진료의로 묶은 총진료비(원 단위 정수, 0원 줄 없음)', () => {
    expectAc('AC-2701.5')
  })

  it('AC-2701.6 새 SQL은 모두 매개변수를 받는 SELECT 하나이고 Sql.IsAllowed를 지나며 150초 제한이다', () => {
    expectAc('AC-2701.6')
  })

  it('AC-2701.7 지금 C# 시험(StatsRows·StatsSql·StatsReport)과 원본 SQL 사본 대조 시험은 기대값을 바꾸지 않고 통과한다', () => {
    expectAc('AC-2701.7')
  })
})

describe('REQ-4401 도우미가 환자·날마다 90일초진 접수 수를 보낸다 (C# Precheck.Core.Tests.Stats)', () => {
  it('AC-4401.1 patientDays 한 줄은 [환자, 날, 접수 수, 첫 내원일, 90일초진 접수 수] 다섯 칸이고 다섯째 칸은 그 환자·날 OcmDgsNfs = 3인 접수 수, 답의 v는 4', () => {
    expectAc('AC-4401.1')
  })

  it('AC-4401.2 PatientDaysSql만 바뀐다: 자기 SELECT에서 OcmInf를 접수 번호로 잇고 다섯째 칸을 센다, 공유 Visits CTE·다른 문장은 그대로, HASH 힌트는 한 번', () => {
    expectAc('AC-4401.2')
  })

  it('AC-4401.3 첫 내원일인 환자·날도 그날 90일초진 접수 수를 고치지 않고 그대로 보낸다', () => {
    expectAc('AC-4401.3')
  })
})

describe('REQ-6201 도우미 통계 접수 줄에 신환 표시 수 · 답 v5 (spec new-mark, C# Precheck.Core.Tests.Stats)', () => {
  it('AC-6201.1 patientDays 한 줄은 [환자, 날, 접수 수, 첫 내원일, 90일초진 접수 수, 신환 표시 접수 수] 여섯 칸이고 여섯째 칸은 그 환자·날 센 접수 가운데 OcmDgsNfs = 1인 수, 답의 v는 5', () => {
    expectAc('AC-6201.1')
  })

  it('AC-6201.2 신환 표시가 없는 환자·날은 여섯째 칸이 0이고 넷째 칸(첫 내원일)·다섯째 칸은 지금과 같다', () => {
    expectAc('AC-6201.2')
  })
})

describe('REQ-6106 도우미 0.11.0이 stats.rows 답 v5에 환자·날 금액 줄을 더한다 (spec stats-insights, C# Precheck.Core.Tests.Stats)', () => {
  it('AC-6106.1 pays 줄은 [차트번호, 수납일, 금액]이고 환자·날마다 정상수납 + 미수입금 OrpTotAmt 합(원장님별 금액과 같은 기준 줄, 원 단위 정수, 0원 줄 없음, 음수 그대로), 답 v는 5, 도우미 판 0.11.0', () => {
    expectAc('AC-6106.1')
  })
})
