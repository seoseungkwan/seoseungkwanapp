// 다른 메모 바꾸기·묻지 않기(TASK-37, REQ-037)의 C# 시험을 감싼다.
// - Precheck.Core.Tests.Input: 메시지부터 끝까지, 가짜 비트 화면·확인 창과 진짜 WorkStoreJournal로 본다(SaveResults를 지난 값, AC-035.2)
// - PC 확인 창의 체크·노란 바탕은 Precheck.Windows라 Actions 윈도우에서만 뜬다. 이 서버에서는 빌드되는지(input.dotnet.test.ts)와 글자만 본다.
// 진짜 비트에서 바꾸기·이전 메모·묻지 않기는 의원 PC 시험이다.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import commands from '../../src/lib/bridge/commands.json'
import { runDotnet } from './runDotnet'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const WINDOWS_DIR = path.join(ROOT, 'helper', 'src', 'Precheck.Windows')
const CORE_DIR = path.join(ROOT, 'helper', 'src', 'Precheck.Core')

let run: { code: number; output: string } = { code: -1, output: '' }

// 잠금 폴더는 이 서버의 모든 작업 폴더가 같이 쓴다. 다른 쪽 dotnet을 기다리는 시간까지 넉넉히 준다
beforeAll(() => {
  run = runDotnet('Precheck.Core.Tests.Input', { timeoutMs: 560_000 })
}, 580_000)

function tail(text: string): string {
  return text.split('\n').slice(-60).join('\n')
}

function expectAc(ac: string) {
  const escaped = ac.replace(/\./g, '\\.')
  const count = (prefix: string) => (run.output.match(new RegExp(`^\\s*${prefix} ${escaped}\\b`, 'gm')) ?? []).length
  expect(run.code, tail(run.output)).toBe(0)
  expect(count('Failed'), tail(run.output)).toBe(0)
  expect(count('Passed'), `${ac} 시험이 돌지 않았다\n${tail(run.output)}`).toBeGreaterThan(0)
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

function code(file: string): string {
  return stripComments(readFileSync(file, 'utf8'))
}

describe('REQ-037 다른 메모 바꾸기·묻지 않기 (C# Precheck.Core.Tests.Input)', () => {
  it('AC-037.1 원래 메모를 먼저 달 파일에, 그 뒤 writing, 그 뒤 칸. 못 남기면 쓰지 않고 E-STORE-FAILED. A→B→C 목록, previousMemo는 바꾼 사람의 줄에만', () => {
    expectAc('AC-037.1')
  })

  it('AC-037.2 승인한 뒤 바뀐 메모는 묻지 않기가 켜져 있어도 건너뜀이고 3번 실패에 세지 않는다. 못 읽으면 멈춘다', () => {
    expectAc('AC-037.2')
  })

  it('AC-037.3 창에 다른 메모를 바꾸는 환자 수만 나오고 메모 글은 없다', () => {
    expectAc('AC-037.3')
  })

  it('AC-037.4 처음 꺼짐, 켜고 [확인]이면 다음 묶음은 창 없이, [취소]·닫기·5분이면 안 켜짐, 끝 답에 noAsk. 검사는 그대로', () => {
    expectAc('AC-037.4')
  })

  it('AC-037.5 웹이 묻지 않기 칸을 보내면 E-HELPER-BAD-MESSAGE, 처음 묶음은 어떤 페이로드든 창을 부른다', () => {
    expectAc('AC-037.5')
  })

  it('AC-037.6 켜지면 승인 없는 다른 메모도 바뀌고 원래 메모가 남는다. 직접 확인·직접 확인 기록·쓰다 멈춤은 예외, 막 켠 체크는 다음 묶음부터', () => {
    expectAc('AC-037.6')
  })

  it('AC-037.7 확인 표시가 남은 메모는 켜져 있어도 열지 않는다', () => {
    expectAc('AC-037.7')
  })

  it('AC-017.12 PC 확인 창의 주의 줄은 "먼저 비트의 저장 안 한 작업" 줄 바로 다음이고, 묻지 않기 묶음은 시작 뒤에 누른다', () => {
    expectAc('AC-017.12')
  })

  it('AC-037.8 체크 글과 두 주의 줄을 글자까지 본다', () => {
    expectAc('AC-037.8')
  })
})

describe('TASK-35 리뷰에서 온 일 (C# Precheck.Core.Tests.Input)', () => {
  it('AC-035.2 Mark한 진료의 기록을 SaveResults가 바꾸지 않는다: 미리 빠진 checkedByHand도 SkippedByHand', () => {
    expectAc('AC-035.2')
  })

  it('AC-035.5 [확인] 뒤 미리 빠진 checkedByHand는 SkippedByHand, 창 없이 끝난 묶음은 Skipped', () => {
    expectAc('AC-035.5')
  })

  it('AC-035.8 Mark를 못 남기면 아무도 열지 않고 줄만 더하며 skipped를 적지 않는다', () => {
    expectAc('AC-035.8')
  })

  it('AC-035.9 묻지 않기 켜짐의 창 둘, 깨진 달 파일을 치운 첫 누름의 reason', () => {
    expectAc('AC-035.9')
  })
})

describe('REQ-6611 비트 메모 뒤에 붙이기 — 도우미 0.12.0 (spec clinic-profile, C# Precheck.Core.Tests.Input)', () => {
  it('AC-6611.2 칸 글이 appends와 같을 때만 앞 글.TrimEnd() + 줄바꿈 + 우리 메모를 원래 메모 저장 → writing → 쓰기 → 저장 뒤 다시 읽기로 넣고 붙임(기존 메모 뒤에), 바뀌었으면 건너뜀, replaces와 함께면 거절, 묻지 않기로는 붙이지 않음, 끊긴 붙이기 되살리기', () => {
    expectAc('AC-6611.2')
  })

  it('AC-6611.3 붙인 뒤 다시 견주면 같은 메모라 다음 입력에서 앞 글을 덮어쓰지 않는다(이미 입력됨)', () => {
    expectAc('AC-6611.3')
  })

  it('AC-6611.4 합친 글이 비트 메모 칸 3,000바이트(ASCII 1·나머지 2, 윈도우 줄바꿈 기준)를 넘으면 쓰지 않고 길이 넘음(비트 메모 칸 3,000바이트)으로 건너뛴다. BitBytes는 웹 bitBytes.ts와 같은 사례', () => {
    expectAc('AC-6611.4')
  })

  it('AC-6611.5 PC 확인 창에 다른 메모 뒤에 붙이는 환자 {N}명 줄, 0명이면 없음, 메모 글은 없음', () => {
    expectAc('AC-6611.5')
  })
})

describe('REQ-037 명령 표·윈도우 코드 (글자, 실행은 Actions 윈도우)', () => {
  it('AC-6611.2 appends는 고르는 글자 칸이고 1~4,000자다(replaces와 같은 한도). BatchCheck도 같은 한도를 본다', () => {
    const fields = commands.commands['bit.input'].args.payload.fields.items.items.fields as Record<string, unknown>
    expect(fields.appends).toEqual({ type: 'string', min: 1, max: 4000, optional: true })
    expect(code(path.join(CORE_DIR, 'Input', 'BatchCheck.cs'))).toMatch(/MaxAppends = 4000/)
  })

  it('AC-037.1 replaces는 고르는 글자 칸이고 1~4,000자다. BatchCheck도 같은 한도를 본다', () => {
    const fields = commands.commands['bit.input'].args.payload.fields.items.items.fields as Record<string, unknown>
    expect(fields.replaces).toEqual({ type: 'string', min: 1, max: 4000, optional: true })
    expect(code(path.join(CORE_DIR, 'Input', 'BatchCheck.cs'))).toMatch(/MaxReplaces = 4000/)
  })

  it('AC-037.5 명령 표 어디에도 묻지 않기 칸이 없고, 처리기는 웹 메시지에서 그 값을 읽지 않는다', () => {
    expect(JSON.stringify(commands.commands)).not.toMatch(/noAsk|no_ask/i)
    const handler = code(path.join(CORE_DIR, 'Input', 'InputCommands.cs'))
    const read = handler.slice(handler.indexOf('private static List<InputItem> ReadItems('), handler.indexOf('private static bool IsClosedOutput('))
    expect(read).not.toMatch(/noAsk/i)
  })

  it('AC-037.1 store.load 답은 세 칸 그대로이고 originals를 읽는 곳은 도우미 안뿐이다', () => {
    const store = code(path.join(CORE_DIR, 'Store', 'WorkStore.cs'))
    const load = store.slice(store.indexOf('private string Load('), store.indexOf('public void Prune('))
    expect(load).not.toContain('OriginalsField')
    expect(code(path.join(CORE_DIR, 'Store', 'StoreCommands.cs'))).not.toMatch(/originals/i)
  })

  it('AC-037.8 AC-037.4 PC 확인 창: 체크 글은 InputPrompt.NoAskLabel, 처음 꺼져 있고, 이미 켜졌으면 켜진 채 잠기며, [확인]일 때만 켜졌다고 알린다', () => {
    const window = code(path.join(WINDOWS_DIR, 'ConfirmWindow.cs'))
    expect(window).toContain('Text = InputPrompt.NoAskLabel')
    expect(window).toMatch(/Checked = noAskOn\.Value/)
    expect(window).toMatch(/Enabled = !noAskOn\.Value/)
    expect(window).toMatch(/confirmed && form\.NoAskTicked/)
    // 기본 단추는 그대로 [취소]다
    expect(window).toContain('ActiveControl = cancel')
    expect(window).toContain('CancelButton = cancel')
  })

  it('AC-035.9 창 맨 위 글: 노란 바탕 칸은 그 글이 있을 때만 만들고 글은 InputPrompt가 나눈 그대로다', () => {
    const window = code(path.join(WINDOWS_DIR, 'ConfirmWindow.cs'))
    expect(window).toContain('InputPrompt.SplitNotice(text, out var rest)')
    const notice = window.slice(window.indexOf('if (notice != null)'))
    expect(notice).toMatch(/if \(notice != null\)[\s\S]*?BackColor = NoticeBack/)
    expect(window.match(/BackColor = /g)).toHaveLength(1)
  })

  it('AC-037.4 프로세스마다 하나: Program.cs가 처리기를 한 번만 붙여 묻지 않기가 프로세스 메모리에만 있고 파일에 쓰지 않는다', () => {
    const program = code(path.join(ROOT, 'helper', 'src', 'Precheck.Helper', 'Program.cs'))
    expect(program.match(/InputCommands\.Register\(/g)).toHaveLength(1)
    expect(code(path.join(CORE_DIR, 'Store', 'WorkStore.cs'))).not.toMatch(/noAsk/i)
    expect(code(path.join(CORE_DIR, 'Store', 'WorkStoreJournal.cs'))).not.toMatch(/noAsk/i)
  })
})
