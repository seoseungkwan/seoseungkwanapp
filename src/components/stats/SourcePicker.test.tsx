// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { diffDays } from '@/lib/analytics/dates'
import { toDayPayloads } from '@/lib/payload/toDayPayloads'
import { toMonthPayload } from '@/lib/payload/toMonthPayload'
import { nestedBoxes } from '@/testing/boxes'
import type { AnalysisResult, FileReport } from '@/types/analyze'
import type { BridgeState } from '@/types/bridge'
import type { DayPayload, MonthPayload } from '@/types/payload'
import { runAnalysis } from '@/workers/runAnalysis'
import { fileCovered, readFiles, SourcePicker } from './SourcePicker'

// 자료 고르기 (stats REQ-514 AC-514.3·514.4·514.5·514.8, 시안 notes.md §3). 파일 이름·숫자는 모두 가짜다

vi.mock('@/workers/runAnalysis', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/workers/runAnalysis')>()),
  runAnalysis: vi.fn(),
}))
// compareText 등 나머지는 진짜다(fillGroupCounts가 줄 차례에 쓴다)
vi.mock('@/lib/payload/toMonthPayload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/payload/toMonthPayload')>()),
  toMonthPayload: vi.fn(),
}))
vi.mock('@/lib/payload/toDayPayloads', () => ({ toDayPayloads: vi.fn() }))

const TODAY = '2026-11-13'
const YESTERDAY = '2026-11-12'
const LOAD = '비트에서 불러오기'

const onLoad = vi.fn()
const onFiles = vi.fn()
const onRetry = vi.fn()

function draw(state: BridgeState = 'ready', over: { job?: 'bit' | 'file' | 'save' | null; helloError?: string | null } = {}) {
  return render(<SourcePicker state={state} helloError={over.helloError ?? null} today={TODAY} job={over.job ?? null} onRetry={onRetry} onLoad={onLoad} onFiles={onFiles} />)
}

const fileNamed = (name: string) => new File(['가짜'], name)
const okReport = (index: number, range: { from: string; to: string }, period: { from: string; to: string } | null = range): FileReport => ({
  index,
  ok: true,
  period,
  range,
  rowCount: 3,
  skippedSummaryRows: 0,
  invalidRows: 0,
  unknownVisitRows: 0,
  staleDays: null,
})

beforeEach(() => {
  onLoad.mockReset()
  onFiles.mockReset()
  onRetry.mockReset()
  vi.mocked(runAnalysis).mockReset()
  vi.mocked(toMonthPayload).mockReset()
  vi.mocked(toDayPayloads).mockReset()
})

afterEach(cleanup)

describe('AC-514.3·514.8 비트 PC', () => {
  it('AC-514.8 비트 PC면 [비트에서 불러오기]와 처음 꺼진 "오늘 진료 끝"이 있고 꺼짐 안내가 보인다', () => {
    draw()
    expect(screen.getByRole('button', { name: LOAD })).toBeTruthy()
    const check = screen.getByRole('checkbox', { name: '오늘 진료 끝' }) as HTMLInputElement
    expect(check.checked).toBe(false)
    expect(screen.getByText('꺼 두면 오늘(11월 13일)은 진료 중이라, 어제까지만 끝난 날로 저장해요.')).toBeTruthy()
  })

  it('AC-514.8 끄고 누르면 onLoad(false), 켜고 누르면 안내가 바뀌고 onLoad(true)', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: LOAD }))
    expect(onLoad).toHaveBeenLastCalledWith(false)

    fireEvent.click(screen.getByRole('checkbox', { name: '오늘 진료 끝' }))
    expect(screen.getByText('켜고 불러오면 오늘(11월 13일) 숫자도 끝난 날로 저장해요. 진료가 다 끝난 뒤에 켜 주세요.')).toBeTruthy()
    expect(screen.queryByText(/꺼 두면/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: LOAD }))
    expect(onLoad).toHaveBeenLastCalledWith(true)
  })

  it('AC-514.3 불러오는 동안 단추는 막히고 "불러오는 중"이며 읽는 중 안내가 보이고, 눌러도 다시 부르지 않는다', () => {
    draw('ready', { job: 'bit' })
    const button = screen.getByRole('button', { name: '불러오는 중' })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('비트 PC에서 읽는 중이에요. 기간이 길면 1분쯤 걸려요.')).toBeTruthy()
    fireEvent.click(button)
    expect(onLoad).not.toHaveBeenCalled()
  })

  it('AC-514.3 파일을 읽는 동안에도 불러오기는 막히되 글자는 그대로다', () => {
    draw('ready', { job: 'file' })
    const button = screen.getByRole('button', { name: LOAD })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(button)
    expect(onLoad).not.toHaveBeenCalled()
    expect(screen.queryByText(/비트 PC에서 읽는 중/)).toBeNull()
    expect(screen.getByText('파일을 이 PC 안에서 읽는 중이에요.')).toBeTruthy()
  })

  it('AC-514.6 다시 저장하는 동안 불러오기·파일이 막히되 글자는 그대로이고 읽는 중 안내는 없다', () => {
    const { container } = draw('ready', { job: 'save' })
    const load = screen.getByRole('button', { name: LOAD })
    expect(load.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(load)
    expect(onLoad).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '파일 고르기' }).getAttribute('aria-disabled')).toBe('true')
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [fileNamed('가짜환자.xlsx')] } })
    expect(onFiles).not.toHaveBeenCalled()
    expect(screen.queryByText(/읽는 중이에요/)).toBeNull()
  })

  it.each(['bit', 'file', 'save'] as const)('AC-514.8 일(%s)을 하는 동안 "오늘 진료 끝"은 바꿀 수 없다', (job) => {
    draw('ready', { job })
    expect((screen.getByRole('checkbox', { name: '오늘 진료 끝' }) as HTMLInputElement).disabled).toBe(true)
  })

  it('AC-514.8 일이 없으면 "오늘 진료 끝"을 바꿀 수 있다', () => {
    draw()
    expect((screen.getByRole('checkbox', { name: '오늘 진료 끝' }) as HTMLInputElement).disabled).toBe(false)
  })
})

describe('AC-514.5 연결 상태별 안내', () => {
  it('AC-514.5 확장이 없으면 불러오기 대신 안내와 파일 길이 보인다', () => {
    draw('no-extension')
    expect(screen.queryByRole('button', { name: LOAD })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByText('비트 PC의 크롬에서 불러올 수 있어요')).toBeTruthy()
    expect(screen.getByText('이 기기에서는 저장된 숫자만 보여요. 처방별 신환·재진과 보고 문장은 비트 PC에서 볼 수 있어요.')).toBeTruthy()
    expect(screen.getByRole('button', { name: '파일 고르기' })).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('AC-514.5 도우미가 없으면 안내와 /claim/setup 링크(시안 이름 [비트 PC 연결])', () => {
    draw('no-helper')
    expect(screen.queryByRole('button', { name: LOAD })).toBeNull()
    expect(screen.getByText('이 PC에서는 아직 비트에서 불러올 수 없어요')).toBeTruthy()
    expect(screen.getByText('도우미 프로그램이 없어요. 비트 PC 연결 화면에서 설치하면 [비트에서 불러오기]가 생겨요.')).toBeTruthy()
    expect(screen.getByRole('link', { name: '비트 PC 연결' }).getAttribute('href')).toBe('/claim/setup')
    expect(screen.getByRole('button', { name: '파일 고르기' })).toBeTruthy()
  })

  it.each([
    ['update-helper', /도우미 프로그램을 업데이트해야 해요/],
    ['update-extension', /크롬 확장 프로그램을 업데이트해야 해요/],
  ] as const)('AC-514.5 %s는 둘째 줄만 그 안내로 바뀌고 링크가 있다', (state, line) => {
    draw(state)
    expect(screen.queryByRole('button', { name: LOAD })).toBeNull()
    expect(screen.getByText('이 PC에서는 아직 비트에서 불러올 수 없어요')).toBeTruthy()
    expect(screen.getByText(line)).toBeTruthy()
    expect(screen.getByRole('link', { name: '비트 PC 연결' }).getAttribute('href')).toBe('/claim/setup')
  })

  it.each([
    ['busy', 'E-BRIDGE-BUSY'],
    ['disconnected', 'E-BRIDGE-DISCONNECTED'],
  ] as const)('AC-514.5 %s면 불러오기 대신 정해 둔 안내와 [다시 확인]이 있다', (state, code) => {
    draw(state)
    expect(screen.queryByRole('button', { name: LOAD })).toBeNull()
    expect(document.body.textContent).toContain(code)
    fireEvent.click(screen.getByRole('button', { name: '다시 확인' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('AC-514.5 연결을 확인하다 번호로 멈추면 그 번호와 [다시 확인]이 있다', () => {
    draw('connecting', { helloError: 'E-BRIDGE-BAD-REPLY' })
    expect(document.body.textContent).toContain('E-BRIDGE-BAD-REPLY')
    fireEvent.click(screen.getByRole('button', { name: '다시 확인' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('AC-514.5 연결을 확인하는 동안은 불러오기도 다시 확인도 없다', () => {
    draw('connecting')
    expect(screen.queryByRole('button', { name: LOAD })).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 확인' })).toBeNull()
    expect(screen.getByRole('button', { name: '파일 고르기' })).toBeTruthy()
  })
})

describe('AC-514.4 파일 넣기', () => {
  it('AC-514.4 [파일 고르기]로 고른 파일을 넘긴다', () => {
    const { container } = draw('no-extension')
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const click = vi.spyOn(input, 'click')
    fireEvent.click(screen.getByRole('button', { name: '파일 고르기' }))
    expect(click).toHaveBeenCalledTimes(1)

    const file = fileNamed('가짜환자.xlsx')
    fireEvent.change(input, { target: { files: [file] } })
    expect(onFiles).toHaveBeenCalledWith([file])
  })

  it('AC-514.4 끌어다 놓은 파일을 넘긴다', () => {
    draw()
    const file = fileNamed('가짜환자.xlsx')
    const place = screen.getByText('또는 비트에서 내보낸 파일을 여기에 끌어다 놓아요')
    const over = fireEvent.dragOver(place, { dataTransfer: { files: [file] } })
    expect(over).toBe(false) // 기본 동작(파일 열기)을 막았다
    const dropped = fireEvent.drop(place, { dataTransfer: { files: [file] } })
    expect(dropped).toBe(false) // 브라우저가 환자 파일을 열지 않게 막았다
    expect(onFiles).toHaveBeenCalledWith([file])
  })

  it('AC-514.4 일을 하는 동안 끌어다 놓아도 브라우저가 파일을 열지 않는다', () => {
    draw('ready', { job: 'bit' })
    const place = screen.getByText('또는 비트에서 내보낸 파일을 여기에 끌어다 놓아요')
    const file = fileNamed('가짜환자.xlsx')
    expect(fireEvent.dragOver(place, { dataTransfer: { files: [file] } })).toBe(false)
    expect(fireEvent.drop(place, { dataTransfer: { files: [file] } })).toBe(false)
    expect(onFiles).not.toHaveBeenCalled()
  })

  it('AC-514.4 고른 뒤 파일 칸을 비워 같은 파일을 다시 고를 수 있다', () => {
    const { container } = draw()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const setValue = vi.fn()
    Object.defineProperty(input, 'value', { configurable: true, get: () => '가짜 경로', set: setValue })
    fireEvent.change(input, { target: { files: [fileNamed('가짜환자.xlsx')] } })
    expect(setValue).toHaveBeenCalledWith('')
  })

  it('AC-514.4 일을 하는 동안은 파일도 받지 않는다', () => {
    const { container } = draw('ready', { job: 'bit' })
    const button = screen.getByRole('button', { name: '파일 고르기' })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    const file = fileNamed('가짜환자.xlsx')
    fireEvent.drop(screen.getByText('또는 비트에서 내보낸 파일을 여기에 끌어다 놓아요'), { dataTransfer: { files: [file] } })
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } })
    expect(onFiles).not.toHaveBeenCalled()
  })

  it('AC-514.10 상자 안 상자가 없고 768px 미만에서 세로로 쌓이며 파일 단추가 전체 폭이다', () => {
    const { container } = draw()
    expect(nestedBoxes(container)).toEqual([])
    const band = within(container).getByRole('button', { name: LOAD }).parentElement?.parentElement
    expect(band?.className).toContain('max-md:flex-col')
    expect(screen.getByRole('button', { name: '파일 고르기' }).className).toContain('max-md:w-full')
  })
})

describe('AC-514.4 파일이 덮은 기간', () => {
  it('AC-514.4 기간 줄과 받아들인 줄 범위를 합친다', () => {
    const covered = fileCovered([okReport(0, { from: '2026-10-05', to: '2026-10-20' }, { from: '2026-10-01', to: '2026-10-31' })], TODAY)
    expect(covered).toEqual({ from: '2026-10-01', to: '2026-10-31' })
  })

  it('AC-514.4 기간 줄이 없으면 받아들인 줄 범위다', () => {
    expect(fileCovered([okReport(0, { from: '2026-10-05', to: '2026-10-20' }, null)], TODAY)).toEqual({ from: '2026-10-05', to: '2026-10-20' })
  })

  it('AC-514.4 이어지지 않으면 가장 최근 이어진 구간이다', () => {
    const covered = fileCovered(
      [okReport(0, { from: '2026-08-01', to: '2026-08-31' }), okReport(1, { from: '2026-10-01', to: '2026-10-15' }), okReport(2, { from: '2026-10-16', to: '2026-10-31' })],
      TODAY,
    )
    expect(covered).toEqual({ from: '2026-10-01', to: '2026-10-31' })
  })

  it('AC-514.4 끝은 어제 이하다(파일 길에는 오늘 진료 끝이 없다)', () => {
    expect(fileCovered([okReport(0, { from: '2026-11-01', to: TODAY })], TODAY)).toEqual({ from: '2026-11-01', to: YESTERDAY })
  })

  it('AC-514.4 오늘 하루만 든 구간은 덮은 날이 아니라 앞 구간을 고른다. 그런 구간뿐이면 null이다', () => {
    expect(fileCovered([okReport(0, { from: '2026-11-01', to: '2026-11-05' }), okReport(1, { from: TODAY, to: TODAY })], TODAY)).toEqual({ from: '2026-11-01', to: '2026-11-05' })
    expect(fileCovered([okReport(0, { from: TODAY, to: TODAY })], TODAY)).toBeNull()
  })

  it('AC-514.4 실패한 파일은 보지 않고 성공한 파일이 없으면 null이다', () => {
    const failed: FileReport = { index: 0, ok: false, code: 'E-PARSE-EMPTY' }
    expect(fileCovered([failed], TODAY)).toBeNull()
    expect(fileCovered([failed, okReport(1, { from: '2026-10-01', to: '2026-10-02' })], TODAY)).toEqual({ from: '2026-10-01', to: '2026-10-02' })
  })

  it('AC-507.1 801일 파일은 덮은 기간을 끝에서 800일로 줄인다(표 제약에 걸리지 않게)', () => {
    const to = YESTERDAY
    const from = '2024-09-03'
    expect(diffDays(from, to)).toBe(800) // 양 끝을 합쳐 801일
    const covered = fileCovered([okReport(0, { from, to })], TODAY)
    expect(covered?.to).toBe(to)
    expect(diffDays(covered!.from, covered!.to)).toBe(799) // 양 끝을 합쳐 800일
  })

  it('AC-507.1 800일 파일은 줄이지 않는다', () => {
    const from = '2024-09-04'
    expect(fileCovered([okReport(0, { from, to: YESTERDAY })], TODAY)).toEqual({ from, to: YESTERDAY })
  })
})

describe('AC-514.4 파일 읽기', () => {
  const MONTH = { month: '2026-10' } as MonthPayload
  const DAY = { day: '2026-10-05' } as DayPayload
  const VALID = { quality: 'valid', skippedInvalidRows: 0 } as AnalysisResult

  it('AC-514.4 성공하면 저장 모양과 덮은 기간을 source file로 돌려주고 파일 이름은 그 안에 없다', async () => {
    const file = fileNamed('가짜환자.xlsx')
    vi.mocked(runAnalysis).mockResolvedValue({ files: [okReport(0, { from: '2026-10-01', to: '2026-10-31' })], result: VALID })
    vi.mocked(toMonthPayload).mockReturnValue([MONTH])
    vi.mocked(toDayPayloads).mockReturnValue([DAY])

    const outcome = await readFiles([file], TODAY)

    expect(runAnalysis).toHaveBeenCalledWith([file], { today: TODAY })
    expect(outcome.failures).toEqual([])
    expect(outcome.save).toEqual({ months: [MONTH], days: [DAY], covered: { from: '2026-10-01', to: '2026-10-31' }, source: 'file' })
    expect(JSON.stringify(outcome.save)).not.toContain('가짜환자')
  })

  it('AC-514.4 파일마다 실패는 그 파일 이름과 번호로 돌려준다', async () => {
    const files = [fileNamed('가짜하나.xlsx'), fileNamed('가짜둘.xlsx')]
    vi.mocked(runAnalysis).mockResolvedValue({
      files: [{ index: 0, ok: false, code: 'E-PARSE-EMPTY' }, { index: 1, ok: false, code: 'E-PARSE-TOO-BIG' }],
      result: null,
    })
    const outcome = await readFiles(files, TODAY)
    expect(outcome.failures).toEqual([
      { name: '가짜하나.xlsx', code: 'E-PARSE-EMPTY' },
      { name: '가짜둘.xlsx', code: 'E-PARSE-TOO-BIG' },
    ])
    expect(outcome.save).toBeNull()
    expect(outcome.incomplete).toBeNull()
  })

  it('AC-507.1 801일 파일도 저장 모양이 있고 덮은 기간이 800일이며 일 숫자는 줄이지 않는다', async () => {
    const days = [DAY, { day: '2024-09-03' } as DayPayload]
    vi.mocked(runAnalysis).mockResolvedValue({ files: [okReport(0, { from: '2024-09-03', to: YESTERDAY })], result: VALID })
    vi.mocked(toMonthPayload).mockReturnValue([MONTH])
    vi.mocked(toDayPayloads).mockReturnValue(days)

    const outcome = await readFiles([fileNamed('가짜환자.xlsx')], TODAY)

    expect(outcome.save?.days).toEqual(days)
    expect(diffDays(outcome.save!.covered!.from, outcome.save!.covered!.to)).toBe(799)
  })

  it('AC-514.6 품질이 incomplete면 저장 모양이 없고 확인 건수를 돌려준다', async () => {
    const files = [fileNamed('가짜하나.xlsx'), fileNamed('가짜둘.xlsx')]
    vi.mocked(runAnalysis).mockResolvedValue({
      files: [{ index: 0, ok: false, code: 'E-PARSE-EMPTY' }, okReport(1, { from: '2026-10-01', to: '2026-10-31' })],
      result: { quality: 'incomplete', skippedInvalidRows: 3 } as AnalysisResult,
    })
    vi.mocked(toMonthPayload).mockReturnValue(null)
    vi.mocked(toDayPayloads).mockReturnValue(null)

    const outcome = await readFiles(files, TODAY)
    expect(outcome.save).toBeNull()
    expect(outcome.incomplete).toEqual({ failedFiles: 1, skippedRows: 3 })
    expect(outcome.failures).toEqual([{ name: '가짜하나.xlsx', code: 'E-PARSE-EMPTY' }])
  })
})

describe('AC-1205.5 파일 길에 묶음 넘기기', () => {
  const MONTH = { month: '2026-10' } as MonthPayload
  const VALID = { quality: 'valid', skippedInvalidRows: 0 } as AnalysisResult
  // 묶음 열쇠는 treatment-trend AC-1206.1의 고정 값(t2538… = ESWT1·ESWT7, t0c99… = 도수)
  const ESWT = 't2538e307d10103cb'
  const MANUAL = 't0c99afbb8431612f'
  const counted = { id: ESWT, patients: 2, newPatients: 1, returning: 1 }
  const DAY = { day: '2026-10-05', groups: [counted] } as DayPayload
  const report = okReport(0, { from: '2026-10-01', to: '2026-10-31' })

  it('AC-1205.5 셋째 인자로 준 묶음이 runAnalysis에 { id, codes }로만 가고 저장할 일 줄은 fillGroupCounts를 거친다', async () => {
    const file = fileNamed('가짜환자.xlsx')
    vi.mocked(runAnalysis).mockResolvedValue({ files: [report], result: VALID })
    vi.mocked(toMonthPayload).mockReturnValue([MONTH])
    vi.mocked(toDayPayloads).mockReturnValue([DAY])
    // 이름 칸이 붙어 와도 Worker로는 열쇠·처방 코드만 간다
    const groups = [
      { id: ESWT, codes: ['ESWT1', 'ESWT7'], name: '충격파' },
      { id: MANUAL, codes: ['도수'], name: '도수치료' },
    ]

    const outcome = await readFiles([file], TODAY, groups)

    expect(runAnalysis).toHaveBeenCalledWith([file], {
      today: TODAY,
      groups: [
        { id: ESWT, codes: ['ESWT1', 'ESWT7'] },
        { id: MANUAL, codes: ['도수'] },
      ],
    })
    // 그날 아무도 안 받은 묶음은 0줄, 줄은 id 글자 차례
    expect(outcome.save?.days).toEqual([
      {
        day: '2026-10-05',
        groups: [
          { id: MANUAL, patients: 0, newPatients: 0, returning: 0 },
          { id: ESWT, patients: 2, newPatients: 1, returning: 1 },
        ],
      },
    ])
    expect(DAY.groups).toEqual([counted]) // 넣은 값은 그대로
    expect(outcome.save?.months).toEqual([MONTH])
    expect(JSON.stringify(outcome.save)).not.toContain('충격파')
  })

  it('AC-2704.1 제외할 처방이 있는 묶음은 runAnalysis에 exclude가 그대로(새 배열로) 가고, 빈 배열·없음이면 { id, codes }만, 이름은 안 간다', async () => {
    const file = fileNamed('가짜환자.xlsx')
    vi.mocked(runAnalysis).mockResolvedValue({ files: [report], result: VALID })
    vi.mocked(toMonthPayload).mockReturnValue([MONTH])
    vi.mocked(toDayPayloads).mockReturnValue([DAY])
    // 열쇠는 rx-group-exclude AC-2705.2의 고정 값(t7bdb… = MM010 중 ESWT7 날 뺌)
    const EXCLUDING = 't7bdb9b20a17a64d3'
    const exclude = ['ESWT7']
    const groups = [
      { id: EXCLUDING, codes: ['MM010'], exclude, name: '가짜 물리치료' },
      { id: ESWT, codes: ['ESWT1', 'ESWT7'], exclude: [], name: '충격파' },
      { id: MANUAL, codes: ['도수'], name: '도수치료' },
    ]

    await readFiles([file], TODAY, groups)

    const [, opts] = vi.mocked(runAnalysis).mock.calls[0]
    expect(opts?.groups).toStrictEqual([
      { id: EXCLUDING, codes: ['MM010'], exclude: ['ESWT7'] },
      { id: ESWT, codes: ['ESWT1', 'ESWT7'] },
      { id: MANUAL, codes: ['도수'] },
    ])
    expect(opts?.groups?.[0].exclude).not.toBe(exclude)
    expect(JSON.stringify(opts)).not.toContain('가짜 물리치료')
    expect(JSON.stringify(opts)).not.toContain('충격파')
  })

  it('AC-1205.5 묶음을 주지 않거나 빈 목록이면 지금과 같다(runAnalysis에 groups 칸이 없고 일 줄을 그대로 저장한다)', async () => {
    const file = fileNamed('가짜환자.xlsx')
    const plain = { day: '2026-10-05' } as DayPayload
    vi.mocked(runAnalysis).mockResolvedValue({ files: [report], result: VALID })
    vi.mocked(toMonthPayload).mockReturnValue([MONTH])
    vi.mocked(toDayPayloads).mockReturnValue([plain])

    for (const outcome of [await readFiles([file], TODAY), await readFiles([file], TODAY, [])]) {
      expect(outcome.save?.days).toEqual([plain])
      expect(outcome.save?.days[0]).toBe(plain)
    }
    expect(vi.mocked(runAnalysis).mock.calls.map(([, opts]) => opts)).toEqual([{ today: TODAY }, { today: TODAY }])
    expect(vi.mocked(runAnalysis).mock.calls.every(([, opts]) => !('groups' in (opts ?? {})))).toBe(true)
  })

  it('AC-1205.5 묶음을 줘도 품질이 incomplete면 저장 모양이 없다', async () => {
    vi.mocked(runAnalysis).mockResolvedValue({ files: [report], result: { quality: 'incomplete', skippedInvalidRows: 2 } as AnalysisResult })
    vi.mocked(toMonthPayload).mockReturnValue(null)
    vi.mocked(toDayPayloads).mockReturnValue(null)

    const outcome = await readFiles([fileNamed('가짜환자.xlsx')], TODAY, [{ id: ESWT, codes: ['ESWT1', 'ESWT7'] }])

    expect(outcome.save).toBeNull()
    expect(outcome.incomplete).toEqual({ failedFiles: 0, skippedRows: 2 })
  })
})
