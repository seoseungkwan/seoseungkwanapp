// spec erp-uisarang TASK-8(REQ-4207·REQ-4208·REQ-4209): 내원·예약 셈 — 위쪽 표(UisVisits)와 환자별 아래쪽 표(UisPatients)의 C# 시험
// (helper-erp/tests/Erp.Core.Tests/Uisarang/Patients/*.test.cs, 이름 공간 Erp.Core.Tests.Uisarang.Patients — design.md 12-3)을 감싸고,
// AC-4209.3의 코드 글자(환자별 표의 이름·전화·주소 칸을 찾지 않음, 파일·네트워크·기록에 닿지 않음)를 파일 글자로 본다.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const UISARANG = path.join(ROOT, 'helper-erp', 'src', 'Erp.Core', 'Uisarang')
const PATIENTS = path.join(UISARANG, 'UisPatients.cs')
const VISITS = path.join(UISARANG, 'UisVisits.cs')
const FILTER = 'Erp.Core.Tests.Uisarang.Patients'
let run: { code: number; output: string } = { code: -1, output: '' }

beforeAll(() => {
  run = runDotnet(FILTER, { timeoutMs: 280_000 })
}, 300_000)

function lines(prefix: 'Passed' | 'Failed', name: string): number {
  const escaped = name.replace(/[.()]/g, (c) => `\\${c}`)
  return (run.output.match(new RegExp(`^\\s*${prefix} ${escaped}`, 'gm')) ?? []).length
}

function tail(text: string): string {
  return text.split('\n').slice(-40).join('\n')
}

function expectAc(ac: string) {
  expect(run.code, tail(run.output)).toBe(0)
  expect(lines('Failed', `${ac} `), tail(run.output)).toBe(0)
  expect(lines('Passed', `${ac} `), `${ac} 시험이 돌지 않았다\n${tail(run.output)}`).toBeGreaterThan(0)
}

/** 파일 글자 전체(주석 포함) */
function source(file: string): string {
  if (!existsSync(file)) throw new Error(`${path.relative(ROOT, file)} 파일이 없다`)
  return readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
}

/** C# 글에서 // 주석을 지운다(코드 줄만 본다) */
function code(file: string): string {
  return source(file)
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

describe('REQ-4207·REQ-4208·REQ-4209 UisPatients·UisVisits (C# Erp.Core.Tests.Uisarang.Patients)', () => {
  it('AC-4207.1 내원 아래쪽 표: 환자 줄(차트번호 숫자 1~12자리) 수 · 신규 줄 수 · 마감 일자 기준 만 나이 10살 구간별 신환/재진 · 나이 못 셈(UnknownAge)', () => {
    expectAc('AC-4207.1')
  })

  it('AC-4207.3 내원 위쪽 표 합계(또는 그날) 줄 인원수·신규환자, 위쪽 표가 ok면 그 값·없으면 아래쪽 표 값, 다르면 visitRows·visitNew(경고만)', () => {
    expectAc('AC-4207.3')
  })

  it('AC-4207.5 내원 아래쪽 표 조회일 라벨 있음 = 날짜를 봄(HasDate), 없음 = 날짜를 보지 않고 noDate', () => {
    expectAc('AC-4207.5')
  })

  it('AC-4208.1 예약 아래쪽 표: 서로 다른 차트번호 수 · 줄 수 · 방문 줄 수, 예약일 칸에서 찾은 날짜(고침 15: 글 어디든·시각 무시·엑셀 날짜 숫자)가 하나라도 마감 일자가 아니면 AllOnDay false, 못 찾은 칸은 뺌', () => {
    expectAc('AC-4208.1')
  })

  it('AC-4208.1 코드 글자: 예약일 날짜 찾기는 UisPatients.RsvDate 한 곳이고 UisDay는 UisPatients.RsvDays(환자 줄만)로 받는다(앞 10글자 자르기 없음)', () => {
    const patients = code(PATIENTS)
    const day = code(path.join(UISARANG, 'UisDay.cs'))
    expect(patients).toMatch(/public static DateTime\? RsvDate\(XlsCell \w+, int year\)/)
    expect(day).toMatch(/UisPatients\.RsvDays\(/)
    for (const text of [patients, day]) {
      expect(text).not.toContain('Substring(0, 10)')
    }
  })

  it('AC-4208.2 예약 위쪽 표 합계(또는 그날) 줄 예약건수·이행건수, 다르면 rsvRows·rsvVisited(경고만), uis.reservations는 위쪽 표 → 아래쪽 표 → null', () => {
    expectAc('AC-4208.2')
  })

  it('AC-4209.3 VisitPatientFacts·RsvPatientFacts에 글자 칸이 없고(리플렉션) 결과·예외 글에 12-2 표시 글자가 없다', () => {
    expectAc('AC-4209.3')
  })

  it('AC-4209.3 코드 글자: UisPatients.cs에 수진자명·전화번호·주소·휴대전화(와 보험구분·진료실) 글자가 없다 — 그 칸은 찾지 않는다', () => {
    const text = source(PATIENTS)
    for (const banned of ['수진자명', '전화번호', '주소', '휴대전화', '보험구분', '진료실']) {
      expect(text, banned).not.toContain(banned)
    }
  })

  it('AC-4209.3 코드 글자: 두 파일은 Erp.Core.Uisarang의 static class이고 파일·네트워크·콘솔·기록에 닿지 않는다(줄만 받아 숫자만 낸다)', () => {
    const patients = code(PATIENTS)
    const visits = code(VISITS)
    expect(patients).toMatch(/^namespace Erp\.Core\.Uisarang;$/m)
    expect(visits).toMatch(/^namespace Erp\.Core\.Uisarang;$/m)
    expect(patients).toMatch(/public static class UisPatients\b/)
    expect(patients).toMatch(/public static VisitPatientFacts ReadVisits\(UisSheet \w+, DateTime day\)/)
    expect(patients).toMatch(/public static RsvPatientFacts ReadRsv\(UisSheet \w+, DateTime day\)/)
    expect(visits).toMatch(/public static class UisVisits\b/)
    expect(visits).toMatch(/public static VisitsFacts Read\(UisSheet \w+, DateTime day\)/)
    expect(visits).toMatch(/public static RsvFacts ReadRsv\(UisSheet \w+, DateTime day\)/)
    for (const text of [patients, visits]) {
      for (const banned of ['System.IO', 'System.Net', 'Console.', 'File.', 'Directory.', 'ErpLog', 'Debug.', 'Trace.', 'Environment.']) {
        expect(text, banned).not.toContain(banned)
      }
    }
  })
})
