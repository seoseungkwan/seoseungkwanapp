// 수납일지 구글 시트 도우미 Core(spec google-link TASK-9, REQ-8510)의 C# 시험을 감싼다
// (helper/tests/Precheck.Core.Tests/Sheet/*.test.cs — 비트시트 Tests.cs·Fix7Tests.cs를 옮긴 것과 새 설정·가져오기·지문·답 읽기 시험).
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Sheet'
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

describe('REQ-8510 도우미 Core — 비트시트 줄 만들기·설정·가져오기·지문·답 읽기 (C# Precheck.Core.Tests Sheet)', () => {
  it('AC-8510.1 비트시트 Tests.cs·Fix7Tests.cs를 옮겨 돌리면 기대값 그대로 모두 통과(줄 맞춤·나눠 낸 돈·FREE·늦게 붙은 FREE·취소된 접수·미수만 낸 환자·비고·진료실 저절로 번호·처방 기본 분류·병원 고르기), 비트 읽기는 IBitDb 허용 목록으로', () => {
    expectAc('AC-8510.1')
  })

  it('AC-8510.2 웹 설정 JSON → 요청이 비트시트 7판 SheetPayload와 같은 JSON, 틀린 설정은 비트시트와 같은 막는 까닭 번호', () => {
    expectAc('AC-8510.2')
  })

  it('AC-8510.3 비트시트 settings.json(판 2) 가져오기 → 웹 설정 JSON + 비밀 글자(DPAPI entropy BitSheet.token.v1), 깨진 파일은 아무것도 바꾸지 않고 오류 번호만', () => {
    expectAc('AC-8510.3')
  })

  it('AC-8510.4 같은 자료의 줄 지문은 두 번 같고 한 칸이라도 다르면 다르다, SHA-256 글자이고 환자 값이 없다', () => {
    expectAc('AC-8510.4')
  })

  it('AC-8510.5 구글 코드 답은 숫자·참거짓·칸 주소(23!J9 꼴, 20개까지)만 남기고, 구글 오류는 design.md 수납 오류 번호 하나로', () => {
    expectAc('AC-8510.5')
  })
})

// 윈도우 받기(core.autocrlf=true)는 @"…" 여러 줄 글에 CRLF를 넣어 SQL 글이 가짜 DB 열쇠·허용 목록과 달라진다(sunap-read 2026-11-17 깨짐).
// 그래서 비트 읽기 SQL은 비트시트 BitSql처럼 "\n"으로 줄을 바꾼다
describe('AC-8510.1 SheetSql 글은 파일 줄바꿈과 상관없다', () => {
  it('AC-8510.1: SheetSql.cs의 SQL 글(const string)은 @"…"·"""…""" 여러 줄 글이 아니다', () => {
    const source = readFileSync(new URL('../src/Precheck.Core/Sheet/SheetSql.cs', import.meta.url), 'utf8')
    const starts = [...source.matchAll(/const string \w+ =/g)].map((m) => m.index ?? 0)
    expect(starts.length).toBeGreaterThanOrEqual(12)
    expect(source).toContain('const string VisitsSql =')
    for (const start of starts) {
      const body = source.slice(start, source.indexOf(';', start))
      expect(body).not.toMatch(/@"/)
      expect(body).not.toMatch(/"""/)
    }
  })
})
