// ERP 도우미 마감일지 숫자 읽기(spec erp-closing-fill TASK-3, REQ-3602~3606)와 두 명령 잇기(TASK-6)의 C# 시험
// (helper-erp/tests/Erp.Core.Tests/Closing/*.test.cs, TASK-11이 기존 도우미에서 옮김)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
// ERP 도우미 입구(Erp.Helper/Program.cs)에 처리기를 붙인 줄은 TASK-12 시험이 본다.
// TASK-16(REQ-3616): 예약 메모 'Memo' 번호 합치기·오늘 뒤 날짜 막기·코드 목록 문장 하나는 C# 시험 + 파일 글자(같은 함수·문장 글이 design.md 그대로)로 본다.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const CLOSING = path.join(ROOT, 'helper-erp', 'src', 'Erp.Core', 'Closing')
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

function read(file: string): string {
  if (!existsSync(file)) throw new Error(`${path.relative(ROOT, file)} 파일이 없다`)
  return readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
}

/** C# 글에서 // 주석과 /// 문서 주석을 지운다(코드 줄만 본다). 문장 글(@"…")에는 //가 없다 */
function code(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/** 메서드 하나의 몸통(이름부터 다음 private/public/internal 선언 전까지) */
function method(text: string, signature: string): string {
  const start = text.indexOf(signature)
  expect(start, `${signature}를 찾지 못했다`).toBeGreaterThan(-1)
  const rest = text.slice(start + signature.length)
  const end = rest.search(/\n {4}(?:public|private|internal) /)
  return end < 0 ? rest : rest.slice(0, end)
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

  it("AC-3603.5 가운데 빈칸 코드('PROLO C')는 CheckGroups·명령 표를 지나 대문자로 견주고, 빈칸 두 칸·탭·앞뒤 공백은 E-HELPER-BAD-MESSAGE, 주사 코드는 @c 매개변수로만", () => {
    expectAc('AC-3603.5')
  })
})

describe('REQ-3604 closing.day 금액과 경고 (C# Erp.Core.Tests.Closing)', () => {
  it('AC-3604.1 금액이 revenue.days 그날 값과 같고 미수입금 나눔을 더함, unconfirmed·split은 그대로 더한 값 + 경고 표시', () => {
    expectAc('AC-3604.1')
  })

  it('AC-3604.2 미수발생·감액·장애인기금·환불(음수면 부호 뗌), 없으면 0', () => {
    expectAc('AC-3604.2')
  })

  it('AC-3604.3 치료별 매출 = 묶음 코드 처방 줄 금액(일수 × 수량 × 단가, 원내 줄, RevenueSql.CodeAmounts와 같은 식) 합, 묶음마다 원 미만 버림, 진찰료·묶음 밖 코드·총진료비는 안 더함, 수납 없는 진료도 금액 그대로 + unpaidVisits', () => {
    expectAc('AC-3604.3')
  })

  it('AC-3604.4 inpatientVisits = 외래가 아닌 접수 수', () => {
    expectAc('AC-3604.4')
  })

  it('AC-3604.6 매출 규칙: 표시 코드가 있는 진료 안의 앞글자 + 숫자 줄·더 셀 코드 줄 금액 합(한 줄 한 번, 원 미만 버림), 6개 앞글자·21개 코드·빈 글자는 E-HELPER-BAD-MESSAGE, 없으면 TASK-14 그대로, 새 문장 없음', () => {
    expectAc('AC-3604.6')
  })

  it('AC-3604.7 carm·sono 둘 다 규칙이면 overlap = 함께 있는 진료 수·각 규칙 금액, 아니면 null', () => {
    expectAc('AC-3604.7')
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

describe('REQ-3616 ERP 도우미 고침 (TASK-16, C# Erp.Core.Tests.Closing + 파일 글자)', () => {
  it("AC-3616.1 예약 메모 'Memo1'·'memo1'·' 1 '·'1'은 '1' 한 줄에 네 수를 더하고 다른 꼴은 그대로, 번호 글자 차례, closing.codes kinds와 같은 규칙", () => {
    expectAc('AC-3616.1')
  })

  it('AC-3616.1: ReadReservations와 closing.codes kinds는 같은 함수 ClosingCodes.MemoKind를 쓰고, Memo 번호 정규식은 ClosingCodes.cs 한 곳뿐이다', () => {
    const day = code(read(path.join(CLOSING, 'ClosingDay.cs')))
    const codes = code(read(path.join(CLOSING, 'ClosingCodes.cs')))
    expect(method(day, 'ClosingReservations ReadReservations(')).toContain('ClosingCodes.MemoKind(')
    expect(method(codes, 'IReadOnlyList<ClosingMemoKind> Kinds(')).toMatch(/\bMemoKind\(/)
    expect(codes).toMatch(/public static string MemoKind\(string\? raw\)/)
    expect(codes.match(/\^Memo\(\[0-9\]\+\)/g)).toHaveLength(1)
    expect(day).not.toMatch(/Memo\(\[0-9\]/)
  })

  it('AC-3616.2 closing.day date가 services.Today()보다 뒤면 등록 확인·DB 전에 E-CLOSING-FUTURE-DATE 하나(기록은 이름·번호뿐), 오늘·지난 날은 그대로', () => {
    expectAc('AC-3616.2')
  })

  it("AC-3616.2: ClosingCommands.FutureDate = 'E-CLOSING-FUTURE-DATE'이고 closing.day 처리기는 날짜 검사를 HospitalGate.Open보다 먼저 한다(closing.codes는 날짜 검사 없음)", () => {
    const commands = code(read(path.join(CLOSING, 'ClosingCommands.cs')))
    expect(commands).toMatch(/public const string FutureDate = "E-CLOSING-FUTURE-DATE";/)
    const day = commands.slice(commands.indexOf('dispatcher.Register(DayName'))
    const check = day.search(/services\.Today\(\)\.Date/)
    expect(check).toBeGreaterThan(-1)
    expect(day.indexOf('new HelperException(FutureDate)')).toBeGreaterThan(-1)
    expect(check).toBeLessThan(day.indexOf('HospitalGate.Open('))
    const codesHandler = commands.slice(commands.indexOf('dispatcher.Register(CodesName'), commands.indexOf('dispatcher.Register(DayName'))
    expect(codesHandler).not.toContain('FutureDate')
  })

  it('AC-3612.1 (도우미 쪽) 오늘보다 뒤 마감 일자에 도우미는 E-CLOSING-FUTURE-DATE로만 답하고 어느 DB 문장도 돌리지 않는다(확장은 같은 글을 보인다, TASK-17)', () => {
    expectAc('AC-3616.2')
    const commands = code(read(path.join(CLOSING, 'ClosingCommands.cs')))
    expect(commands).toContain('"E-CLOSING-FUTURE-DATE"')
  })

  it('AC-3616.3 closing.codes는 CodeListSql(50초)·MemoKindsSql(15초)만 부르고 답은 AC-3602.1 그대로(같은 자료면 같은 codes·name·visits·차례·2,000개)', () => {
    expectAc('AC-3616.3')
  })

  it('AC-3616.3: ClosingSql.CodeListSql 글은 design.md 3-2 ```sql 블록 그대로이고 CodesTimeout은 50초, ClosingCodes는 TrendTotalsSql·CodeNamesSql을 쓰지 않는다', () => {
    const design = read(path.join(ROOT, 'specs', 'erp-closing-fill', 'design.md'))
    const section = design.slice(design.indexOf('### 3-2 '), design.indexOf('### 3-3 '))
    const block = /```sql\n([\s\S]*?)\n```/.exec(section)?.[1]
    expect(block, 'design.md 3-2 sql 블록을 찾지 못했다').toBeDefined()

    const sql = read(path.join(CLOSING, 'ClosingSql.cs'))
    const constant = /public const string CodeListSql = @"([\s\S]*?)";/.exec(sql)?.[1]
    expect(constant, 'ClosingSql.CodeListSql을 찾지 못했다').toBeDefined()
    expect(constant).toBe(block)
    expect(code(sql)).toMatch(/public static readonly TimeSpan CodesTimeout = TimeSpan\.FromSeconds\(50\);/)
    expect(code(sql)).toMatch(/\[CodeListSql\] = new\[\] \{ From, To, First, Last, Hospital \}/)

    const codes = code(read(path.join(CLOSING, 'ClosingCodes.cs')))
    expect(codes).not.toMatch(/\bTrendTotalsSql\b/)
    expect(codes).not.toMatch(/\bCodeNamesSql\b/)
    expect(codes).toContain('ClosingSql.CodeListSql')
    expect(codes).toContain('ClosingSql.CodesTimeout')
    expect(codes).toMatch(/ClosingSql\.MemoKindsSql, [^,]+, Sql\.MetaTimeout\)/)
  })
})
