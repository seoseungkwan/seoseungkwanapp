// SONO·C-ARM 고르기 목록(PickLists·ReceptionLists, reception-pick-lists TASK-1, REQ-3501)과
// 칸 표시·쓰기 검사·판 칸(ArrangeMarks·ArrangeWrite·ArrangeBuilder·Board, TASK-2, REQ-3502·AC-3501.4),
// 길·몸 한도·연결(POST /api/lists·ReceptionRouter·HttpRequestReader·ReceptionServices, TASK-3, AC-3501.3·AC-3501.4·AC-3502.4)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/PickLists.test.cs·PickWrite.test.cs·Http/ListsRoute.test.cs)을 감싼다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.Reception.PickChoices.'
let run: { code: number; output: string } = { code: -1, output: '' }

// 잠금 폴더는 이 PC의 모든 작업 폴더가 같이 쓴다. 다른 쪽 dotnet을 기다리는 시간까지 넉넉히 준다
beforeAll(() => {
  run = runDotnet(FILTER, { timeoutMs: 560_000 })
}, 580_000)

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

describe('REQ-3501 고르기 목록 저장·나눠 주기 (C# Precheck.Core.Tests.Reception.PickChoices)', () => {
  it('AC-3501.1 목록 파일이 없으면 기본값(시안 목록), 깨졌으면 기본값 + 기록 E-STORE-BROKEN 한 번', () => {
    expectAc('AC-3501.1')
  })

  it('AC-3501.2 이름 1~10글자·"|"·제어 글자 없음·무리 안 겹침 없음, 부위·부위 없이 안 겹침, 개수 한도, 약재 없음은 시술에만', () => {
    expectAc('AC-3501.2')
  })

  it('AC-3501.3 POST /api/lists는 쓰기 검사가 틀리면 403, 모양이 틀리면 400, 맞으면 data\\reception-lists.dat(머리 + DPAPI, 날짜 무관)에 쓰고 204', () => {
    expectAc('AC-3501.3')
  })

  it('AC-3501.4 어레인지 칸을 보내는 판에는 맨 위 picks(지금 목록)가 있고, 어레인지를 보내지 않는 판에는 없다', () => {
    expectAc('AC-3501.4')
  })
})

describe('REQ-3502 칸 표시·쓰기 (C# Precheck.Core.Tests.Reception.PickChoices)', () => {
  it('AC-3502.1 표시 파일의 SONO·C-ARM part는 "|"로 이은 글, tags는 비지 않을 때만 쓰고 옛 파일도 읽히며 읽을 때는 모양만 본다', () => {
    expectAc('AC-3502.1')
  })

  it('AC-3502.2 판의 어레인지 칸마다 tags(늘 배열)가 있고 part는 null 또는 "|"로 이은 글이다', () => {
    expectAc('AC-3502.2')
  })

  it('AC-3502.3 sono·carm add·part는 새 칸 t와 함께 지금 목록으로 보고, 어긋나거나 다른 op·칸에 t가 있거나 "부위는 나중에"면 400', () => {
    expectAc('AC-3502.3')
  })

  it('AC-3502.4 읽기 한도 8192바이트(넘으면 413, AC-3603.5), 쓰기 검사 전에 /api/xray 256·/api/arrange 1024·/api/lists 8192바이트를 넘으면 413', () => {
    expectAc('AC-3502.4')
  })
})
