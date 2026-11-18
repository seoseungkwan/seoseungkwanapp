// 수납일지 도우미 하루 장부 읽기·달 파일 sunap 칸(spec sunap-ilji TASK-1, REQ-4902)과 장부 줄 원장님(spec sunap-doctors TASK-1, REQ-5002),
// 장부 미수에서 건강생활유지비(QCV) 빼기(spec sunap-health TASK-1, REQ-5401), 장부 줄 끝 건강생활 칸·답 v3·판 0.10.0(spec clinic-calendar TASK-2, REQ-5908)의 C# 시험을 감싼다
// (helper/tests/Precheck.Core.Tests/Sunap/*.test.cs·Store/WorkStoreSunap.test.cs·Protocol/CommandTable.test.cs의 Sunap 시험).
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Sunap'
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

describe('REQ-4902 도우미 하루 장부 읽기와 PC 저장 · 판 0.10.0 (C# Precheck.Core.Tests Sunap)', () => {
  it('AC-4902.1 contact.targets {kind:sunap, from:D, to:D}는 {v, day, unsure, rows, paid} 하나를 조각으로, 하루가 아니거나 오늘−62일 ~ 오늘 밖이면 E-HELPER-BAD-MESSAGE, 새 SQL은 허용 목록의 SELECT', () => {
    expectAc('AC-4902.1')
  })

  it('AC-4902.2 rows는 그날 센 내원 환자마다 한 줄(첫 접수·new/d90/re·현금·카드·계좌·미수·처방코드 합집합)', () => {
    expectAc('AC-4902.2')
  })

  it('AC-4902.3 rsv는 다음 날 0시 이후 가장 이른 예약 [시각, 메모 앞 40자] 또는 null', () => {
    expectAc('AC-4902.3')
  })

  it('AC-4902.4 paid는 예전 미수를 낸 환자 [차트, 이름, 시각, 현금, 카드], unsure는 매출 확인 필요 조건과 같다', () => {
    expectAc('AC-4902.4')
  })

  it('AC-4902.5 store.save {month, sunap}은 sunap만 바꾸고 store.load 달마다 sunap(없으면 {})', () => {
    expectAc('AC-4902.5')
  })

  it('AC-4902.6 도우미 판 0.10.0, 명령 이름 목록은 그대로', () => {
    expectAc('AC-4902.6')
  })
})

describe('REQ-5002 도우미 0.9.0 — 장부 줄에 원장님 (C# Precheck.Core.Tests Sunap)', () => {
  it('AC-5002.1 답 v는 2이고 rows 줄 끝에 진료의 코드 한 칸(빈 값 뺀 가장 작은 OcmDtrCod, 없으면 null, 40자 넘으면 E-BIT-READ-FAILED)', () => {
    expectAc('AC-5002.1')
  })

  it('AC-5002.2 맨 위 doctors에 rows 코드마다 [코드, 이름|null] 한 번(통계 원장님 이름 규칙)', () => {
    expectAc('AC-5002.2')
  })

  it('AC-5002.3 도우미 판 0.10.0', () => {
    expectAc('AC-5002.3')
  })
})

describe('REQ-5401 도우미 0.9.1~ — 장부 미수에서 건강생활유지비(QCV)를 뺀다 (C# Precheck.Core.Tests Sunap)', () => {
  it('AC-5401.1 미수 = 본인부담 총액 − (현금 + 카드 + 계좌 + 그 내원들의 QCV OrcNewAmt 합), 0보다 작으면 0, 내원 QCV 합이 음수면 0으로 봄, 현금·카드·계좌 칸은 그대로', () => {
    expectAc('AC-5401.1')
  })

  it('AC-5401.2 그날 MoneySql에 나온 그 차트의 내원 번호 QCV만 센다, 새 SQL은 허용 목록의 읽기 전용 SELECT 하나, 원 미만 버림', () => {
    expectAc('AC-5401.2')
  })

  it('AC-5401.3 도우미 판 0.10.0, 답 v:3·명령 이름 목록은 그대로', () => {
    expectAc('AC-5401.3')
  })
})

describe('REQ-5908 도우미 0.10.0 — 수납일지 장부 줄 끝 건강생활유지비 (C# Precheck.Core.Tests Sunap)', () => {
  it('AC-5908.1 답 v는 3이고 rows 줄마다 끝에 건강생활유지비 한 칸(미수에서 빼는 Health와 같은 값, 원 미만 버린 0 이상 정수)이 더해져 12칸, 미수 셈과 다른 칸은 그대로', () => {
    expectAc('AC-5908.1')
  })
})

describe('REQ-6204 수납일지 신환은 비트 신환 표시로 (spec new-mark, C# Precheck.Core.Tests Sunap)', () => {
  it('AC-6204.1 환자 줄 종류는 그날 신환 표시(OcmDgsNfs = 1) 센 접수가 있으면 new, 아니면 90일초진 접수가 있으면 d90, 아니면 re(첫 내원일은 읽기만 하고 종류에 쓰지 않음)', () => {
    expectAc('AC-6204.1')
  })
})

// 2026-11-17 helper-v0.9.1 GitHub 윈도우 빌드에서 시험이 깨짐: 윈도우 받기(core.autocrlf=true)는 @"…" 여러 줄 글에 CRLF를 넣어
// HealthSql이 시험 글(\n)·가짜 DB 열쇠와 달라졌다. 그래서 HealthSql은 줄바꿈을 "\n"으로 적는다(파일 줄바꿈과 상관없이 같은 글)
describe('AC-5401.2 HealthSql 글은 파일 줄바꿈과 상관없다', () => {
  it('AC-5401.2: SunapSql.cs의 HealthSql은 @"…" 여러 줄 글이 아니고 "\n"으로 줄을 바꾼다', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('../src/Precheck.Core/Sunap/SunapSql.cs', import.meta.url), 'utf8')
    const start = source.indexOf('string HealthSql =')
    expect(start).toBeGreaterThan(0)
    const body = source.slice(start, source.indexOf(';', start))
    expect(body).not.toMatch(/=\s*@"/)
    expect(body).toContain('\n')
  })
})
