// 줄 만들기(BoardBuilder·Board, TASK-11, REQ-1402)의 C# 시험(helper/tests/Precheck.Core.Tests/Reception/BoardBuilder.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// 이 TASK의 시험은 BoardRows 이름 공간에만 있다(같은 폴더의 다른 TASK 시험은 돌리지 않는다)
const FILTER = 'Precheck.Core.Tests.Reception.BoardRows.'
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

describe('REQ-1402 접수 현황 줄 만들기 BoardBuilder (C# Precheck.Core.Tests.Reception.BoardRows)', () => {
  it('AC-1402.1 표에 있는 코드만 네 칸으로 가고, 표에 없는 코드·숨김으로 정한 줄은 어느 칸에도 없이 건수만 센다', () => {
    expectAc('AC-1402.1')
  })

  it('AC-1402.2 진료 순서는 대기+보류를 접수 빠른 순(같으면 내원번호 순)으로 1부터 번호, 끝남은 늦은 순, 칸마다 건수', () => {
    expectAc('AC-1402.2')
  })

  it('AC-1402.3 기다린 글: 지난 분(버림, 최소 1), 대기·보류·수납 글 모양, 끝남 칸은 HH:MM 수납 또는 수납완료', () => {
    expectAc('AC-1402.3')
  })

  it('AC-1402.4 진료대기·진료보류만 60분부터 오래 기다림(long) 표시', () => {
    expectAc('AC-1402.4')
  })

  it('AC-1402.5 정보 글 "54세 · 여 · 재진": 오늘 기준 만 나이, 모르는 값은 뺀다(끝 조각 신환·재진은 REQ-6205)', () => {
    expectAc('AC-1402.5')
  })

  it('AC-1402.6 처방 글: 오늘·지난번·처방 이름표, 이름(코드) 코드 순, 이름을 모르면 코드만', () => {
    expectAc('AC-1402.6')
  })

  it('AC-1402.7 이름·메모를 아직 못 읽으면 그 칸만 비우고 줄은 그대로 만든다', () => {
    expectAc('AC-1402.7')
  })

  it('AC-1402.8 진료보류 줄만 엑스레이 칸 {at: "HH:MM" | null}', () => {
    expectAc('AC-1402.8')
  })

  it('AC-1402.9 줄마다 그날 화면용 열쇠, 내원번호·상태 코드·생년월일 원값 없음, design.md 4절 JSON 모양', () => {
    expectAc('AC-1402.9')
  })
})

describe('REQ-6205 접수현황 신환 표시 (spec new-mark, C# Precheck.Core.Tests.Reception.BoardRows)', () => {
  it('AC-6205.1 오늘 접수의 내원 구분이 "1"이면 예전 접수가 있어도 정보 글 끝 조각은 신환', () => {
    expectAc('AC-6205.1')
  })

  it('AC-6205.2 내원 구분이 "1"이 아니면(빈 값·칸 없음 포함) 예전 접수가 없어도 재진', () => {
    expectAc('AC-6205.2')
  })

  it('AC-6205.3 처방 칸(지난번 증상 / 첫 처방)은 지금처럼 예전 접수가 있는지로 정한다', () => {
    expectAc('AC-6205.3')
  })
})
