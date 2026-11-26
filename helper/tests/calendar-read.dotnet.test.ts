// 예약 탭 도우미 0.10.0 — 비트 찾기(calfind)·접수와 비트 예약(calday)(spec clinic-calendar TASK-2, REQ-5903)의 C# 시험을 감싼다
// (helper/tests/Precheck.Core.Tests/Calendar/*.test.cs·Protocol/CommandTable.test.cs의 Calendar 시험).
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Calendar'
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

describe('REQ-5903 도우미 0.10.0 — 비트 찾기·접수·비트 예약 (C# Precheck.Core.Tests Calendar)', () => {
  it('AC-5903.1 calfind는 숫자 1~10자리면 차트번호, 아니면 이름 앞부분(두 글자 이상)으로 이 병원 환자를 마지막 내원 늦은 차례 20명까지, 더 있으면 more', () => {
    expectAc('AC-5903.1')
  })

  it('AC-5903.2 calfind는 오늘 하루·q 필수(20자까지·숫자와 글자 섞임·% _ [ 거부), 다른 kind에 q가 오면 E-HELPER-BAD-MESSAGE', () => {
    expectAc('AC-5903.2')
  })

  it('AC-5903.3 calday는 42일·오늘−62일 ~ 오늘+92일 안에서 센 접수 [날, 차트]와 비트 예약 [차트|null, 이름|null, 시각]', () => {
    expectAc('AC-5903.3')
  })

  it('AC-5903.4 명령 표는 kind calfind·calday와 선택 칸 q만 더하고, 새 SQL은 허용 목록의 읽기 전용 SELECT', () => {
    expectAc('AC-5903.4')
  })

  it('AC-5903.5 도우미 판 0.10.0', () => {
    expectAc('AC-5903.5')
  })

  // spec google-link: 예약 탭 지난 도착 채우기가 1년 전까지 가도록 calday 시작 한도만 넓힌다(42일 한 번 한도는 그대로)
  it('AC-8511.6 calday는 시작이 한국 오늘 − 400일까지면 받고 401일이면 거절, 42일 한도는 그대로', () => {
    expectAc('AC-8511.6')
  })
})

// 2026-11-17 helper-v0.9.1 GitHub 윈도우 빌드에서 @"…" 여러 줄 글이 CRLF가 되어 시험이 깨졌다. 새 SQL은 줄바꿈을 "\n"으로 적는다
describe('AC-5903.4 CalendarSql 글은 파일 줄바꿈과 상관없다', () => {
  it('AC-5903.4: CalendarSql.cs에는 @"…" 글이 없다', () => {
    const source = readFileSync(new URL('../src/Precheck.Core/Calendar/CalendarSql.cs', import.meta.url), 'utf8')
    expect(source).toContain('FindNameSql')
    expect(source).not.toMatch(/@"/)
  })
})
