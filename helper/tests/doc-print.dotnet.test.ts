// 서류 한 번에 인쇄(spec doc-print TASK-1)의 Core 바탕 C# 시험(helper/tests/Precheck.Core.Tests/DocPrint/*.test.cs,
// namespace Precheck.Core.Tests.DocPrint.Base)을 감싼다. 서류 4종별 시험(Phase 2, DocPrint/<이름>/)은 따로 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
// 비트 DB는 가짜(FakeDb)다. 창·인쇄(윈도우 층)는 의원 PC·Microsoft Print to PDF에서 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.DocPrint.Base'
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

describe('REQ-7401 설정·기록 (C# Precheck.Core.Tests.DocPrint.Base)', () => {
  it('AC-7401.1 설정이 없으면 서류 프린터 빈칸(윈도우 기본), 묶음 실손보험용 = [진료비 영수증, 진료비 세부내역서] 하나, PT 종이 설정은 그대로', () => {
    expectAc('AC-7401.1')
  })

  it('AC-7401.2 묶음 이름은 앞뒤 빈칸 빼고 1~10글자·겹침 없음·서류 1개 이상, 묶음 1~8개, JSON으로 쓰고 읽으면 같은 값, 깨진 파일은 기본값', () => {
    expectAc('AC-7401.2')
  })

  it('AC-7401.3 기록 한 줄(날짜·시각·차트번호·이름·서류·기간·장 수, 탭·줄바꿈은 빈칸), 최근 것부터, 차트번호·이름으로 거르기', () => {
    expectAc('AC-7401.3')
  })
})

describe('REQ-7402 환자 찾기 (C# Precheck.Core.Tests.DocPrint.Base)', () => {
  it('AC-7402.1 비트 창 제목의 "차트번호 :" 뒤 숫자를 앞 0 빼고 1~14자리로 꺼내고, 못 읽으면 null', () => {
    expectAc('AC-7402.1')
  })

  it('AC-7402.2 숫자만이면 차트번호·글자가 있으면 이름으로 5초 안에 매개변수로 읽기만, 한 명·여러 명(마지막 내원 최근 순)·없음·오류 글', () => {
    expectAc('AC-7402.2')
  })
})

describe('REQ-7403 기간·날짜 (C# Precheck.Core.Tests.DocPrint.Base)', () => {
  it('AC-7403.1 오늘·이번 달·지난 달·최근 3개월·전체(첫 내원~오늘), 창을 열면 이번 달', () => {
    expectAc('AC-7403.1')
  })

  it('AC-7403.2 외래·취소 뺀 내원 날짜를 오래된 것부터 한 날 한 줄, 수납 전(PN 아님·영수증 줄 없음)·처방(OutInf) 표시', () => {
    expectAc('AC-7403.2')
  })
})

describe('REQ-7404 서류 고르기·장 수 (C# Precheck.Core.Tests.DocPrint.Base)', () => {
  it('AC-7404.1 묶음을 누르면 그 묶음 서류만 켜진다', () => {
    expectAc('AC-7404.1')
  })

  it('AC-7404.2 서류마다 그린 쪽 수와 모두 N장, 서류 차례로 잇기, [인쇄]는 날짜·서류 1개 이상이고 N>0일 때만', () => {
    expectAc('AC-7404.2')
  })
})

describe('REQ-7405 서류 자료 읽기 바탕 (C# Precheck.Core.Tests.DocPrint.Base)', () => {
  it('AC-7405.1 허용 목록의 읽기 전용 매개변수 문장(서류 4종 목록 모음), 병원 정보·직인, 서류 4종 목록, 서류에 넘기는 값 묶음', () => {
    expectAc('AC-7405.1')
  })
})
