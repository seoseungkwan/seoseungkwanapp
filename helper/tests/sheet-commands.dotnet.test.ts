// 도우미 0.14.0 수납 명령(spec google-link TASK-10, REQ-8511)의 C# 시험을 감싼다
// (helper/tests/Precheck.Core.Tests/Sheet/SheetCommands*.test.cs — sheet.status·code·link·import·ping·catalog·months·fill, sheet.dat, 확인 창 약속, hello, 시간 제한, 기록 줄).
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'SheetCommands'
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

describe('REQ-8511 도우미 0.14.0 — 수납 명령·비밀 글자·보내는 곳 확인 (C# Precheck.Core.Tests SheetCommands*)', () => {
  it('AC-8511.1 명령 표에 sheet.* 여덟(모두 patient:false, confirm은 sheet.link만, 주소 칸은 sheet.link만), 도우미 판 0.14.0, 처리기 모두 붙음', () => {
    expectAc('AC-8511.1')
  })

  it('AC-8511.2 sheet.code: 새 비밀 글자를 sheet.dat(DPAPI)에, 비밀 글자를 넣은 Code.gs를 클립보드에, 답은 {v, secretTag, codeVersion}뿐', () => {
    expectAc('AC-8511.2')
  })

  it('AC-8511.3 sheet.link: 주소 꼴 검사·확인 창 [바꾸기]일 때만 sheet.dat에, 바꾼 뒤 hello mac이 맞아야 token·줄을 보냄, 넘김은 googleusercontent만', () => {
    expectAc('AC-8511.3')
  })

  it('AC-8511.4 sheet.fill: 비트 읽기만·지문 같으면 안 보냄·auto 덮어쓰기 거절·날짜 −62일~오늘·비트 20초/구글 45초/전체 60초·SheetSql 허용 목록', () => {
    expectAc('AC-8511.4')
  })

  it('AC-8511.5 sheet.status·import·ping·catalog·months 답 모양(주소·메일·비밀 글자 없음, 7판도 넣음)', () => {
    expectAc('AC-8511.5')
  })

  it('AC-8511.7 기록 줄은 명령 이름·오류 번호뿐(이름·차트번호·비밀 글자·주소·메일 없음)', () => {
    expectAc('AC-8511.7')
  })
})

describe('AC-8511.3 확인 창은 새 약속(ISheetConfirm)과 새 파일(SheetConfirmWindow) — 지금 확인 창은 그대로', () => {
  it('AC-8511.3: SheetConfirmWindow.cs가 ISheetConfirm을 따르고 STA(Sta.Run)·맨 위 창·기본 단추 [취소], 글은 SheetPrompt에서', () => {
    const source = readFileSync(new URL('../src/Precheck.Windows/SheetConfirmWindow.cs', import.meta.url), 'utf8')
    expect(source).toMatch(/class SheetConfirmWindow\s*:\s*ISheetConfirm/)
    expect(source).toContain('Sta.Run(')
    expect(source).toContain('TopMost = true')
    expect(source).toContain('CancelButton = cancel')
    expect(source).toContain('ActiveControl = cancel')
    expect(source).toContain('SheetPrompt.Title')
    expect(source).toContain('SheetPrompt.Change')
    expect(source).toContain('SheetPrompt.Cancel')
  })

  it('AC-8511.3: 진짜 HTTP는 HttpWebRequest(TLS 1.2·저절로 따라가지 않음·60초 한도)', () => {
    const source = readFileSync(new URL('../src/Precheck.Windows/SheetHttpTransport.cs', import.meta.url), 'utf8')
    expect(source).toMatch(/class SheetHttpTransport\s*:\s*ISheetTransport/)
    expect(source).toContain('HttpWebRequest')
    expect(source).toContain('SecurityProtocolType.Tls12')
    expect(source).toContain('AllowAutoRedirect = false')
    expect(source).toContain('TimeSpan.FromSeconds(60)')
  })

  it('AC-8511.2: 클립보드는 STA 스레드에서(Clipboard.SetText)', () => {
    const source = readFileSync(new URL('../src/Precheck.Windows/SheetClipboard.cs', import.meta.url), 'utf8')
    expect(source).toMatch(/class SheetClipboard\s*:\s*IClipboard/)
    expect(source).toContain('Sta.Run(')
    expect(source).toContain('Clipboard.SetText(')
  })

  it('AC-8511.3: 도우미가 수납 명령을 붙이고 sheet.dat는 도우미 저장 폴더·DPAPI, 비트시트 가져오기는 entropy BitSheet.token.v1', () => {
    const program = readFileSync(new URL('../src/Precheck.Helper/Program.cs', import.meta.url), 'utf8')
    expect(program).toContain('SheetCommands.Register(dispatcher, SheetHelperServices.Create())')
    const services = readFileSync(new URL('../src/Precheck.Helper/Commands/SheetHelperServices.cs', import.meta.url), 'utf8')
    expect(services).toContain('new SheetStore(HelperServices.DataDirectory(), new DpapiProtector())')
    expect(services).toContain('new DpapiProtector(BitSheetImport.Entropy())')
    expect(services).toContain('new SheetConfirmWindow()')
    expect(services).toContain('new SheetClipboard()')
    expect(services).toContain('new SheetHttpTransport(')
  })
})
