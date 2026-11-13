// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { diffDays } from '@/lib/analytics/dates'
import { toDayPayloads } from '@/lib/payload/toDayPayloads'
import { toMonthPayload } from '@/lib/payload/toMonthPayload'
import { nestedBoxes } from '@/testing/boxes'
import type { AnalysisResult, FileReport } from '@/types/analyze'
import type { BridgeState } from '@/types/bridge'
import type { DayPayload, MonthPayload } from '@/types/payload'
import { runAnalysis } from '@/workers/runAnalysis'
import { fileCovered, readFiles, SourcePicker } from './SourcePicker'
import { statsRange } from './view'

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
const RANGE = statsRange(TODAY, '30d') // 불러올 범위 2026-09-01 ~ 11-13

const onLoad = vi.fn()
const onFiles = vi.fn()
const onRetry = vi.fn()

type Over = { job?: 'bit' | 'file' | 'save' | null; helloError?: string | null; progress?: string | null; canFold?: boolean; summary?: ReactNode }

function picker(state: BridgeState = 'ready', over: Over = {}) {
  return (
    <SourcePicker
      state={state}
      helloError={over.helloError ?? null}
      today={TODAY}
      range={RANGE}
      job={over.job ?? null}
      progress={over.progress ?? null}
      summary={over.summary}
      canFold={over.canFold}
      onRetry={onRetry}
      onLoad={onLoad}
      onFiles={onFiles}
    />
  )
}

function draw(state: BridgeState = 'ready', over: Over = {}) {
  return render(picker(state, over))
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
    expect(onLoad).toHaveBeenLastCalledWith(false, 'view')

    fireEvent.click(screen.getByRole('checkbox', { name: '오늘 진료 끝' }))
    expect(screen.getByText('켜고 불러오면 오늘(11월 13일) 숫자도 끝난 날로 저장해요. 진료가 다 끝난 뒤에 켜 주세요.')).toBeTruthy()
    expect(screen.queryByText(/꺼 두면/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: LOAD }))
    expect(onLoad).toHaveBeenLastCalledWith(true, 'view')
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

  it('AC-514.10·AC-4001.7 상자 안 상자가 없고 768px 미만에서 펼친 칸이 세로로 쌓이며(1024px 미만부터 세로) 띠 단추 줄·파일 단추가 전체 폭이다', () => {
    const { container } = draw()
    expect(nestedBoxes(container)).toEqual([])
    const file = screen.getByRole('button', { name: '파일 고르기' })
    expect(file.className).toContain('max-md:w-full')
    expect(file.parentElement?.parentElement?.className.split(' ')).toContain('flex-col')
    expect(within(container).getByRole('button', { name: LOAD }).parentElement?.className).toContain('max-md:w-full')
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

describe('AC-3705.2 파일 길(readFiles → runAnalysis)에 빼는 처방·조건 싣기', () => {
  const MONTH = { month: '2026-10' } as MonthPayload
  const VALID = { quality: 'valid', skippedInvalidRows: 0 } as AnalysisResult
  // 가짜 묶음 열쇠(t + 16자리). PT = 넣는 MM010·MM015, 빼는 ESWT7 · COND = 조건 MM080 ← MM020 · PLAIN = 빈 out·cond
  const PT = 't00000000000000c3'
  const COND = 't00000000000000d4'
  const PLAIN = 't00000000000000e5'
  const report = okReport(0, { from: '2026-10-01', to: '2026-10-31' })
  const counted = { id: COND, patients: 1, newPatients: 0, returning: 1 }

  it('AC-3705.2: runAnalysis에 { id, codes }와 함께 새로 만든 out·cond({ code, unless }만)가 가고, 빈 out·cond 묶음은 { id, codes }뿐이다. 일 줄은 묶음마다 채운다', async () => {
    const file = fileNamed('가짜환자.xlsx')
    vi.mocked(runAnalysis).mockResolvedValue({ files: [report], result: VALID })
    vi.mocked(toMonthPayload).mockReturnValue([MONTH])
    vi.mocked(toDayPayloads).mockReturnValue([{ day: '2026-10-05', groups: [counted] } as DayPayload])
    // 이름·차례·조건 메모가 붙어 와도 Worker로는 열쇠와 코드만 간다
    const groups = [
      { id: PT, codes: ['MM010', 'MM015'], out: ['ESWT7'], name: '가짜 기본 PT', sortOrder: 0 },
      { id: COND, codes: ['MM010', 'MM080'], cond: [{ code: 'MM080', unless: ['MM020', 'TENS'], note: '가짜 메모' }], name: '가짜 조건 묶음' },
      { id: PLAIN, codes: ['B4001'], out: [], cond: [] },
    ]

    const outcome = await readFiles([file], TODAY, groups)

    const [[, opts]] = vi.mocked(runAnalysis).mock.calls
    expect(opts).toStrictEqual({
      today: TODAY,
      groups: [
        { id: PT, codes: ['MM010', 'MM015'], out: ['ESWT7'] },
        { id: COND, codes: ['MM010', 'MM080'], cond: [{ code: 'MM080', unless: ['MM020', 'TENS'] }] },
        { id: PLAIN, codes: ['B4001'] },
      ],
    })
    const [pt, cond] = opts?.groups ?? []
    expect(pt.out).not.toBe(groups[0].out)
    expect(cond.cond?.[0]).not.toBe(groups[1].cond?.[0])
    expect(cond.cond?.[0].unless).not.toBe(groups[1].cond?.[0].unless)
    expect(JSON.stringify(opts)).not.toMatch(/가짜 기본 PT|가짜 조건 묶음|가짜 메모|sortOrder|name|note/)
    // 그날 아무도 안 받은 묶음은 0줄(fillGroupCounts 그대로), 줄은 id 글자 차례
    expect(outcome.save?.days).toEqual([
      {
        day: '2026-10-05',
        groups: [
          { id: PT, patients: 0, newPatients: 0, returning: 0 },
          counted,
          { id: PLAIN, patients: 0, newPatients: 0, returning: 0 },
        ],
      },
    ])
  })

  it('AC-3705.2: 빼는 처방·조건이 없는 묶음만 주면 runAnalysis에 가는 묶음은 지금 모양과 글자까지 같다', async () => {
    vi.mocked(runAnalysis).mockResolvedValue({ files: [report], result: VALID })
    vi.mocked(toMonthPayload).mockReturnValue([MONTH])
    vi.mocked(toDayPayloads).mockReturnValue([{ day: '2026-10-05', groups: [counted] } as DayPayload])

    await readFiles([fileNamed('가짜환자.xlsx')], TODAY, [{ id: PLAIN, codes: ['B4001'] }])

    const [[, opts]] = vi.mocked(runAnalysis).mock.calls
    expect(JSON.stringify(opts?.groups)).toBe(`[{"id":"${PLAIN}","codes":["B4001"]}]`)
  })
})

// ── 불러올 기간 (stats-load-range REQ-3301·AC-3303.4, 시안 docs/mockups/stats-load-range) ──

const SPAN_NAMES = ['지금 보는 기간', '최근 1년', '최근 2년', '전체 기간']
const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element | null | undefined) => tokens(el?.getAttribute('class') ?? '')
const spanGroup = () => screen.getByRole('group', { name: '불러올 기간' })
const spanButton = (name: string) => within(spanGroup()).getByRole('button', { name }) as HTMLButtonElement
const pressed = () => within(spanGroup()).getAllByRole('button').map((button) => button.getAttribute('aria-pressed'))
// 시험의 오늘은 2026-11-13이고 지금 보는 기간은 최근 30일이다(명세 예시의 11월 9일 대신 이 파일의 오늘로 같은 규칙)
const HINTS = [
  '지금 보는 기간(최근 30일)과 비교할 지난 30일이 든 9월 1일 – 11월 13일을 읽어요. 빨리 끝나요.',
  '2025년 12월 1일 – 2026년 11월 13일(1년)을 읽어요. 30초쯤 걸려요.',
  '2024년 12월 1일 – 2026년 11월 13일(2년)을 읽어요. 1분쯤 걸려요.',
  '2020년 1월 1일 – 2026년 11월 13일을 2년씩 4번에 나눠 읽어요. 4분쯤 걸려요. 한 번 저장한 달은 남으니 처음 한 번만 하면 돼요.',
]
const CLOSE_OFF = '꺼 두면 오늘(11월 13일)은 진료 중이라, 어제까지만 끝난 날로 저장해요.'

describe('AC-3301.1 불러올 기간 묶음 단추', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("AC-3301.1·AC-4001.1 펼칠 칸 맨 위 한 줄(basis-full)에 굵은 '불러올 기간' 글과 묶음이 있고 단추는 차례로 넷이며, [비트에서 불러오기]는 그 위 띠에 있다", () => {
    draw()
    const group = spanGroup()
    expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual(SPAN_NAMES)
    const title = screen.getByText('불러올 기간')
    expect(classesOf(title)).toEqual(expect.arrayContaining(['text-small', 'font-semibold', 'text-ink']))
    const row = group.parentElement
    expect(title.parentElement).toBe(row)
    expect(classesOf(row)).toContain('basis-full')
    const load = screen.getByRole('button', { name: LOAD })
    expect(load.compareDocumentPosition(row!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const panel = document.getElementById(screen.getByRole('button', { name: '불러오기 설정' }).getAttribute('aria-controls') ?? '')
    expect(panel?.contains(row!)).toBe(true)
    expect(panel?.contains(load)).toBe(false)
    expect(row?.parentElement?.firstElementChild).toBe(row)
  })

  it("AC-3301.1 넷째 단추 이름은 '전체 기간'이고, 어느 것을 골라도 화면에 '2020년부터 전부'라는 글이 없다", () => {
    const { container } = draw()
    expect(spanButton('전체 기간')).toBeTruthy()
    for (const name of SPAN_NAMES) {
      fireEvent.click(spanButton(name))
      expect(container.textContent).not.toContain('2020년부터 전부')
    }
  })

  it('AC-3301.1 화면을 열면 [지금 보는 기간]만 aria-pressed="true"이고, 다시 열어도 그렇다', () => {
    const first = draw()
    expect(pressed()).toEqual(['true', 'false', 'false', 'false'])
    fireEvent.click(spanButton('전체 기간'))
    first.unmount()
    draw()
    expect(pressed()).toEqual(['true', 'false', 'false', 'false'])
  })

  it('AC-3301.1 다른 단추를 누르면 그것만 눌린다', () => {
    draw()
    fireEvent.click(spanButton('최근 2년'))
    expect(pressed()).toEqual(['false', 'false', 'true', 'false'])
    fireEvent.click(spanButton('최근 1년'))
    expect(pressed()).toEqual(['false', 'true', 'false', 'false'])
  })

  it('AC-3301.1 ds.segment 모양: 묶음은 ds.segment.group + max-md:grid-cols-2(768px 미만 두 칸씩 두 줄), 눌린 것은 on, 나머지는 off', () => {
    draw()
    expect(classesOf(spanGroup()).sort()).toEqual(tokens(`${ds.segment.group} max-md:grid-cols-2`).sort())
    fireEvent.click(spanButton('최근 1년'))
    expect(classesOf(spanButton('최근 1년')).sort()).toEqual(tokens(`${ds.segment.button} ${ds.segment.on}`).sort())
    for (const name of ['지금 보는 기간', '최근 2년', '전체 기간']) {
      expect(classesOf(spanButton(name)).sort()).toEqual(tokens(`${ds.segment.button} ${ds.segment.off}`).sort())
    }
  })

  it('AC-3301.1 고른 것은 브라우저 저장소·서버에 쓰지 않는다', () => {
    const stored = vi.spyOn(Storage.prototype, 'setItem')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    draw()
    for (const name of SPAN_NAMES) fireEvent.click(spanButton(name))
    expect(stored).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('AC-3301.1 상자 안 상자가 없다(묶음은 띠 안의 상자 하나)', () => {
    const { container } = draw()
    expect(nestedBoxes(container)).toEqual([])
  })
})

describe('AC-3301.2 일이 있으면 막힘 · onLoad(오늘 진료 끝, 고른 것)', () => {
  it.each(['bit', 'file', 'save'] as const)('AC-3301.2 일(%s)이 있으면 네 단추가 disabled이고 눌러도 고른 것이 바뀌지 않는다', (job) => {
    draw('ready', { job })
    for (const name of SPAN_NAMES) expect(spanButton(name).disabled).toBe(true)
    fireEvent.click(spanButton('최근 1년'))
    expect(pressed()).toEqual(['true', 'false', 'false', 'false'])
  })

  it('AC-3301.2 일이 끝나면 다시 누를 수 있고 고른 것은 그대로다', () => {
    const { rerender } = draw()
    fireEvent.click(spanButton('전체 기간'))
    rerender(picker('ready', { job: 'bit' }))
    expect(spanButton('최근 1년').disabled).toBe(true)
    fireEvent.click(spanButton('최근 1년'))
    expect(pressed()).toEqual(['false', 'false', 'false', 'true'])
    rerender(picker('ready', { job: null }))
    for (const name of SPAN_NAMES) expect(spanButton(name).disabled).toBe(false)
    expect(pressed()).toEqual(['false', 'false', 'false', 'true'])
  })

  it("AC-3301.2 [비트에서 불러오기]를 누르면 onLoad(오늘 진료 끝, 고른 것)이고 고른 것은 'view'·'1y'·'2y'·'all'이다", () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: LOAD }))
    expect(onLoad).toHaveBeenLastCalledWith(false, 'view')
    fireEvent.click(spanButton('최근 1년'))
    fireEvent.click(screen.getByRole('button', { name: LOAD }))
    expect(onLoad).toHaveBeenLastCalledWith(false, '1y')
    fireEvent.click(spanButton('최근 2년'))
    fireEvent.click(screen.getByRole('button', { name: LOAD }))
    expect(onLoad).toHaveBeenLastCalledWith(false, '2y')
    fireEvent.click(spanButton('전체 기간'))
    fireEvent.click(screen.getByRole('checkbox', { name: '오늘 진료 끝' }))
    fireEvent.click(screen.getByRole('button', { name: LOAD }))
    expect(onLoad).toHaveBeenLastCalledWith(true, 'all')
    expect(onLoad).toHaveBeenCalledTimes(4)
  })
})

describe('AC-3301.3 단추 아래 안내 줄', () => {
  it('AC-3301.3 고른 것마다 읽을 날짜와 걸리는 때를 말한다', () => {
    draw()
    SPAN_NAMES.forEach((name, i) => {
      fireEvent.click(spanButton(name))
      expect(screen.getByText(HINTS[i])).toBeTruthy()
      for (const other of HINTS.filter((_, j) => j !== i)) expect(screen.queryByText(other)).toBeNull()
    })
  })

  it("AC-3301.3 안내 줄은 basis-full text-small text-ink-2이고 [비트에서 불러오기] 뒤, '오늘 진료 끝' 안내 바로 위에 있다", () => {
    draw()
    const hint = screen.getByText(HINTS[0])
    expect(hint.tagName).toBe('P')
    expect(classesOf(hint).sort()).toEqual(['basis-full', 'text-small', 'text-ink-2'].sort())
    expect(hint.nextElementSibling?.textContent).toBe(CLOSE_OFF)
    const load = screen.getByRole('button', { name: LOAD })
    expect(load.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('AC-3303.4 나눠 읽는 중 줄', () => {
  const PROGRESS = '비트 PC에서 읽는 중이에요 (2/4 · 2022년 12월 – 2024년 11월). 다 끝날 때까지 이 창을 닫지 마세요.'

  it('AC-3303.4 비트 일 중 progress가 있으면 읽는 중 줄이 그 글이다', () => {
    draw('ready', { job: 'bit', progress: PROGRESS })
    expect(screen.getByText(PROGRESS)).toBeTruthy()
    expect(screen.queryByText('비트 PC에서 읽는 중이에요. 기간이 길면 1분쯤 걸려요.')).toBeNull()
  })

  it('AC-3303.4 progress가 없으면 지금 글이다', () => {
    draw('ready', { job: 'bit', progress: null })
    expect(screen.getByText('비트 PC에서 읽는 중이에요. 기간이 길면 1분쯤 걸려요.')).toBeTruthy()
  })

  it('AC-3303.4 파일을 읽는 중이면 progress가 있어도 파일 글이다', () => {
    draw('ready', { job: 'file', progress: PROGRESS })
    expect(screen.getByText('파일을 이 PC 안에서 읽는 중이에요.')).toBeTruthy()
    expect(screen.queryByText(PROGRESS)).toBeNull()
  })

  it("AC-3303.4 나눠 읽는 동안 [비트에서 불러오기]('불러오는 중')·[파일 고르기]·불러올 기간 단추가 막힌다", () => {
    draw('ready', { job: 'bit', progress: PROGRESS })
    const load = screen.getByRole('button', { name: '불러오는 중' })
    expect(load.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('button', { name: '파일 고르기' }).getAttribute('aria-disabled')).toBe('true')
    for (const name of SPAN_NAMES) expect(spanButton(name).disabled).toBe(true)
    fireEvent.click(load)
    expect(onLoad).not.toHaveBeenCalled()
  })
})

// ── 불러오기 띠 (stats-pc-ux REQ-4001 TASK-4, 시안 docs/mockups/stats-pc-ux notes.md §1, design.md 'SourcePicker.tsx 바뀜') ──
// 상자 = 띠(왼쪽 자료 글 · 오른쪽 [비트에서 불러오기] + [불러오기 설정]) + 펼칠 칸(hidden). 펼침 = 사용자가 고른 값 ?? (!canFold || 주의 상태)

const SETTINGS = '불러오기 설정'
const PRIVACY = '환자 개인정보는 의원 PC 밖으로 나가지 않아요. 서버에는 숫자만 저장해요.'
const DROP_TEXT = '또는 비트에서 내보낸 파일을 여기에 끌어다 놓아요'
const SUMMARY = '자료: 가짜 자료 글'
const toggle = () => screen.getByRole('button', { name: SETTINGS })
const foldPanel = () => document.getElementById(toggle().getAttribute('aria-controls') ?? '') as HTMLElement
const band = () => foldPanel().previousElementSibling as HTMLElement
const box = () => foldPanel().parentElement as HTMLElement
const expanded = () => toggle().getAttribute('aria-expanded')
const folded = (state: BridgeState = 'ready', over: Over = {}) => draw(state, { canFold: true, summary: <p>{SUMMARY}</p>, ...over })
// 주의 상태 여섯(design.md: 끊김 · 바쁨 · 연결 확인 오류 · 도우미 없음 · 도우미/확장 업데이트)
const CAUTION: [string, BridgeState, string | null][] = [
  ['연결 끊김', 'disconnected', null],
  ['바쁨', 'busy', null],
  ['연결 확인 오류', 'connecting', 'E-BRIDGE-BAD-REPLY'],
  ['도우미 없음', 'no-helper', null],
  ['도우미 업데이트', 'update-helper', null],
  ['확장 업데이트', 'update-extension', null],
]

describe('REQ-4001 불러오기 상자를 한 줄 띠로 접기', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('AC-4001.1: canFold면 띠만 보인다 — 왼쪽 자료 글, 오른쪽 [비트에서 불러오기](주 단추) + [불러오기 설정](aria-expanded false, aria-controls = 펼칠 칸), 펼칠 칸은 hidden', () => {
    folded()
    const summary = within(band()).getByText(SUMMARY)
    const load = within(band()).getByRole('button', { name: LOAD })
    expect(tokens(load.className)).toEqual(expect.arrayContaining(tokens(ds.button.primary)))
    expect(band().contains(toggle())).toBe(true)
    expect(summary.compareDocumentPosition(load) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(load.compareDocumentPosition(toggle()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(expanded()).toBe('false')
    expect(toggle().getAttribute('aria-controls')).toBeTruthy()
    expect(foldPanel().hidden).toBe(true)
    expect(classesOf(box())).toEqual(expect.arrayContaining(['bg-canvas', 'rounded-control']))
  })

  it('AC-4001.1: 펼칠 칸 안에 불러올 기간 · 오늘 진료 끝 · 안내 두 줄 · [파일 고르기]와 끌어다 놓기 글 · 개인정보 줄이 있고, 접힌 동안 role로 찾히지 않는다', () => {
    folded()
    for (const text of ['불러올 기간', '오늘 진료 끝', HINTS[0]!, CLOSE_OFF, '파일 고르기', DROP_TEXT, PRIVACY]) {
      expect(foldPanel().textContent, text).toContain(text)
      expect(band().textContent, text).not.toContain(text)
    }
    expect(foldPanel().contains(screen.getByText(PRIVACY))).toBe(true)
    expect(screen.queryByRole('button', { name: '파일 고르기' })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('group', { name: '불러올 기간' })).toBeNull()
  })

  it('AC-4001.1: canFold를 주지 않으면 지금처럼 펼친 채다', () => {
    draw()
    expect(expanded()).toBe('true')
    expect(foldPanel().hidden).toBe(false)
    expect(screen.getByRole('button', { name: '파일 고르기' })).toBeTruthy()
    expect(screen.getByRole('group', { name: '불러올 기간' })).toBeTruthy()
  })

  it('AC-4001.2: [불러오기 설정]을 누르면 펼치고(aria-expanded true, 꺾쇠 180°) 다시 누르면 접는다. 펼친 칸 안 단추는 지금과 같다', () => {
    folded()
    const chev = () => toggle().querySelector('svg')?.getAttribute('class') ?? ''
    expect(chev()).not.toContain('rotate-180')
    fireEvent.click(toggle())
    expect(expanded()).toBe('true')
    expect(foldPanel().hidden).toBe(false)
    expect(chev()).toContain('rotate-180')
    expect(pressed()).toEqual(['true', 'false', 'false', 'false'])
    expect((screen.getByRole('checkbox', { name: '오늘 진료 끝' }) as HTMLInputElement).disabled).toBe(false)
    expect(screen.getByRole('button', { name: '파일 고르기' }).getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(toggle())
    expect(expanded()).toBe('false')
    expect(foldPanel().hidden).toBe(true)
    expect(chev()).not.toContain('rotate-180')
  })

  it('AC-4001.2: 펼친 채 일이 있으면 불러올 기간·오늘 진료 끝·파일이 지금처럼 막힌다', () => {
    folded('ready', { job: 'bit' })
    fireEvent.click(toggle())
    for (const name of SPAN_NAMES) expect(spanButton(name).disabled).toBe(true)
    expect((screen.getByRole('checkbox', { name: '오늘 진료 끝' }) as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: '파일 고르기' }).getAttribute('aria-disabled')).toBe('true')
  })

  it('AC-4001.3: 펼쳐 고른 불러올 기간·오늘 진료 끝은 접은 뒤에도 남고, 접은 채 띠의 [비트에서 불러오기]가 그 값으로 onLoad를 부른다', () => {
    folded()
    fireEvent.click(within(band()).getByRole('button', { name: LOAD }))
    expect(onLoad).toHaveBeenLastCalledWith(false, 'view')

    fireEvent.click(toggle())
    fireEvent.click(spanButton('최근 2년'))
    fireEvent.click(screen.getByRole('checkbox', { name: '오늘 진료 끝' }))
    fireEvent.click(toggle())
    expect(foldPanel().hidden).toBe(true)
    fireEvent.click(within(band()).getByRole('button', { name: LOAD }))
    expect(onLoad).toHaveBeenLastCalledWith(true, '2y')
    expect(onLoad).toHaveBeenCalledTimes(2)

    fireEvent.click(toggle())
    expect(pressed()).toEqual(['false', 'false', 'true', 'false'])
    expect((screen.getByRole('checkbox', { name: '오늘 진료 끝' }) as HTMLInputElement).checked).toBe(true)
  })

  it('AC-4001.3: 접은 채 일이 있으면 띠 단추가 막히고 비트 일 중에는 "불러오는 중"이다', () => {
    const { rerender } = folded('ready', { job: 'bit' })
    const busy = within(band()).getByRole('button', { name: '불러오는 중' })
    expect(busy.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(busy)
    expect(onLoad).not.toHaveBeenCalled()
    for (const job of ['file', 'save'] as const) {
      rerender(picker('ready', { canFold: true, job }))
      const load = within(band()).getByRole('button', { name: LOAD })
      expect(load.getAttribute('aria-disabled')).toBe('true')
      fireEvent.click(load)
    }
    expect(onLoad).not.toHaveBeenCalled()
    expect(foldPanel().hidden).toBe(true)
  })

  it.each(CAUTION)('AC-4001.5: %s는 canFold여도 펼친 채이고 [비트에서 불러오기]가 없다', (_name, state, helloError) => {
    folded(state, { helloError })
    expect(expanded()).toBe('true')
    expect(foldPanel().hidden).toBe(false)
    expect(screen.queryByRole('button', { name: LOAD, hidden: true })).toBeNull()
  })

  it.each(CAUTION)('AC-4001.5: 접어 둔 뒤 %s로 바뀌면 다시 펼치고, 그 뒤 [불러오기 설정]으로 접을 수 있다', (_name, state, helloError) => {
    const { rerender } = folded()
    fireEvent.click(toggle())
    fireEvent.click(toggle()) // 사용자가 펼쳤다가 접었다
    expect(foldPanel().hidden).toBe(true)
    rerender(picker(state, { canFold: true, helloError }))
    expect(expanded()).toBe('true')
    expect(foldPanel().hidden).toBe(false)
    fireEvent.click(toggle())
    expect(expanded()).toBe('false')
    rerender(picker(state, { canFold: true, helloError }))
    expect(expanded()).toBe('false')
  })

  it("AC-4001.5: [비트에서 불러오기]는 'ready'일 때만 띠에 있다. 연결을 확인하는 중(오류 없음)은 canFold면 접힌 채이고 단추가 아직 없다", () => {
    folded('connecting')
    expect(expanded()).toBe('false')
    expect(screen.queryByRole('button', { name: LOAD, hidden: true })).toBeNull()
    expect(within(band()).getAllByRole('button').map((button) => button.textContent)).toEqual([SETTINGS])
  })

  it("AC-4001.5: 확장 없음은 띠에 [불러오기 설정]만 있고, 펼치면 '비트 PC의 크롬에서 불러올 수 있어요' 안내와 [파일 고르기]다", () => {
    folded('no-extension')
    expect(expanded()).toBe('false')
    expect(within(band()).getAllByRole('button').map((button) => button.textContent)).toEqual([SETTINGS])
    fireEvent.click(toggle())
    expect(within(foldPanel()).getByText('비트 PC의 크롬에서 불러올 수 있어요')).toBeTruthy()
    expect(within(foldPanel()).getByRole('button', { name: '파일 고르기' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: LOAD, hidden: true })).toBeNull()
  })

  it('AC-4001.7: 펼친 칸은 1024px 이상 두 칸(lg:flex-row, 파일 칸 lg:border-l)이고 미만은 파일 칸이 아래로 가며 가로줄(max-lg:border-t)이다', () => {
    draw()
    const file = screen.getByRole('button', { name: '파일 고르기' }).parentElement!
    expect(classesOf(file)).toEqual(expect.arrayContaining(['lg:border-l', 'max-lg:border-t']))
    expect(classesOf(file)).not.toContain('border-l')
    expect(classesOf(file)).not.toContain('max-md:border-t')
    const cols = file.parentElement!
    expect(classesOf(cols)).toEqual(expect.arrayContaining(['flex', 'flex-col', 'lg:flex-row']))
    expect(cols.firstElementChild?.contains(spanGroup())).toBe(true)
    expect(cols.lastElementChild).toBe(file)
    expect(foldPanel().contains(cols)).toBe(true)
  })

  it('AC-4001.7: 접힌 채·펼친 채 모두 상자 안 상자가 없다', () => {
    const { container } = folded()
    expect(nestedBoxes(container)).toEqual([])
    fireEvent.click(toggle())
    expect(nestedBoxes(container)).toEqual([])
  })

  it('AC-4001.7: 접힌 채 띠(자료 글 위)에 끌어다 놓아도 파일을 받고 브라우저가 열지 않는다', () => {
    folded()
    const file = fileNamed('가짜환자.xlsx')
    const place = screen.getByText(SUMMARY)
    expect(fireEvent.dragOver(place, { dataTransfer: { files: [file] } })).toBe(false)
    expect(fireEvent.drop(place, { dataTransfer: { files: [file] } })).toBe(false)
    expect(onFiles).toHaveBeenCalledWith([file])
  })

  it('AC-4001.7: 읽는 중 줄은 상자 바로 아래다', () => {
    folded('ready', { job: 'bit' })
    const working = screen.getByText('비트 PC에서 읽는 중이에요. 기간이 길면 1분쯤 걸려요.').closest('p')
    expect(working?.previousElementSibling).toBe(box())
  })

  it('AC-4001.8: 펼침은 다시 그리면 처음 규칙으로 돌아가고 브라우저 저장소·서버에 아무것도 쓰지 않는다', () => {
    const stored = vi.spyOn(Storage.prototype, 'setItem')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const first = folded()
    fireEvent.click(toggle())
    expect(expanded()).toBe('true')
    first.unmount()
    folded()
    expect(expanded()).toBe('false')
    expect(stored).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
