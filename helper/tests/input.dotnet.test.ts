// 비트 자동 입력(TASK-17, REQ-017)의 C# 시험을 감싼다.
// - Precheck.Core.Tests.Input: 가짜 IChartUi·가짜 확인 창으로 묶음 검사·확인 창·사람 하나 차례·여러 날 내원 찾기·멈춤·결과·입력 기록·표준 입력 닫힘·잠금
// - Precheck.Windows.Tests/Input: 가짜 비트 프로세스(같은 칸 이름)에만 쓰는 시험. Actions 윈도우에서만 돈다. 이 서버에서는 빌드되는지만 본다.
// 진짜 비트 화면은 의원 PC 시험이다(시험용 환자 한 명 → 실제 하루치 → 입력 중 크롬 닫기).
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildDotnet, runDotnet } from './runDotnet'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const WINDOWS_TESTS_CSPROJ = path.join('helper', 'tests', 'Precheck.Windows.Tests', 'Precheck.Windows.Tests.csproj')
const WINDOWS_DIR = path.join(ROOT, 'helper', 'src', 'Precheck.Windows')
const PROGRAM = path.join(ROOT, 'helper', 'src', 'Precheck.Helper', 'Program.cs')
const HELPER_SRC = path.join(ROOT, 'helper', 'src')

let run: { code: number; output: string } = { code: -1, output: '' }

beforeAll(() => {
  run = runDotnet('Precheck.Core.Tests.Input', { timeoutMs: 280_000 })
}, 300_000)

function count(prefix: 'Passed' | 'Failed', ac: string): number {
  const escaped = ac.replace(/\./g, '\\.')
  return (run.output.match(new RegExp(`^\\s*${prefix} ${escaped}\\b`, 'gm')) ?? []).length
}

function tail(text: string): string {
  return text.split('\n').slice(-60).join('\n')
}

function expectAc(ac: string) {
  expect(run.code, tail(run.output)).toBe(0)
  expect(count('Failed', ac), tail(run.output)).toBe(0)
  expect(count('Passed', ac), `${ac} 시험이 돌지 않았다\n${tail(run.output)}`).toBeGreaterThan(0)
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

function windowsCode(file: string): string {
  return stripComments(readFileSync(path.join(WINDOWS_DIR, file), 'utf8'))
}

describe('REQ-017 비트 자동 입력 (C# Precheck.Core.Tests.Input)', () => {
  it('AC-017.1 등록 확인 → 지문 → 묶음 검사(500명·차트번호·이름·날짜·메모·같은 진료), 틀리면 아무것도 입력하지 않고 오류', () => {
    expectAc('AC-017.1')
  })

  it('AC-017.2 도우미가 만든 글의 PC 확인 창, [확인]만 시작, [취소]·닫기·5분이면 cancelled', () => {
    expectAc('AC-017.2')
  })

  it('AC-017.3 열기 → 이름·차트번호·내원일 검사 → 메모 다시 읽기 → 쓰기 → 다시 읽기 → 저장 → 다시 읽기, 여러 날은 진료일(dtpWorkDate)로', () => {
    expectAc('AC-017.3')
  })

  it('AC-017.4 지문이 다르면 시작하지 않거나 그 사람에서 멈추고 E-BIT-UI-CHANGED와 칸 ID 목록', () => {
    expectAc('AC-017.4')
  })

  it('AC-017.5 저장 안 한 처방 창·fatal 문구·3번 실패·[멈추기]면 멈추고 남은 사람은 미처리', () => {
    expectAc('AC-017.5')
  })

  it('AC-017.6 결과는 완료·확인 필요·건너뜀, 진행은 숫자만, 결과는 조각으로', () => {
    expectAc('AC-017.6')
  })

  it('AC-017.7 입력 기록 writing·done·skipped·check, 다시 열면 비트 메모와 비교', () => {
    expectAc('AC-017.7')
  })

  it('AC-017.8 원본 SecurityTests 입력 보호 사례(가짜 IChartUi)', () => {
    expectAc('AC-017.8')
  })

  it('AC-017.9 표준 입력이 닫히면 지금 사람을 안전한 자리까지만 하고 남은 사람은 미처리, 확인 창은 취소', () => {
    expectAc('AC-017.9')
  })

  it('AC-017.10 이름 있는 뮤텍스로 한 번에 하나, 다른 쪽이 쥐면 E-BRIDGE-BUSY, abandoned는 잡은 것', () => {
    expectAc('AC-017.10')
  })
})

describe('REQ-017 윈도우 부분 (이 서버에서는 빌드와 글자만, 실행은 Actions 윈도우)', () => {
  it('AC-017.4 가짜 비트 프로세스 시험(Precheck.Windows.Tests/Input)과 FlaUI 4.0.0 net48 코드가 이 서버에서 빌드된다', () => {
    const build = buildDotnet(WINDOWS_TESTS_CSPROJ, { timeoutMs: 280_000 })
    expect(build.code, tail(build.output)).toBe(0)
  }, 300_000)

  it('AC-017.3 FlaUI.Core·FlaUI.UIA3는 정확히 4.0.0(범위·* 없음, 원본과 같은 판)', () => {
    const csproj = readFileSync(path.join(WINDOWS_DIR, 'Precheck.Windows.csproj'), 'utf8')
    expect(csproj).toContain('<PackageReference Include="FlaUI.Core" Version="4.0.0" />')
    expect(csproj).toContain('<PackageReference Include="FlaUI.UIA3" Version="4.0.0" />')
  })

  it('AC-017.5 UChartAutomation.cs에 저장 안 한 처방 창을 누르는 길이 없다(range_bridge의 ConfirmUnsavedPrescription을 옮기지 않음)', () => {
    const code = windowsCode('UChartAutomation.cs')
    expect(code).not.toContain('ConfirmUnsavedPrescription')
    expect(code).not.toContain('TryAutoConfirm')
    // 대화 상자에 WM_COMMAND(273)·BM_CLICK을 보내는 곳은 없다. PostMessage는 선언 하나와 저장·검색 단추를 받는 ClickButton의 부름 하나뿐이다
    expect(code).not.toMatch(/PostMessage\(\s*dlg/)
    expect(code.match(/\bPostMessage\(/g)?.length).toBe(2)
  })

  it('AC-017.3 여러 날 입력은 내원내역 날짜를 바꾸지 않는다: dtpFrom·dtpTo·dtpWorkDate에 쓰는 코드가 없다', () => {
    const code = windowsCode('UChartAutomation.cs')
    expect(code).toContain('"dtpFrom"')
    expect(code).toContain('"dtpTo"')
    // 칸에 글을 넣는 곳(WM_SETTEXT)은 검색칸 txtSch 하나뿐이다
    expect(code.match(/WM_SETTEXT,/g)?.length).toBe(1)
  })

  it('AC-017.6 윈도우 코드는 표준 출력·표준 오류·기록에 쓰지 않는다(AC-001.6)', () => {
    for (const file of ['UChartAutomation.cs', 'NativeTarget.cs', 'ProgressWindow.cs']) {
      const code = windowsCode(file)
      expect(code).not.toMatch(/Console\./)
      expect(code).not.toMatch(/File\.(Write|Append)/)
    }
  })

  it('AC-017.9 Program.cs는 표준 입력을 StdinPump로 읽어 닫힘 신호(HostSignal)를 세운다', () => {
    const code = stripComments(readFileSync(PROGRAM, 'utf8'))
    expect(code).toMatch(/new HostSignal\(\)/)
    expect(code).toMatch(/new StdinPump\(/)
    expect(code).toMatch(/MessageLoop\.Run\(args, input,/)
  })

  // 새 파일·다른 묶음·별칭·명령 이름 글자로 붙이는 길까지 막으려고 helper/src 전체를 본다. 정의한 파일만 제 이름을 쓸 수 있다
  it('AC-017.1 bit.input은 아직 붙이지 않았다: helper/src 어디에서도 InputCommands·InputParts·bit.input을 쓰지 않는다(같은 날 두 번 온 환자의 메모가 다른 내원에 들어갈 수 있어서. 배선 작업 때 이 시험을 지운다)', () => {
    const inputCommands = path.join('Precheck.Core', 'Input', 'InputCommands.cs')
    const inputParts = path.join('Precheck.Helper', 'Commands', 'InputParts.cs')
    const sources = readdirSync(HELPER_SRC, { recursive: true, encoding: 'utf8' }).filter(
      (name) => name.endsWith('.cs') && !name.split(path.sep).some((part) => part === 'bin' || part === 'obj'),
    )
    expect(sources).toContain(inputCommands)
    expect(sources).toContain(inputParts)
    for (const file of sources) {
      const code = stripComments(readFileSync(path.join(HELPER_SRC, file), 'utf8'))
      if (file !== inputCommands) expect(code, file).not.toMatch(/\bInputCommands\b|bit\.input/)
      if (file !== inputParts) expect(code, file).not.toMatch(/\bInputParts\b/)
    }
  })
})
