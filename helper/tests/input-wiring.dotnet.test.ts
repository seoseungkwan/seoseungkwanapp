// bit.input 연결(TASK-35, REQ-035)의 C# 시험을 감싼다.
// - InputWiring*: 내원 수·진짜 입력 기록(WorkStoreJournal)·비교(MemoMatcher)·쓰다 멈춘 사람 검사·직접 확인·풀 사람·확인할 수 없는 기록·store.* 잠금·명령 표부터 조각까지
// 비트 화면·확인 창·DB는 가짜다. 진짜 비트 화면은 의원 PC 시험이다(시험용 환자 한 명 → 실제 하루치 → 입력 중 크롬 닫기).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildDotnet, runDotnet } from './runDotnet'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const HELPER_SRC = path.join(ROOT, 'helper', 'src')
const HELPER_CSPROJ = path.join('helper', 'src', 'Precheck.Helper', 'Precheck.Helper.csproj')

let run: { code: number; output: string } = { code: -1, output: '' }

// 잠금 폴더는 이 서버의 모든 작업 폴더가 같이 쓴다. 다른 쪽 dotnet을 기다리는 시간까지 넉넉히 준다
beforeAll(() => {
  run = runDotnet('InputWiring', { timeoutMs: 560_000 })
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

function code(...parts: string[]): string {
  return readFileSync(path.join(HELPER_SRC, ...parts), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('REQ-035 bit.input 연결 (C# InputWiring*)', () => {
  it('AC-035.1 내원 수가 정확히 1건인 진료만 남고 2건 이상·0건은 열지 않는다, 읽기 실패면 E-BIT-READ-FAILED', () => {
    expectAc('AC-035.1')
  })

  it('AC-035.2 진짜 입력 기록: Mark는 돌아오기 전에 달 파일에, SaveResults는 앞선 기록을 덮지 않는다', () => {
    expectAc('AC-035.2')
  })

  it('AC-035.3 쓰기 전 비교는 Core/Claim/MemoCompare로 판단한다', () => {
    expectAc('AC-035.3')
  })

  it('AC-035.4 쓰다 멈춘 사람을 뺀 묶음은 확인 창 없이 stopped와 unconfirmed', () => {
    expectAc('AC-035.4')
  })

  it('AC-035.5 직접 확인: 쓰다 멈춘 사람으로 보지 않고 SkippedByHand를 남긴다', () => {
    expectAc('AC-035.5')
  })

  it('AC-035.6 store.save와 .bak으로 되살리는 store.load는 잠금을 잡은 동안에만 쓴다', () => {
    expectAc('AC-035.6')
  })

  it('AC-035.7 명령 표 검사부터 조각까지 끝까지 돈다', () => {
    expectAc('AC-035.7')
  })

  it('AC-035.8 차례: 묶음 검사 → 잠금 → 등록·내원 수 → 기록 → 쓰다 멈춘 사람 → 빼기, 남는 사람도 풀 사람도 없으면 창 없이 finished, 풀 사람은 [확인] 뒤 열지 않고 푼다', () => {
    expectAc('AC-035.8')
  })

  it('AC-035.9 확인할 수 없는 기록: 검사는 고치지 않고 창 하나로 묻고, 확인은 바이트 해시로 input-acks.dat에 둔다', () => {
    expectAc('AC-035.9')
  })
})

describe('REQ-035 도우미 배선 (글자·빌드)', () => {
  it('AC-035.7 Program.cs는 표준 입력 닫힘 신호와 진짜 입력 기록·비교를 부품으로 넘겨 메시지 고리 전에 bit.input을 붙인다', () => {
    const program = code('Precheck.Helper', 'Program.cs')
    expect(program).toMatch(/InputCommands\.Register\(dispatcher, InputParts\.Create\(\w+, signal, HelperStore\.OpenJournal, new MemoMatcher\(\), log\.Write\)\);/)
    expect(program.indexOf('new HostSignal()')).toBeLessThan(program.indexOf('InputCommands.Register('))
    expect(program.indexOf('InputCommands.Register(')).toBeLessThan(program.indexOf('MessageLoop.Run('))
  })

  it('AC-035.2 도우미의 입력 기록은 도우미 저장 폴더·DPAPI 위의 WorkStoreJournal이다', () => {
    const store = code('Precheck.Helper', 'Commands', 'HelperStore.cs')
    expect(store).toMatch(/OpenJournal\(HospitalRegistration registration\)/)
    expect(store).toContain('new WorkStoreJournal(')
    expect(store).toContain('new DpapiProtector()')
    expect(store).toContain('HelperServices.DataDirectory()')
  })

  it('AC-035.3 Input 안에 비교를 다시 만들지 않는다: MemoMatcher는 MemoCompare.Matches를 부른다', () => {
    const matcher = code('Precheck.Core', 'Input', 'MemoMatcher.cs')
    expect(matcher).toContain('MemoCompare.Matches(')
    expect(matcher).not.toMatch(/Replace\(|string\.Equals/)
  })

  it('AC-035.1 Sql.cs의 새 상수는 다른 상수 끝(매개변수 표 앞)에 두고 허용 목록에 든다', () => {
    const sql = code('Precheck.Core', 'Bit', 'Sql.cs')
    const constant = sql.indexOf('public const string InputVisitCountSql')
    expect(constant).toBeGreaterThan(sql.indexOf('public const string ClaimDatesSql'))
    expect(constant).toBeLessThan(sql.indexOf('private static readonly SqlParam[] FocusRange'))
    expect(sql).toMatch(/\[InputVisitCountSql\] = /)
  })

  // TASK-35는 판을 올리지 않고 릴리스 때 같은 커밋에서 올리기로 했다(design.md 13절). 대시보드·통계·매출 쪽과 합친 릴리스가 0.3.0이었다.
  // 0.4.0 = 0.3.0 + 환자 탭 contact.targets(patients TASK-9). 0.3.0도 다른 화면은 그대로 쓰므로 막는 기준 MIN_HELPER는 0.3.0에 둔다
  // 0.5.0 = 0.4.0 + 통계 세 칸(stats.rows v3)·예약 문자 명단·장기 미방문 명단(stats-bit-sections·patients-bit-lists TASK-7). MIN은 그대로 0.3.0
  // 0.5.1 = 0.5.0 + 긴 기간 통계 읽기 속도(첫 내원 해시 잇기, helper-stats-speed TASK-2). MIN은 그대로 0.3.0
  // 0.6.0 = 0.5.1 + revenue.days 답에 날마다 처방별 금액 dayCodes(stats-revenue TASK-1). 새 명령 없음, MIN은 그대로 0.3.0
  // 0.7.0 = 0.6.0 + stats.rows v4(patientDays 다섯째 칸 90일초진)·revenue.days 확인 필요한 날의 roughTotal(first90 TASK-1). 새 명령 없음, MIN은 그대로 0.3.0
  // 0.9.1 = 0.9.0 + 수납일지 장부 미수에서 건강생활유지비(QCV) 뺌(sunap-health TASK-1). 새 명령 없음, MIN은 그대로 0.3.0
  it('AC-035.7·AC-3402.2·AC-4101.5·AC-4405.3·AC-5401.3 릴리스: 도우미 Version과 웹 LATEST_HELPER가 같은 판 0.9.1이고 MIN_HELPER는 0.3.0이다', () => {
    const props = readFileSync(path.join(ROOT, 'helper', 'Directory.Build.props'), 'utf8')
    expect(props.match(/<Version>([^<]+)<\/Version>/)?.[1]).toBe('0.9.1')
    const versions = readFileSync(path.join(ROOT, 'src', 'lib', 'bridge', 'versions.ts'), 'utf8')
    expect(versions).toContain("MIN_HELPER = '0.3.0'")
    expect(versions).toContain("LATEST_HELPER = '0.9.1'")
  })

  it('AC-035.7 배선까지 넣은 도우미가 x86 net48로 빌드된다(Program.cs·InputParts.cs는 이 빌드로만 컴파일된다)', () => {
    const build = buildDotnet(HELPER_CSPROJ, { timeoutMs: 560_000 })
    expect(build.code, tail(build.output)).toBe(0)
  }, 580_000)
})
