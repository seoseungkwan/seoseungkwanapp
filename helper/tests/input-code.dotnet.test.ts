// 처방코드 입력·조회 모드(TASK-36, REQ-036)의 C# 시험을 감싼다.
// - Precheck.Core.Tests.Input: 코드 모양·내원내역 칸·창 글·안내창 판단·조회 모드로 열린 사람·첫 사람 앞 기다리기(가짜 시계)
// - Precheck.Windows.Tests/Input: 안내창 누르기·제외 체크 읽기는 가짜 비트 프로세스로 Actions 윈도우에서만 돈다. 이 서버에서는 빌드되는지(input.dotnet.test.ts)와 글자만 본다.
// 진짜 비트의 안내창·체크 칸·메모 칸 상태는 의원 PC 시험이다.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import commands from '../../src/lib/bridge/commands.json'
import { runDotnet } from './runDotnet'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const WINDOWS_DIR = path.join(ROOT, 'helper', 'src', 'Precheck.Windows')

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

function windowsCode(file: string): string {
  return readFileSync(path.join(WINDOWS_DIR, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

function windowsSource(file: string): string {
  return readFileSync(path.join(WINDOWS_DIR, file), 'utf8')
}

describe('REQ-036 처방코드 입력·조회 모드 (C# Precheck.Core.Tests.Input)', () => {
  it('AC-036.1 code는 없어도 되고 있으면 허용 목록만, 끝 줄바꿈까지 E-HELPER-BAD-MESSAGE, 코드로 다시 거르지 않는다', () => {
    expectAc('AC-036.1')
  })

  it('AC-036.2 처방코드 칸(null·빈칸·같음·다름) × 코드 있음·없음 × 제외(켜짐·꺼짐·못 읽음), 아무도 열기 전에 멈춘다', () => {
    expectAc('AC-036.2')
  })

  it('AC-036.3 코드가 있으면 창에 처방코드와 주의 줄, 없으면 지금 글 그대로, 순서는 받은 차례(쓰다 멈춘 사람만 앞으로)', () => {
    expectAc('AC-036.3')
  })

  it('AC-036.4 안내창·[확인] 판단은 원본 시험 사례대로, 0.25초마다 5번까지', () => {
    expectAc('AC-036.4')
  })

  it('AC-036.5 조회 모드에서 입력을 받지 않으면 그 사람만 확인 필요, 다른 글·읽기 실패·쓰다 멈춘 사람은 묶음 멈춤', () => {
    expectAc('AC-036.5')
  })

  it('AC-036.6 첫 사람 앞에서 0.25초마다 3초까지 기다리고, 아니면 지금 문구로 멈춘다', () => {
    expectAc('AC-036.6')
  })
})

describe('REQ-036 명령 표·윈도우 코드 (글자, 실행은 Actions 윈도우)', () => {
  it('AC-036.1 명령 표의 code는 고르는 칸이고 모양은 RxHistoryRead.CodeShape와 같다', () => {
    expect(commands.commands['bit.input'].args.payload.fields.code).toEqual({
      type: 'string',
      min: 1,
      max: 20,
      pattern: '^[0-9A-Z][0-9A-Z.-]{0,19}$',
      optional: true,
    })
    const rxHistory = readFileSync(path.join(ROOT, 'helper', 'src', 'Precheck.Core', 'Claim', 'RxHistoryRead.cs'), 'utf8')
    expect(rxHistory).toContain('new Regex("^[0-9A-Z][0-9A-Z.-]{0,19}$")')
  })

  it('AC-036.1 BatchCheck의 코드 모양은 ChartShape처럼 끝을 \\z로 맞춘다', () => {
    const check = readFileSync(path.join(ROOT, 'helper', 'src', 'Precheck.Core', 'Input', 'BatchCheck.cs'), 'utf8')
    expect(check).toContain('@"^[0-9A-Z][0-9A-Z.-]{0,19}\\z"')
  })

  it('AC-036.2 제외 체크는 Patterns.Toggle을 먼저 읽고, 안 되거나 실패하면 BM_GETCHECK로 읽으며, 둘 다 못 읽으면 꺼짐이 아니라 null이다', () => {
    const code = windowsCode('UChartAutomation.cs')
    // Toggle이 먼저이고, 못 읽었을 때(null)만 메시지로 간다
    expect(code).toContain('private bool? IsChecked(nint h) => ToggleChecked(h) ?? MessageChecked(h);')

    const toggle = code.slice(code.indexOf('private bool? ToggleChecked('), code.indexOf('private static bool? MessageChecked('))
    expect(toggle).toContain('.Patterns.Toggle')
    expect(toggle).toMatch(/if \(!toggle\.IsSupported\) return null;/)
    // Off만 꺼짐이다. On·Indeterminate는 켜짐
    expect(toggle).toContain('.ToggleState.Value != ToggleState.Off')
    // ValueOrDefault는 못 읽어도 Off(꺼짐)를 돌려준다
    expect(toggle).not.toContain('ValueOrDefault')
    expect(toggle).toMatch(/catch \(Exception e\) when \(e is not OutOfMemoryException\)\s*\{\s*return null;\s*\}/)

    const message = code.slice(code.indexOf('private static bool? MessageChecked('), code.indexOf('public ChartOpenResult OpenPatient('))
    expect(message).toMatch(/SendMessageTimeout\(h, BM_GETCHECK[^;]*\) == IntPtr\.Zero\) return null/)
    expect(message).toContain('.ToInt64() != 0')
    expect(message).not.toContain('== 1')
  })

  it('AC-036.5 안내창을 눌렀으면 안내창 보기를 끝낸 뒤 OpenPatient 결과에 조회 모드 표시를 붙인다', () => {
    expect(windowsCode('UChartAutomation.cs')).toMatch(
      /notices\.Dispose\(\);\s*\}\s*return notices\.Pressed > 0 \? opened\.InViewMode\(\) : opened;/,
    )
  })

  it('AC-036.4 안내창 누르기는 ViewModeNotices.cs에만 있고 환자를 여는 동안만 돈다', () => {
    const automation = windowsCode('UChartAutomation.cs')
    expect(automation.match(/ViewModeNotices\.Watch\(target\)/g)).toHaveLength(1)
    const openStart = automation.indexOf('public ChartOpenResult OpenPatient(')
    const watch = automation.indexOf('ViewModeNotices.Watch(target)')
    expect(watch).toBeGreaterThan(openStart)
    expect(automation.indexOf('notices.Dispose()')).toBeGreaterThan(watch)
    expect(automation.indexOf('private ChartOpenResult OpenRange(')).toBeGreaterThan(watch)
    // 안내창을 알아보는 길은 UChartAutomation에 없다. [확인]을 알아보는 곳은 저장 안 한 처방 창 누르기 하나다(input.dotnet.test.ts AC-017.12)
    expect(automation).not.toContain('IsViewModeNotice')
    expect(automation.match(/ChartRules\.IsConfirmButton\(/g)).toHaveLength(1)
    expect(windowsSource('UChartAutomation.cs')).not.toMatch(/조회모드 안내창[^\n]*옮기지 않았다/)
  })

  it('AC-036.4 등록한 프로세스의 보이는 #32770 창, 안내창 글, Button 칸의 [확인]만 누르고 글을 남기지 않는다', () => {
    const code = windowsCode('ViewModeNotices.cs')
    expect(code).toContain('target.ProcessIds()')
    expect(code).toContain('"#32770"')
    expect(code).toContain('IsWindowVisible')
    expect(code).toContain('ChartRules.IsViewModeNotice(')
    expect(code).toContain('ChartRules.IsConfirmButton(')
    expect(code).toContain('"Button"')
    expect(code).toContain('ViewModeWatch.Run(')
    expect(code).not.toMatch(/Console\.|File\.|Debug\.|Trace\./)
    expect(code).not.toContain('BM_CLICK')
    // 뒤 스레드의 예외가 도우미를 죽이지 않는다
    expect(code).toMatch(/catch \(Exception e\) when \(e is not OutOfMemoryException\)/)
    expect(code).toContain('IsBackground = true')
  })

  it('AC-036.5 메모 칸의 편집 가능 여부는 켜짐과 읽기 전용을 함께 본다', () => {
    const code = windowsCode('UChartAutomation.cs')
    expect(code).toMatch(/IsWindowEnabled\(memo\) && \(GetWindowLong\(memo, GWL_STYLE\) & ES_READONLY\) == 0/)
  })

  it('AC-036.6 묶음마다(도우미 화면 개체마다) FirstListWait 하나를 OpenRows에 넘긴다', () => {
    const code = windowsCode('UChartAutomation.cs')
    expect(code).toMatch(/private readonly FirstListWait listWait = new FirstListWait\(\);/)
    expect(code).toMatch(/VisitOpener\.OpenRows\([^;]*listWait\)/)
  })

  it('AC-036.7 진행 창에 "입력 중 이 PC를 만지지 마세요" 한 줄이 있고 멈출 때도 그 칸을 바꾸지 않는다', () => {
    const code = windowsCode('ProgressWindow.cs')
    expect(code).toContain('"입력 중 이 PC를 만지지 마세요"')
    expect(code.match(/note\b/g)?.length).toBe(2)
  })
})
